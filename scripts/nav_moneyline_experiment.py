"""Fetch the NFL 2025 full-time moneyline universe with Nav1212's ETL pieces.

This adapter deliberately keeps the upstream repository's rate limiter and
Parquet persister, but owns the market selection and pagination. The upstream
trade worker's default loop is not suitable for this experiment because it
resets offsets at 1,000 and does not expose the maker-inclusive/timestamp
filters needed for a complete historical census.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import pyarrow as pa


ROOT = Path(__file__).resolve().parents[1]
NAV_ROOT = ROOT / "external" / "Nav1212-PolyMarketAnalytics"
sys.path.insert(0, str(NAV_ROOT))

from fetcher.config import get_config  # noqa: E402
from fetcher.persistence import parquet_persister  # noqa: E402
from fetcher.persistence.parquet_persister import DataType, ParquetPersister  # noqa: E402
from fetcher.persistence.swappable_queue import SwappableQueue  # noqa: E402
from fetcher.workers.trade_fetcher import TradeFetcher  # noqa: E402
from fetcher.workers.worker_manager import WorkerManager  # noqa: E402


PAGE_SIZE = 10_000
RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}

TRADE_SCHEMA = pa.schema(
    [
        ("proxyWallet", pa.string()),
        ("side", pa.string()),
        ("asset", pa.string()),
        ("price", pa.float64()),
        ("size", pa.float64()),
        ("conditionId", pa.string()),
        ("timestamp", pa.int64()),
        ("transactionHash", pa.string()),
        ("outcome", pa.string()),
        ("outcomeIndex", pa.int64()),
        ("name", pa.string()),
        ("pseudonym", pa.string()),
        ("eventSlug", pa.string()),
        ("title", pa.string()),
        ("event_id", pa.string()),
        ("market_type", pa.string()),
        ("season", pa.string()),
        ("market_start_ts", pa.int64()),
        ("market_end_ts", pa.int64()),
    ]
)


def epoch(value: Any) -> int:
    if value is None or value == "":
        return 0
    text = str(value).replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp())


def parse_jsonish(value: Any, default: Any) -> Any:
    if isinstance(value, (list, dict)):
        return value
    if not isinstance(value, str):
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def load_moneyline_markets(events_path: Path) -> list[dict[str, Any]]:
    events = json.loads(events_path.read_text(encoding="utf-8"))
    markets: list[dict[str, Any]] = []
    for event in events:
        for market in event.get("markets") or []:
            if market.get("sportsMarketType") != "moneyline":
                continue
            condition_id = market.get("conditionId")
            if not condition_id:
                continue
            start_ts = epoch(market.get("createdAt") or market.get("startDate"))
            end_ts = epoch(market.get("endDate") or market.get("closedTime"))
            if not start_ts:
                start_ts = epoch(event.get("startTime"))
            if not end_ts or end_ts < start_ts:
                end_ts = int(time.time())
            markets.append(
                {
                    "condition_id": str(condition_id),
                    "event_id": str(event.get("id", "")),
                    "event_slug": event.get("slug", ""),
                    "title": market.get("question") or event.get("title", ""),
                    "market_type": "moneyline",
                    "season": "nfl-2025",
                    "market_start_ts": start_ts,
                    "market_end_ts": end_ts,
                    "outcomes": parse_jsonish(market.get("outcomes"), []),
                    "outcome_prices": parse_jsonish(market.get("outcomePrices"), []),
                    "slug": market.get("slug", ""),
                    "event_date": str(event.get("eventDate", ""))[:10],
                }
            )
    return markets


class NavScopedTradeFetcher(TradeFetcher):
    """Use Nav's HTTP client/rate limiter with complete public trade params."""

    def fetch_page(
        self,
        condition_id: str,
        start_ts: int,
        end_ts: int,
        offset: int,
    ) -> list[dict[str, Any]]:
        params = {
            "market": condition_id,
            "limit": PAGE_SIZE,
            "offset": offset,
            "takerOnly": "false",
            "start": start_ts,
            "end": end_ts,
        }
        for attempt in range(6):
            self._manager.acquire_trade()
            try:
                response = self.client.get(f"{self._data_api_base}/trades", params=params)
                if response.status_code in RETRYABLE_STATUS:
                    raise httpx.HTTPStatusError(
                        f"retryable status {response.status_code}",
                        request=response.request,
                        response=response,
                    )
                response.raise_for_status()
                payload = response.json()
                if isinstance(payload, dict):
                    payload = payload.get("data", [])
                return payload if isinstance(payload, list) else []
            except (httpx.HTTPError, ValueError):
                if attempt == 5:
                    raise
                time.sleep(min(30.0, 2**attempt) + 0.1 * attempt)
        raise RuntimeError("unreachable")

    def fetch_window(self, condition_id: str, start_ts: int, end_ts: int) -> list[dict[str, Any]]:
        first = self.fetch_page(condition_id, start_ts, end_ts, 0)
        if len(first) < PAGE_SIZE:
            return first

        second = self.fetch_page(condition_id, start_ts, end_ts, PAGE_SIZE)
        if len(second) < PAGE_SIZE:
            return first + second

        if start_ts >= end_ts:
            raise RuntimeError(f"capped trade window at timestamp {start_ts}")
        midpoint = (start_ts + end_ts) // 2
        return self.fetch_window(condition_id, start_ts, midpoint) + self.fetch_window(
            condition_id, midpoint + 1, end_ts
        )

    def fetch_market(self, market: dict[str, Any]) -> list[dict[str, Any]]:
        rows = self.fetch_window(
            market["condition_id"], market["market_start_ts"], market["market_end_ts"]
        )
        seen: set[tuple[Any, ...]] = set()
        output: list[dict[str, Any]] = []
        for row in rows:
            key = (
                row.get("proxyWallet"),
                row.get("asset"),
                row.get("conditionId"),
                row.get("side"),
                row.get("size"),
                row.get("price"),
                row.get("timestamp"),
                row.get("transactionHash"),
            )
            if key in seen:
                continue
            seen.add(key)
            enriched = dict(row)
            enriched.update(
                {
                    "event_id": market["event_id"],
                    "market_type": market["market_type"],
                    "season": market["season"],
                    "market_start_ts": market["market_start_ts"],
                    "market_end_ts": market["market_end_ts"],
                }
            )
            output.append(enriched)
        return output


