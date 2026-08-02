"""Command-line entrypoint for collection, replay, and validation."""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from .analysis import compact_market_index, replay_trades, write_csv, write_market_csv
from .api import APIError, PolymarketAPI


SEASON_START_TS = 1756944000  # 2025-09-04 00:00:00 UTC
SEASON_END_TS = 1770595200  # 2026-02-09 00:00:00 UTC


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")


def _read_json(path: Path) -> Any | None:
    """Read a cached JSON snapshot, returning None if it is absent or invalid."""

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _write_trades(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, separators=(",", ":")) + "\n")


def _collect_one(
    api: PolymarketAPI,
    event: dict[str, Any],
    out_dir: Path,
    taker_only: bool,
    force: bool,
) -> dict[str, Any]:
    event_id = str(event["id"])
    path = out_dir / "trades" / f"{event_id}.jsonl.gz"
    if path.exists() and not force:
        return {"event_id": event_id, "rows": sum(1 for _ in _read_gzip_lines(path)), "status": "cached"}
    rows = api.fetch_event_trades(
        event_id,
        start_ts=SEASON_START_TS,
        end_ts=SEASON_END_TS,
        taker_only=taker_only,
    )
    _write_trades(path, rows)
    return {"event_id": event_id, "rows": len(rows), "status": "fetched"}


def _read_gzip_lines(path: Path):
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        yield from handle


def collect(args: argparse.Namespace) -> int:
    api = PolymarketAPI()
    out_dir = Path(args.out_dir)
    raw_dir = out_dir / "raw"
    derived_dir = out_dir / "derived"
    events_path = raw_dir / "nfl_2025_events.json"
    cached_events = None if args.force else _read_json(events_path)
    if isinstance(cached_events, list) and cached_events:
        events = cached_events
        metadata_status = "cached"
    else:
        events = api.fetch_season_events(series_id=args.series_id)
        _write_json(events_path, events)
        metadata_status = "fetched"
    market_index = compact_market_index(events)
    write_market_csv(market_index, derived_dir / "nfl_2025_markets.csv")

    leaderboards = {}
    leaderboard_status = "cached"
    for name, order_by in (("sports_all_pnl", "PNL"), ("sports_all_volume", "VOL")):
        path = raw_dir / f"{name}.json"
        cached_rows = None if args.force else _read_json(path)
        if isinstance(cached_rows, list):
            leaderboards[name] = cached_rows
        else:
            leaderboards[name] = api.fetch_sports_leaderboard(order_by=order_by)
            _write_json(path, leaderboards[name])
            leaderboard_status = "fetched"

    selected_events = events[: args.max_events] if args.max_events else events
    manifest: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {
            executor.submit(_collect_one, api, event, raw_dir, args.taker_only, args.force): event
            for event in selected_events
        }
        for future in as_completed(futures):
            event = futures[future]
            try:
                result = future.result()
                manifest.append(result)
                print(f"{result['status']:>7} event={result['event_id']} trades={result['rows']}")
            except APIError as exc:
                failure = {"event_id": str(event["id"]), "error": str(exc)}
                failures.append(failure)
                print(f"failed event={event['id']}: {exc}", file=sys.stderr)

    manifest.sort(key=lambda row: int(row["event_id"]))
    _write_json(raw_dir / "trade_manifest.json", {"events": manifest, "failures": failures})
    print(
        json.dumps(
            {
                "events_in_series": len(events),
                "events_collected": len(manifest),
                "trade_rows": sum(row["rows"] for row in manifest),
                "markets": len(market_index),
                "failures": len(failures),
                "taker_only": args.taker_only,
                "metadata": metadata_status,
                "leaderboards": leaderboard_status,
            },
            indent=2,
        )
    )
    return 1 if failures else 0


