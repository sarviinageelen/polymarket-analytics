"""Analyze a DuckDB sports moneyline snapshot with settled/open separation."""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import duckdb


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EXPERIMENT_DIR = ROOT / "data/experiments/nav_wnba_2026_moneyline"


def write_rows(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = list(rows[0]) if rows else []
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def scalar(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def read_table(conn: duckdb.DuckDBPyConnection, table: str) -> list[dict[str, Any]]:
    result = conn.execute(f"SELECT * FROM {table}")
    columns = [item[0] for item in result.description]
    return [{key: scalar(value) for key, value in zip(columns, row)} for row in result.fetchall()]


def number(value: Any) -> float:
    return float(value or 0.0)


def integer(value: Any) -> int:
    return int(value or 0)


def build_wallet_summaries(ledgers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for row in ledgers:
        wallet = str(row["wallet"]).lower()
        summary = grouped.setdefault(
            wallet,
            {
                "wallet": wallet,
                "name": row.get("name") or "",
                "pseudonym": row.get("pseudonym") or "",
                "markets": 0,
                "settled_markets": 0,
                "open_markets": 0,
                "wins": 0,
                "losses": 0,
                "flats": 0,
                "unsettled": 0,
                "trade_count": 0,
                "buy_cost": 0.0,
                "settled_buy_cost": 0.0,
                "sell_proceeds": 0.0,
                "cash_flow": 0.0,
                "total_pnl": 0.0,
                "mark_to_market_pnl": 0.0,
                "open_exposure": 0.0,
            },
        )
        summary["name"] = summary["name"] or row.get("name") or ""
        summary["pseudonym"] = summary["pseudonym"] or row.get("pseudonym") or ""
        summary["markets"] += 1
        summary["trade_count"] += integer(row.get("trade_count"))
        summary["buy_cost"] += number(row.get("buy_cost"))
        summary["sell_proceeds"] += number(row.get("sell_proceeds"))
        summary["cash_flow"] += number(row.get("cash_flow"))
        summary["mark_to_market_pnl"] += number(row.get("mark_to_market_pnl"))
        settled = row.get("resolution_type") in {"resolved", "tie"}
        if settled:
            summary["settled_markets"] += 1
            summary["settled_buy_cost"] += number(row.get("buy_cost"))
            result = row.get("result")
            if result == "win":
                summary["wins"] += 1
            elif result == "loss":
                summary["losses"] += 1
            else:
                summary["flats"] += 1
            summary["total_pnl"] += number(row.get("realized_pnl"))
        else:
            summary["open_markets"] += 1
            summary["unsettled"] += 1
            summary["open_exposure"] += number(row.get("mark_to_market_value"))

    output = []
    for summary in grouped.values():
        denominator = summary["wins"] + summary["losses"]
        summary["win_rate"] = summary["wins"] / denominator if denominator else 0.0
        summary["roi"] = summary["total_pnl"] / summary["settled_buy_cost"] if summary["settled_buy_cost"] else math.nan
        summary["display_name"] = summary["name"] or summary["pseudonym"] or summary["wallet"]
        output.append(summary)
    return sorted(output, key=lambda row: (row["total_pnl"], row["settled_buy_cost"]), reverse=True)


def candidates(summaries: list[dict[str, Any]], minimum_games: int) -> list[dict[str, Any]]:
    return [
        row
        for row in summaries
        if row["settled_markets"] >= minimum_games
        and row["wins"] + row["losses"] >= minimum_games
        and row["win_rate"] >= 0.70
        and row["settled_buy_cost"] >= 1_000
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--experiment-dir", default=str(DEFAULT_EXPERIMENT_DIR))
    args = parser.parse_args()
    experiment_dir = Path(args.experiment_dir)
    db_path = experiment_dir / "silver" / f"{experiment_dir.name.removeprefix('nav_')}.duckdb"
    if not db_path.exists():
        candidates_db = sorted((experiment_dir / "silver").glob("*.duckdb"))
        if not candidates_db:
            raise SystemExit(f"no DuckDB found under {experiment_dir / 'silver'}")
        db_path = candidates_db[0]

    result_dir = experiment_dir / "results"
    conn = duckdb.connect(str(db_path), read_only=True)
    try:
        ledgers = read_table(conn, "wallet_game_ledger")
        markets = read_table(conn, "market_dim")
    finally:
        conn.close()

    summaries = build_wallet_summaries(ledgers)
    candidate_5 = candidates(summaries, 5)
    candidate_10 = candidates(summaries, 10)
    open_rows = [row for row in ledgers if row.get("resolution_type") not in {"resolved", "tie"}]
    write_rows(result_dir / "market_pnl.csv", ledgers)
    write_rows(result_dir / "bettor_ranking_pnl.csv", summaries)
    write_rows(result_dir / "bettor_candidates_5games_70pct.csv", candidate_5)
    write_rows(result_dir / "bettor_candidates_10games_70pct.csv", candidate_10)
    write_rows(result_dir / "open_exposure.csv", open_rows)

    manifest = json.loads((experiment_dir / "manifest.json").read_text(encoding="utf-8"))
    summary = {
        "scope": f"{manifest.get('season', experiment_dir.name)} full-life moneyline markets",
        "source_repo": manifest.get("source_repo"),
        "source_revision": manifest.get("source_revision"),
        "series_id": manifest.get("series_id"),
        "markets": len(markets),
        "resolved_markets": sum(row.get("resolution_type") in {"resolved", "tie"} for row in markets),
        "unresolved_markets": sum(row.get("resolution_type") not in {"resolved", "tie"} for row in markets),
        "trade_rows_fetched": manifest.get("trade_rows"),
        "bettors_with_trades": len(summaries),
        "wallet_market_ledgers": len(ledgers),
        "unsettled_wallet_market_ledgers": len(open_rows),
        "ranking_basis": "BUY/SELL replay; realized P&L only for resolved/tie markets",
        "win_rate_definition": "profitable settled wallet × moneyline ledgers / non-flat settled ledgers",
        "candidate_filters": {
            "5_game_view": {"minimum_settled_games": 5, "minimum_win_rate": 0.70},
            "10_game_view": {"minimum_settled_games": 10, "minimum_win_rate": 0.70},
        },
        "top_pnl": summaries[:25],
        "top_5_game_candidates": candidate_5[:25],
        "top_10_game_candidates": candidate_10[:25],
    }
    result_dir.mkdir(parents=True, exist_ok=True)
    (result_dir / "summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    print(json.dumps({
        "db": str(db_path),
        "markets": len(markets),
        "resolved_markets": summary["resolved_markets"],
        "unresolved_markets": summary["unresolved_markets"],
        "trade_rows": manifest.get("trade_rows"),
        "bettors": len(summaries),
        "ledgers": len(ledgers),
        "unsettled_ledgers": len(open_rows),
        "candidates_5games_70pct": len(candidate_5),
        "candidates_10games_70pct": len(candidate_10),
    }, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
