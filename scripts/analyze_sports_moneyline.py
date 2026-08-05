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


def write_report(path: Path, manifest: dict[str, Any], summary: dict[str, Any]) -> None:
    """Write the small human-readable report used by the control panel and GitHub."""

    season = str(manifest.get("season") or "Sports")
    coverage_note = (
        "The official source currently exposes only legacy two-outcome CBB markets dated February 8–12, 2025; this is limited coverage, not a complete NCAAB season."
        if manifest.get("allow_untagged_binary")
        else None
    )
    lines = [
        f"# {season} Full-Game Moneyline Analysis",
        "",
        f"Generated from the cached Gamma event snapshot and Nav-backed Parquet trade layer at `{manifest.get('generated_at_utc', 'unknown')}`.",
        f"The snapshot uses series `{manifest.get('series_id')}`, an inclusive event window of `{manifest.get('start_date')}` through `{manifest.get('end_date')}`, and the market filter `{manifest.get('market_filter')}`.",
        "",
    ]
    if coverage_note:
        lines.extend([f"> Coverage note: {coverage_note}", ""])
    lines.extend([
        "## Snapshot",
        "",
        "| Metric | Value |",
        "| --- | ---: |",
        f"| Moneyline markets | {summary.get('markets', 0):,} |",
        f"| Resolved markets | {summary.get('resolved_markets', 0):,} |",
        f"| Unresolved markets | {summary.get('unresolved_markets', 0):,} |",
        f"| Unique trades | {summary.get('trade_rows_fetched', 0) or 0:,} |",
        f"| Wallets with trades | {summary.get('bettors_with_trades', 0):,} |",
        f"| Wallet × game ledgers | {summary.get('wallet_market_ledgers', 0):,} |",
        "",
        "## Candidate views",
        "",
        "The candidate files require at least five or ten settled games, at least a 70% non-flat profitable-ledger rate, and at least 1,000 units of settled buy cost. They are descriptive filters, not a guarantee of future performance.",
        "",
        f"- 5+ game candidates: `{summary.get('candidate_5_count', len(summary.get('top_5_game_candidates', []))):,}` saved in `results/bettor_candidates_5games_70pct.csv`.",
        f"- 10+ game candidates: `{summary.get('candidate_10_count', len(summary.get('top_10_game_candidates', []))):,}` saved in `results/bettor_candidates_10games_70pct.csv`.",
        "",
        "## Reproducibility",
        "",
        f"- Source repository: {manifest.get('source_repo')}",
        f"- Source revision: `{manifest.get('source_revision')}`",
        f"- Raw event cache: `{manifest.get('events_path')}`",
        f"- Experiment directory: `{summary.get('experiment_dir', 'data/experiments')}`",
        "- DuckDB, Parquet, CSV analysis, validation JSON, and Excel are produced as separate local artifacts.",
        "",
    ])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--experiment-dir", default=str(DEFAULT_EXPERIMENT_DIR))
    parser.add_argument("--report", help="Optional Markdown report path")
    args = parser.parse_args()
    experiment_dir = Path(args.experiment_dir)
    db_path = experiment_dir / "silver" / f"{experiment_dir.name.removeprefix('nav_')}.duckdb"
    if not db_path.exists():
        candidates_db = sorted((experiment_dir / "silver").glob("*.duckdb"))
        if not candidates_db:
            raise SystemExit(f"no DuckDB found under {experiment_dir / 'silver'}")
        db_path = candidates_db[0]

    result_dir = experiment_dir / "results"
    result_dir.mkdir(parents=True, exist_ok=True)
    conn = duckdb.connect(str(db_path), read_only=True)
    spill_dir = experiment_dir / ".duckdb_analysis_tmp"
    spill_dir.mkdir(parents=True, exist_ok=True)
    conn.execute("PRAGMA memory_limit='768MB'")
    conn.execute("PRAGMA threads=1")
    conn.execute("PRAGMA preserve_insertion_order=false")
    conn.execute(f"PRAGMA temp_directory='{str(spill_dir).replace(chr(39), chr(39) * 2)}'")
    try:
        def copy_path(path: Path) -> str:
            return str(path).replace("'", "''")

        conn.execute(
            """
            CREATE OR REPLACE TEMP TABLE wallet_summary AS
            SELECT
                wallet,
                coalesce(any_value(name), '') AS name,
                coalesce(any_value(pseudonym), '') AS pseudonym,
                count(*) AS markets,
                count(*) FILTER (WHERE resolution_type IN ('resolved', 'tie')) AS settled_markets,
                count(*) FILTER (WHERE resolution_type NOT IN ('resolved', 'tie') OR resolution_type IS NULL) AS open_markets,
                count(*) FILTER (WHERE result = 'win') AS wins,
                count(*) FILTER (WHERE result = 'loss') AS losses,
                count(*) FILTER (WHERE result NOT IN ('win', 'loss') AND resolution_type IN ('resolved', 'tie')) AS flats,
                count(*) FILTER (WHERE resolution_type NOT IN ('resolved', 'tie') OR resolution_type IS NULL) AS unsettled,
                sum(coalesce(trade_count, 0)) AS trade_count,
                sum(coalesce(buy_cost, 0)) AS buy_cost,
                sum(CASE WHEN resolution_type IN ('resolved', 'tie') THEN coalesce(buy_cost, 0) ELSE 0 END) AS settled_buy_cost,
                sum(coalesce(sell_proceeds, 0)) AS sell_proceeds,
                sum(coalesce(cash_flow, 0)) AS cash_flow,
                sum(CASE WHEN resolution_type IN ('resolved', 'tie') THEN coalesce(realized_pnl, 0) ELSE 0 END) AS total_pnl,
                sum(coalesce(mark_to_market_pnl, 0)) AS mark_to_market_pnl,
                sum(CASE WHEN resolution_type NOT IN ('resolved', 'tie') OR resolution_type IS NULL THEN coalesce(mark_to_market_value, 0) ELSE 0 END) AS open_exposure
            FROM wallet_game_ledger
            GROUP BY wallet
            """
        )
        conn.execute(
            """
            CREATE OR REPLACE TEMP TABLE wallet_summary_scored AS
            SELECT
                *,
                CASE WHEN wins + losses > 0 THEN wins * 1.0 / (wins + losses) ELSE 0.0 END AS win_rate,
                CASE WHEN settled_buy_cost <> 0 THEN total_pnl / settled_buy_cost ELSE NULL END AS roi,
                coalesce(nullif(name, ''), nullif(pseudonym, ''), wallet) AS display_name
            FROM wallet_summary
            """
        )
        summary_columns = "wallet, name, pseudonym, markets, settled_markets, open_markets, wins, losses, flats, unsettled, trade_count, buy_cost, settled_buy_cost, sell_proceeds, cash_flow, total_pnl, mark_to_market_pnl, open_exposure, win_rate, roi, display_name"
        conn.execute(
            f"COPY (SELECT {summary_columns} FROM wallet_summary_scored ORDER BY total_pnl DESC, settled_buy_cost DESC) TO '{copy_path(result_dir / 'bettor_ranking_pnl.csv')}' (HEADER, DELIMITER ',')"
        )
        conn.execute(
            f"COPY (SELECT * FROM wallet_game_ledger) TO '{copy_path(result_dir / 'market_pnl.csv')}' (HEADER, DELIMITER ',')"
        )
        conn.execute(
            f"COPY (SELECT * FROM wallet_game_ledger WHERE resolution_type NOT IN ('resolved', 'tie') OR resolution_type IS NULL) TO '{copy_path(result_dir / 'open_exposure.csv')}' (HEADER, DELIMITER ',')"
        )
        candidate_query = """
            SELECT {columns}
            FROM wallet_summary_scored
            WHERE settled_markets >= ?
              AND wins + losses >= ?
              AND win_rate >= 0.70
              AND settled_buy_cost >= 1000
            ORDER BY total_pnl DESC, settled_buy_cost DESC
        """
        for minimum, filename in ((5, "bettor_candidates_5games_70pct.csv"), (10, "bettor_candidates_10games_70pct.csv")):
            conn.execute(
                f"COPY ({candidate_query.format(columns=summary_columns)}) TO '{copy_path(result_dir / filename)}' (HEADER, DELIMITER ',')",
                [minimum, minimum],
            )

        metrics = conn.execute(
            """
            SELECT
                (SELECT count(*) FROM market_dim),
                (SELECT count(*) FILTER (WHERE resolution_type IN ('resolved', 'tie')) FROM market_dim),
                (SELECT count(*) FILTER (WHERE resolution_type NOT IN ('resolved', 'tie') OR resolution_type IS NULL) FROM market_dim),
                (SELECT count(*) FROM wallet_game_ledger),
                (SELECT count(*) FILTER (WHERE resolution_type NOT IN ('resolved', 'tie') OR resolution_type IS NULL) FROM wallet_game_ledger),
                (SELECT count(*) FROM wallet_summary_scored),
                (SELECT count(*) FROM wallet_summary_scored WHERE settled_markets >= 5 AND wins + losses >= 5 AND win_rate >= 0.70 AND settled_buy_cost >= 1000),
                (SELECT count(*) FROM wallet_summary_scored WHERE settled_markets >= 10 AND wins + losses >= 10 AND win_rate >= 0.70 AND settled_buy_cost >= 1000)
            """
        ).fetchone()
        top_pnl = [dict(zip(summary_columns.split(", "), row)) for row in conn.execute(f"SELECT {summary_columns} FROM wallet_summary_scored ORDER BY total_pnl DESC, settled_buy_cost DESC LIMIT 25").fetchall()]
        top_5 = [dict(zip(summary_columns.split(", "), row)) for row in conn.execute(f"SELECT {summary_columns} FROM wallet_summary_scored WHERE settled_markets >= 5 AND wins + losses >= 5 AND win_rate >= 0.70 AND settled_buy_cost >= 1000 ORDER BY total_pnl DESC, settled_buy_cost DESC LIMIT 25").fetchall()]
        top_10 = [dict(zip(summary_columns.split(", "), row)) for row in conn.execute(f"SELECT {summary_columns} FROM wallet_summary_scored WHERE settled_markets >= 10 AND wins + losses >= 10 AND win_rate >= 0.70 AND settled_buy_cost >= 1000 ORDER BY total_pnl DESC, settled_buy_cost DESC LIMIT 25").fetchall()]
    finally:
        conn.close()

    manifest = json.loads((experiment_dir / "manifest.json").read_text(encoding="utf-8"))
    summary = {
        "scope": f"{manifest.get('season', experiment_dir.name)} full-game moneyline markets",
        "source_repo": manifest.get("source_repo"),
        "source_revision": manifest.get("source_revision"),
        "series_id": manifest.get("series_id"),
        "markets": int(metrics[0]),
        "resolved_markets": int(metrics[1]),
        "unresolved_markets": int(metrics[2]),
        "trade_rows_fetched": manifest.get("trade_rows"),
        "bettors_with_trades": int(metrics[5]),
        "wallet_market_ledgers": int(metrics[3]),
        "unsettled_wallet_market_ledgers": int(metrics[4]),
        "candidate_5_count": int(metrics[6]),
        "candidate_10_count": int(metrics[7]),
        "ranking_basis": "BUY/SELL replay; realized P&L only for resolved/tie markets",
        "win_rate_definition": "profitable settled wallet × moneyline ledgers / non-flat settled ledgers",
        "candidate_filters": {
            "5_game_view": {"minimum_settled_games": 5, "minimum_win_rate": 0.70},
            "10_game_view": {"minimum_settled_games": 10, "minimum_win_rate": 0.70},
        },
        "top_pnl": top_pnl,
        "top_5_game_candidates": top_5,
        "top_10_game_candidates": top_10,
        "experiment_dir": str(experiment_dir),
    }
    result_dir.mkdir(parents=True, exist_ok=True)
    (result_dir / "summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    if args.report:
        write_report(Path(args.report), manifest, summary)
    print(json.dumps({
        "db": str(db_path),
        "markets": summary["markets"],
        "resolved_markets": summary["resolved_markets"],
        "unresolved_markets": summary["unresolved_markets"],
        "trade_rows": manifest.get("trade_rows"),
        "bettors": summary["bettors_with_trades"],
        "ledgers": summary["wallet_market_ledgers"],
        "unsettled_ledgers": summary["unsettled_wallet_market_ledgers"],
        "candidates_5games_70pct": summary["candidate_5_count"],
        "candidates_10games_70pct": summary["candidate_10_count"],
    }, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