def analyze(args: argparse.Namespace) -> int:
    root = Path(args.data_dir)
    events = json.loads((root / "raw" / "nfl_2025_events.json").read_text(encoding="utf-8"))
    market_index = compact_market_index(events)
    from .analysis import iter_trade_rows

    summaries, market_rows = replay_trades(iter_trade_rows(root / "raw" / "trades"), market_index)
    result_dir = root / "results"
    write_csv(summaries, result_dir / "bettor_ranking.csv")
    write_csv(market_rows, result_dir / "market_pnl.csv")
    top = summaries[: args.top]

    roi_candidates = [
        row
        for row in summaries
        if row["markets"] >= 10
        and row["buy_cost"] >= 100_000
        and math.isfinite(float(row["roi"]))
    ]
    roi_candidates.sort(key=lambda row: (row["roi"], row["total_pnl"]), reverse=True)
    write_csv(roi_candidates, result_dir / "bettor_ranking_roi.csv")

    consistency_candidates = [
        row
        for row in summaries
        if row["markets"] >= 20
        and row["active_weeks"] >= 10
        and row["buy_cost"] >= 100_000
        and row["total_pnl"] > 0
    ]
    consistency_candidates.sort(
        key=lambda row: (row["weekly_win_rate"], row["active_weeks"], row["total_pnl"]),
        reverse=True,
    )
    write_csv(consistency_candidates, result_dir / "bettor_ranking_consistency.csv")

    market_types: dict[str, dict[str, Any]] = {}
    type_wallets: dict[str, set[str]] = {}
    for row in market_rows:
        market_type = row["market_type"]
        aggregate = market_types.setdefault(
            market_type,
            {
                "market_type": market_type,
                "pnl": 0.0,
                "buy_cost": 0.0,
                "sell_proceeds": 0.0,
                "gross_volume": 0.0,
                "market_ledgers": 0,
                "trade_count": 0,
                "wins": 0,
                "losses": 0,
                "flats": 0,
            },
        )
        for field in ("pnl", "buy_cost", "sell_proceeds", "gross_volume"):
            aggregate[field] += float(row[field])
        aggregate["market_ledgers"] += 1
        aggregate["trade_count"] += int(row["trade_count"])
        result_field = {"win": "wins", "loss": "losses", "flat": "flats"}[row["result"]]
        aggregate[result_field] += 1
        type_wallets.setdefault(market_type, set()).add(row["wallet"])
    market_type_rows = []
    for market_type, aggregate in market_types.items():
        output = dict(aggregate)
        output["bettors"] = len(type_wallets[market_type])
        output["roi"] = output["pnl"] / output["buy_cost"] if output["buy_cost"] else math.nan
        market_type_rows.append(output)
    market_type_rows.sort(key=lambda row: row["pnl"], reverse=True)
    write_csv(market_type_rows, result_dir / "market_type_summary.csv")

    _write_json(
        result_dir / "summary.json",
        {
            "season": "NFL 2025",
            "events": len(events),
            "markets": len(market_index),
            "bettors_with_trades": len(summaries),
            "market_ledgers": len(market_rows),
            "ranking_basis": "trade replay against final Gamma outcomePrices",
            "roi_view_filters": {"minimum_markets": 10, "minimum_buy_cost": 100_000},
            "consistency_view_filters": {
                "minimum_markets": 20,
                "minimum_active_weeks": 10,
                "minimum_buy_cost": 100_000,
                "minimum_pnl": 0,
            },
            "top_bettors": top,
            "top_roi_bettors": roi_candidates[: args.top],
            "top_consistent_bettors": consistency_candidates[: args.top],
        },
    )
    for rank, row in enumerate(top, start=1):
        print(
            f"{rank:>3} {row['name'] or row['pseudonym'] or row['wallet'][:10]} "
            f"pnl=${row['total_pnl']:,.2f} roi={row['roi']:.2%} "
            f"markets={row['markets']} win_rate={row['win_rate']:.1%}"
        )
    print(json.dumps({"bettors": len(summaries), "market_ledgers": len(market_rows)}, indent=2))
    return 0