def git_revision() -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(NAV_ROOT), "rev-parse", "HEAD"], text=True
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def write_markets(path: Path, markets: list[dict[str, Any]]) -> None:
    rows = []
    for market in markets:
        row = dict(market)
        row["outcomes"] = json.dumps(row["outcomes"], separators=(",", ":"))
        row["outcome_prices"] = json.dumps(row["outcome_prices"], separators=(",", ":"))
        rows.append(row)
    path.parent.mkdir(parents=True, exist_ok=True)
    table = pa.Table.from_pylist(rows)
    import pyarrow.parquet as pq

    pq.write_table(table, path, compression="snappy")


def load_existing_results(trade_dir: Path) -> dict[str, dict[str, Any]]:
    """Recover completed markets from Parquet after an interrupted run."""

    files = list(trade_dir.glob("*.parquet"))
    if not files:
        return {}
    import duckdb

    pattern = str(trade_dir / "*.parquet").replace("'", "''")
    rows = duckdb.sql(
        f"""
        SELECT
            conditionId,
            any_value(event_id),
            any_value(title),
            count(*)
        FROM read_parquet('{pattern}')
        GROUP BY conditionId
        """
    ).fetchall()
    return {
        str(condition_id): {
            "condition_id": str(condition_id),
            "event_id": str(event_id),
            "title": title,
            "rows": int(row_count),
            "status": "recovered",
        }
        for condition_id, event_id, title, row_count in rows
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--events", default="data/raw/nfl_2025_events.json")
    parser.add_argument(
        "--out-dir", default="data/experiments/nav_nfl_2025_moneyline"
    )
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    out_dir = ROOT / args.out_dir
    trade_dir = out_dir / "bronze" / "trades"

    markets = load_moneyline_markets(ROOT / args.events)
    if args.limit:
        markets = markets[: args.limit]
    if not markets:
        raise SystemExit("no NFL 2025 moneyline markets found")
    existing = load_existing_results(trade_dir)
    pending_markets = [market for market in markets if market["condition_id"] not in existing]
    print(f"moneyline markets in scope={len(markets)} recovered={len(existing)} pending={len(pending_markets)}")

    # Reuse Nav1212's Parquet writer, with a schema that preserves the fields
    # needed for our replay instead of the repository's narrower TODO schema.
    parquet_persister.TRADE_SCHEMA = TRADE_SCHEMA
    queue = SwappableQueue(threshold=25_000)
    persister = ParquetPersister(
        queue,
        output_dir=str(trade_dir),
        use_hive_partitioning=False,
        data_type=DataType.TRADE,
    )
    persister.start()

    config = get_config()
    manager = WorkerManager(config=config)
    results: list[dict[str, Any]] = [
        existing[market["condition_id"]]
        for market in markets
        if market["condition_id"] in existing
    ]
    failures: list[dict[str, Any]] = []
    lock = threading.Lock()

    def run_one(market: dict[str, Any]) -> dict[str, Any]:
        fetcher = NavScopedTradeFetcher(config=config, worker_manager=manager)
        try:
            rows = fetcher.fetch_market(market)
            queue.put_many(rows)
            return {
                "condition_id": market["condition_id"],
                "event_id": market["event_id"],
                "title": market["title"],
                "rows": len(rows),
                "status": "fetched",
                "start_ts": market["market_start_ts"],
                "end_ts": market["market_end_ts"],
            }
        finally:
            fetcher.close()

    try:
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
            futures = {executor.submit(run_one, market): market for market in pending_markets}
            for future in as_completed(futures):
                market = futures[future]
                try:
                    result = future.result()
                    with lock:
                        results.append(result)
                    print(f"fetched {result['event_id']} rows={result['rows']} {result['title']}")
                except Exception as exc:  # keep the manifest useful for retries
                    failure = {
                        "condition_id": market["condition_id"],
                        "event_id": market["event_id"],
                        "title": market["title"],
                        "status": "failed",
                        "error": repr(exc),
                    }
                    with lock:
                        failures.append(failure)
                    print(f"failed {market['event_id']} {market['title']}: {exc}", file=sys.stderr)
    finally:
        persister.stop()

    results.sort(key=lambda row: int(row["event_id"]))
    failures.sort(key=lambda row: int(row["event_id"]))
    out_dir.mkdir(parents=True, exist_ok=True)
    write_markets(out_dir / "moneyline_markets.parquet", markets)
    manifest = {
        "source_repo": "https://github.com/Nav1212/PolyMarketAnalytics",
        "source_revision": git_revision(),
        "season": "NFL 2025",
        "market_filter": "sportsMarketType == moneyline",
        "taker_only": False,
        "market_count": len(markets),
        "market_results": results,
        "failures": failures,
        "trade_rows": sum(int(row["rows"]) for row in results),
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({key: manifest[key] for key in ("source_revision", "market_count", "trade_rows", "failures")}, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
