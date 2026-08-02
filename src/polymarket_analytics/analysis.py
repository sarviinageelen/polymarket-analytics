"""Trade replay and bettor ranking logic."""

from __future__ import annotations

import ast
import csv
import json
import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator


def parse_jsonish(value: Any, default: Any = None) -> Any:
    """Parse Gamma fields that are returned either as JSON strings or arrays."""

    if value is None:
        return default
    if isinstance(value, (list, dict, int, float, bool)):
        return value
    if not isinstance(value, str):
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        try:
            return ast.literal_eval(value)
        except (ValueError, SyntaxError):
            return default


def epoch_seconds(value: str) -> int:
    """Convert an ISO timestamp to epoch seconds."""

    normalized = value.replace("Z", "+00:00")
    return int(datetime.fromisoformat(normalized).replace(tzinfo=timezone.utc).timestamp())


def compact_market_index(events: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Flatten nested Gamma event/market payloads into a condition-id index."""

    index: dict[str, dict[str, Any]] = {}
    for event in events:
        event_id = str(event.get("id", ""))
        event_date = event.get("eventDate") or event.get("startTime") or ""
        for market in event.get("markets") or []:
            condition_id = market.get("conditionId")
            if not condition_id:
                continue
            outcomes = parse_jsonish(market.get("outcomes"), []) or []
            prices = parse_jsonish(market.get("outcomePrices"), []) or []
            try:
                prices = [float(price) for price in prices]
            except (TypeError, ValueError):
                prices = []
            index[condition_id] = {
                "condition_id": condition_id,
                "market_id": str(market.get("id", "")),
                "event_id": event_id,
                "event_slug": event.get("slug", ""),
                "event_date": str(event_date)[:10],
                "event_week": event.get("eventWeek", ""),
                "title": market.get("question") or event.get("title", ""),
                "slug": market.get("slug", ""),
                "market_type": market.get("sportsMarketType") or "unknown",
                "line": market.get("line", ""),
                "outcomes": outcomes,
                "outcome_prices": prices,
                "token_ids": parse_jsonish(market.get("clobTokenIds"), []) or [],
                "volume_usd": float(market.get("volumeNum") or market.get("volume") or 0),
                "closed_time": market.get("closedTime") or event.get("closedTime", ""),
            }
    return index


def write_market_csv(index: dict[str, dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "condition_id",
        "market_id",
        "event_id",
        "event_slug",
        "event_date",
        "event_week",
        "title",
        "slug",
        "market_type",
        "line",
        "outcomes",
        "outcome_prices",
        "token_ids",
        "volume_usd",
        "closed_time",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in index.values():
            output = dict(row)
            output["outcomes"] = json.dumps(output["outcomes"], separators=(",", ":"))
            output["outcome_prices"] = json.dumps(output["outcome_prices"], separators=(",", ":"))
            output["token_ids"] = json.dumps(output["token_ids"], separators=(",", ":"))
            writer.writerow({field: output.get(field, "") for field in fields})


@dataclass
class MarketLedger:
    wallet: str
    condition_id: str
    market: dict[str, Any]
    cash_flow: float = 0.0
    buy_cost: float = 0.0
    sell_proceeds: float = 0.0
    gross_volume: float = 0.0
    trade_count: int = 0
    net_shares: dict[int, float] = field(default_factory=lambda: defaultdict(float))
    first_timestamp: int | None = None
    last_timestamp: int | None = None
    name: str = ""
    pseudonym: str = ""

    def add_trade(self, row: dict[str, Any]) -> None:
        side = str(row.get("side", "")).upper()
        size = float(row.get("size") or 0)
        price = float(row.get("price") or 0)
        outcome_index = int(row.get("outcomeIndex") or 0)
        cash = size * price
        if side == "BUY":
            self.cash_flow -= cash
            self.buy_cost += cash
            self.net_shares[outcome_index] += size
        elif side == "SELL":
            self.cash_flow += cash
            self.sell_proceeds += cash
            self.net_shares[outcome_index] -= size
        else:
            return
        self.trade_count += 1
        self.gross_volume += cash
        timestamp = int(row.get("timestamp") or 0)
        self.first_timestamp = timestamp if self.first_timestamp is None else min(self.first_timestamp, timestamp)
        self.last_timestamp = timestamp if self.last_timestamp is None else max(self.last_timestamp, timestamp)
        self.name = self.name or str(row.get("name") or "")
        self.pseudonym = self.pseudonym or str(row.get("pseudonym") or "")

    @property
    def settlement_value(self) -> float:
        prices = self.market.get("outcome_prices") or []
        return sum(shares * float(prices[idx]) for idx, shares in self.net_shares.items() if idx < len(prices))

    @property
    def pnl(self) -> float:
        return self.cash_flow + self.settlement_value


def _trade_files(trade_dir: Path) -> Iterator[Path]:
    yield from sorted(trade_dir.glob("*.jsonl"))
    yield from sorted(trade_dir.glob("*.jsonl.gz"))


def iter_trade_rows(trade_dir: Path) -> Iterator[dict[str, Any]]:
    import gzip

    for path in _trade_files(trade_dir):
        opener = gzip.open if path.suffix == ".gz" else open
        with opener(path, "rt", encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    yield json.loads(line)


def replay_trades(
    trades: Iterable[dict[str, Any]],
    market_index: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Replay public trades into market ledgers and wallet summaries."""

    ledgers: dict[tuple[str, str], MarketLedger] = {}
    for row in trades:
        condition_id = row.get("conditionId")
        wallet = str(row.get("proxyWallet") or "").lower()
        if not condition_id or not wallet or condition_id not in market_index:
            continue
        key = (wallet, condition_id)
        ledger = ledgers.get(key)
        if ledger is None:
            ledger = MarketLedger(wallet=wallet, condition_id=condition_id, market=market_index[condition_id])
            ledgers[key] = ledger
        ledger.add_trade(row)

    market_rows: list[dict[str, Any]] = []
    for ledger in ledgers.values():
        pnl = ledger.pnl
        market = ledger.market
        market_rows.append(
            {
                "wallet": ledger.wallet,
                "name": ledger.name,
                "pseudonym": ledger.pseudonym,
                "condition_id": ledger.condition_id,
                "event_id": market["event_id"],
                "event_slug": market["event_slug"],
                "event_date": market["event_date"],
                "event_week": market["event_week"],
                "title": market["title"],
                "market_type": market["market_type"],
                "line": market["line"],
                "pnl": pnl,
                "buy_cost": ledger.buy_cost,
                "sell_proceeds": ledger.sell_proceeds,
                "gross_volume": ledger.gross_volume,
                "settlement_value": ledger.settlement_value,
                "trade_count": ledger.trade_count,
                "first_timestamp": ledger.first_timestamp or 0,
                "last_timestamp": ledger.last_timestamp or 0,
                "result": "win" if pnl > 1e-9 else "loss" if pnl < -1e-9 else "flat",
            }
        )

    summaries: dict[str, dict[str, Any]] = {}
    weekly: dict[tuple[str, str], float] = defaultdict(float)
    for row in market_rows:
        wallet = row["wallet"]
        summary = summaries.setdefault(
            wallet,
            {
                "wallet": wallet,
                "name": row["name"],
                "pseudonym": row["pseudonym"],
                "total_pnl": 0.0,
                "buy_cost": 0.0,
                "sell_proceeds": 0.0,
                "gross_volume": 0.0,
                "markets": 0,
                "wins": 0,
                "losses": 0,
                "flats": 0,
                "trade_count": 0,
                "market_types": defaultdict(lambda: {"pnl": 0.0, "buy_cost": 0.0, "markets": 0}),
            },
        )
        summary["name"] = summary["name"] or row["name"]
        summary["pseudonym"] = summary["pseudonym"] or row["pseudonym"]
        for field in ("total_pnl", "buy_cost", "sell_proceeds", "gross_volume"):
            source = "pnl" if field == "total_pnl" else field
            summary[field] += float(row[source])
        summary["markets"] += 1
        summary["trade_count"] += int(row["trade_count"])
        result_field = {"win": "wins", "loss": "losses", "flat": "flats"}[row["result"]]
        summary[result_field] += 1
        market_type = row["market_type"]
        type_summary = summary["market_types"][market_type]
        type_summary["pnl"] += float(row["pnl"])
        type_summary["buy_cost"] += float(row["buy_cost"])
        type_summary["markets"] += 1
        weekly[(wallet, row["event_date"])] += float(row["pnl"])

    output_summaries: list[dict[str, Any]] = []
    weekly_by_wallet: dict[str, dict[str, float]] = defaultdict(dict)
    for (wallet, event_date), pnl in weekly.items():
        weekly_by_wallet[wallet][event_date] = pnl
    for summary in summaries.values():
        settled = summary["wins"] + summary["losses"]
        wallet_weekly = weekly_by_wallet.get(summary["wallet"], {})
        weeks = sorted(wallet_weekly)
        weekly_pnls = [wallet_weekly[week] for week in weeks]
        running = 0.0
        peak = 0.0
        max_drawdown = 0.0
        for pnl in weekly_pnls:
            running += pnl
            peak = max(peak, running)
            max_drawdown = max(max_drawdown, peak - running)
        buy_cost = summary["buy_cost"]
        pnl = summary["total_pnl"]
        summary["win_rate"] = summary["wins"] / settled if settled else 0.0
        summary["roi"] = pnl / buy_cost if buy_cost else math.nan
        summary["active_weeks"] = len(weeks)
        summary["positive_weeks"] = sum(1 for value in weekly_pnls if value > 1e-9)
        summary["weekly_win_rate"] = summary["positive_weeks"] / len(weeks) if weeks else 0.0
        summary["max_weekly_drawdown"] = max_drawdown
        summary["market_types"] = json.dumps(summary["market_types"], sort_keys=True)
        output_summaries.append(summary)

    output_summaries.sort(key=lambda row: (row["total_pnl"], row["buy_cost"]), reverse=True)
    market_rows.sort(key=lambda row: (row["pnl"], row["buy_cost"]), reverse=True)
    return output_summaries, market_rows


def write_csv(rows: list[dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fields = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