def validate(args: argparse.Namespace) -> int:
    root = Path(args.data_dir)
    events = json.loads((root / "raw" / "nfl_2025_events.json").read_text(encoding="utf-8"))
    ranking_path = root / "results" / "bettor_ranking.csv"
    with ranking_path.open(newline="", encoding="utf-8") as handle:
        ranking = list(csv.DictReader(handle))[: args.top]
    replay_by_wallet: dict[str, dict[str, float]] = defaultdict(dict)
    market_pnl_path = root / "results" / "market_pnl.csv"
    with market_pnl_path.open(newline="", encoding="utf-8") as handle:
        for market_row in csv.DictReader(handle):
            replay_by_wallet[market_row["wallet"]][market_row["condition_id"]] = float(
                market_row["pnl"]
            )
    api = PolymarketAPI()
    event_ids = [event["id"] for event in events]
    rows: list[dict[str, Any]] = []
    for position, bettor in enumerate(ranking, start=1):
        user = bettor["wallet"]
        closed = api.fetch_closed_positions(user, event_ids)
        closed_by_market: dict[str, float] = defaultdict(float)
        closed_cost = 0.0
        for closed_row in closed:
            condition_id = str(closed_row.get("conditionId") or "")
            if condition_id:
                closed_by_market[condition_id] += float(closed_row.get("realizedPnl") or 0)
            closed_cost += float(closed_row.get("totalBought") or 0)
        replay_markets = replay_by_wallet.get(user, {})
        overlap = set(replay_markets).intersection(closed_by_market)
        overlap_replay_pnl = sum(replay_markets[condition_id] for condition_id in overlap)
        overlap_closed_pnl = sum(closed_by_market[condition_id] for condition_id in overlap)
        rows.append(
            {
                "rank": position,
                "wallet": user,
                "name": bettor.get("name", ""),
                "trade_replay_pnl": float(bettor["total_pnl"]),
                "closed_positions_pnl_partial": sum(closed_by_market.values()),
                "full_replay_minus_partial_closed": float(bettor["total_pnl"])
                - sum(closed_by_market.values()),
                "trade_replay_buy_cost": float(bettor["buy_cost"]),
                "closed_positions_total_bought": closed_cost,
                "replay_market_count": len(replay_markets),
                "closed_position_unique_markets": len(closed_by_market),
                "overlap_markets": len(overlap),
                "closed_position_market_coverage": len(overlap) / len(replay_markets)
                if replay_markets
                else 0.0,
                "overlap_trade_replay_pnl": overlap_replay_pnl,
                "overlap_closed_positions_pnl": overlap_closed_pnl,
                "overlap_difference": overlap_replay_pnl - overlap_closed_pnl,
                "closed_position_rows": len(closed),
            }
        )
        print(f"validated {position}/{len(ranking)} {user}")
    write_csv(rows, root / "results" / "closed_position_validation.csv")
    print(json.dumps({"validated": len(rows)}, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    collect_parser = subparsers.add_parser("collect", help="Fetch NFL 2025 metadata and public trades")
    collect_parser.add_argument("--series-id", type=int, default=10187)
    collect_parser.add_argument("--out-dir", default="data")
    collect_parser.add_argument("--workers", type=int, default=4)
    collect_parser.add_argument("--max-events", type=int)
    collect_parser.add_argument("--taker-only", action="store_true")
    collect_parser.add_argument("--force", action="store_true")
    collect_parser.set_defaults(func=collect)

    analyze_parser = subparsers.add_parser("analyze", help="Replay collected trades and rank bettors")
    analyze_parser.add_argument("--data-dir", default="data")
    analyze_parser.add_argument("--top", type=int, default=25)
    analyze_parser.set_defaults(func=analyze)

    validate_parser = subparsers.add_parser("validate", help="Compare trade replay with Data API closed positions")
    validate_parser.add_argument("--data-dir", default="data")
    validate_parser.add_argument("--top", type=int, default=10)
    validate_parser.set_defaults(func=validate)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
