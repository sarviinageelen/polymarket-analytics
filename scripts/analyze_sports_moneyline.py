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
        qualifying = bool(row.get("qualifying_position", True))
        if not qualifying:
            continue
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
                "ties": 0,
                "unsettled": 0,
                "trade_count": 0,
                "post_kickoff_trade_count": 0,
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
        summary["post_kickoff_trade_count"] += integer(row.get("post_kickoff_trade_count"))
        summary["buy_cost"] += number(row.get("buy_cost"))
        summary["sell_proceeds"] += number(row.get("sell_proceeds"))
        summary["cash_flow"] += number(row.get("cash_flow"))
        summary["mark_to_market_pnl"] += number(row.get("mark_to_market_pnl"))
        resolution = row.get("resolution_type")
        settled = resolution == "resolved"
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
        elif resolution == "tie":
            summary["ties"] += 1
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
        f"| Pre-match wallet × game ledgers | {summary.get('prematch_wallet_market_ledgers', 0):,} |",
        f"| Markets with a kickoff timestamp | {summary.get('markets_with_kickoff', 0):,} |",
        "",
        "## Candidate views",
        "",
        "The candidate files require at least five or ten qualifying positions established before kickoff and at least a 70% non-flat profitable-ledger rate. There is no minimum dollar-turnover filter. They are descriptive filters, not a guarantee of future performance.",
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

        tables = {row[0] for row in conn.execute("SHOW TABLES").fetchall()}
        if "wallet_game_prematch_ledger" not in tables:
            raise RuntimeError(
                "DuckDB is missing wallet_game_prematch_ledger; rebuild it with "
                "scripts/build_nav_duckdb.py before running the analysis"
            )
        conn.execute(
            """
            CREATE OR REPLACE TEMP TABLE all_trade_wallet_summary AS
            SELECT
                wallet,
                count(*) AS all_markets,
                sum(coalesce(trade_count, 0)) AS all_trade_count,
                sum(CASE WHEN resolution_type IN ('resolved', 'tie')
                    THEN coalesce(buy_cost, 0) ELSE 0 END) AS all_settled_buy_cost,
                sum(CASE WHEN resolution_type IN ('resolved', 'tie')
                    THEN coalesce(realized_pnl, 0) ELSE 0 END) AS all_total_pnl,
                sum(coalesce(mark_to_market_pnl, 0)) AS all_mark_to_market_pnl
            FROM wallet_game_ledger
            GROUP BY wallet
            """
        )
        conn.execute(
            """
            CREATE OR REPLACE TEMP TABLE wallet_summary AS
            SELECT
                p.wallet,
                coalesce(any_value(p.name), '') AS name,
                coalesce(any_value(p.pseudonym), '') AS pseudonym,
                count(*) FILTER (WHERE p.qualifying_position) AS markets,
                count(*) FILTER (
                    WHERE p.resolution_type = 'resolved' AND p.qualifying_position
                ) AS settled_markets,
                count(*) FILTER (
                    WHERE p.resolution_type NOT IN ('resolved', 'tie')
                      AND p.qualifying_position
                ) AS open_markets,
                count(*) FILTER (WHERE p.result = 'win') AS wins,
                count(*) FILTER (WHERE p.result = 'loss') AS losses,
                count(*) FILTER (
                    WHERE p.resolution_type = 'resolved'
                      AND p.qualifying_position
                      AND p.result NOT IN ('win', 'loss')
                ) AS flats,
                count(*) FILTER (
                    WHERE p.resolution_type = 'tie' AND p.qualifying_position
                ) AS ties,
                count(*) FILTER (
                    WHERE p.resolution_type NOT IN ('resolved', 'tie')
                      AND p.qualifying_position
                ) AS unsettled,
                count(*) FILTER (WHERE p.pick_result = 'win') AS correct_picks,
                count(*) FILTER (WHERE p.pick_result = 'loss') AS incorrect_picks,
                sum(CASE WHEN p.qualifying_position
                    THEN coalesce(p.trade_count, 0) ELSE 0 END
                ) AS trade_count,
                sum(CASE WHEN p.qualifying_position
                    THEN coalesce(p.post_kickoff_trade_count, 0) ELSE 0 END
                ) AS post_kickoff_trade_count,
                sum(CASE WHEN p.qualifying_position
                    THEN coalesce(p.buy_cost, 0) ELSE 0 END
                ) AS buy_cost,
                sum(CASE
                    WHEN p.resolution_type = 'resolved' AND p.qualifying_position
                        THEN coalesce(p.buy_cost, 0)
                    ELSE 0
                END) AS settled_buy_cost,
                sum(CASE WHEN p.qualifying_position
                    THEN coalesce(p.sell_proceeds, 0) ELSE 0 END
                ) AS sell_proceeds,
                sum(CASE WHEN p.qualifying_position
                    THEN coalesce(p.cash_flow, 0) ELSE 0 END
                ) AS cash_flow,
                sum(CASE
                    WHEN p.resolution_type = 'resolved' AND p.qualifying_position
                        THEN coalesce(p.realized_pnl, 0)
                    ELSE 0
                END) AS total_pnl,
                sum(CASE WHEN p.qualifying_position
                    THEN coalesce(p.mark_to_market_pnl, 0) ELSE 0 END
                ) AS mark_to_market_pnl,
                sum(CASE
                    WHEN p.resolution_type NOT IN ('resolved', 'tie')
                     AND p.qualifying_position
                        THEN coalesce(p.mark_to_market_value, 0)
                    ELSE 0
                END) AS open_exposure,
                any_value(a.all_markets) AS all_markets,
                any_value(a.all_trade_count) AS all_trade_count,
                any_value(a.all_settled_buy_cost) AS all_settled_buy_cost,
                any_value(a.all_total_pnl) AS all_total_pnl,
                any_value(a.all_mark_to_market_pnl) AS all_mark_to_market_pnl
            FROM wallet_game_prematch_ledger p
            JOIN all_trade_wallet_summary a USING (wallet)
            GROUP BY p.wallet
            """
        )
        conn.execute(
            """
            CREATE OR REPLACE TEMP TABLE wallet_summary_scored AS
            SELECT
                *,
                CASE WHEN wins + losses > 0 THEN wins * 1.0 / (wins + losses) ELSE 0.0 END AS win_rate,
                CASE WHEN correct_picks + incorrect_picks > 0
                    THEN correct_picks * 1.0 / (correct_picks + incorrect_picks)
                    ELSE NULL END AS pick_accuracy,
                CASE WHEN settled_buy_cost <> 0 THEN total_pnl / settled_buy_cost ELSE NULL END AS roi,
                CASE WHEN all_settled_buy_cost <> 0
                    THEN all_total_pnl / all_settled_buy_cost ELSE NULL END AS all_roi,
                coalesce(nullif(name, ''), nullif(pseudonym, ''), wallet) AS display_name
            FROM wallet_summary
            """
        )
        summary_columns = "wallet, name, pseudonym, markets, settled_markets, open_markets, wins, losses, flats, ties, unsettled, correct_picks, incorrect_picks, trade_count, post_kickoff_trade_count, buy_cost, settled_buy_cost, sell_proceeds, cash_flow, total_pnl, mark_to_market_pnl, open_exposure, win_rate, pick_accuracy, roi, all_markets, all_trade_count, all_settled_buy_cost, all_total_pnl, all_mark_to_market_pnl, all_roi, display_name"
        conn.execute(
            f"COPY (SELECT {summary_columns} FROM wallet_summary_scored ORDER BY total_pnl DESC, settled_markets DESC) TO '{copy_path(result_dir / 'bettor_ranking_pnl.csv')}' (HEADER, DELIMITER ',')"
        )
        conn.execute(
            f"COPY (SELECT * FROM wallet_game_ledger) TO '{copy_path(result_dir / 'market_pnl.csv')}' (HEADER, DELIMITER ',')"
        )
        conn.execute(
            f"COPY (SELECT * FROM wallet_game_ledger WHERE resolution_type NOT IN ('resolved', 'tie') OR resolution_type IS NULL) TO '{copy_path(result_dir / 'open_exposure.csv')}' (HEADER, DELIMITER ',')"
        )
        conn.execute(
            f"COPY (SELECT * FROM wallet_game_prematch_ledger) TO '{copy_path(result_dir / 'prematch_market_pnl.csv')}' (HEADER, DELIMITER ',')"
        )
        candidate_query = """
            SELECT {columns}
            FROM wallet_summary_scored
            WHERE settled_markets >= ?
              AND wins + losses >= ?
              AND win_rate >= 0.70
            ORDER BY total_pnl DESC, settled_markets DESC
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
                (SELECT count(DISTINCT wallet) FROM trade_fact),
                (SELECT count(*) FROM wallet_game_prematch_ledger),
                (SELECT count(DISTINCT wallet) FROM wallet_game_prematch_ledger),
                (SELECT count(*) FROM wallet_summary_scored WHERE settled_markets >= 5 AND wins + losses >= 5 AND win_rate >= 0.70),
                (SELECT count(*) FROM wallet_summary_scored WHERE settled_markets >= 10 AND wins + losses >= 10 AND win_rate >= 0.70),
                (SELECT count(*) FROM market_dim WHERE game_start_ts > 0)
            """
        ).fetchone()
        top_pnl = [dict(zip(summary_columns.split(", "), row)) for row in conn.execute(f"SELECT {summary_columns} FROM wallet_summary_scored ORDER BY total_pnl DESC, settled_markets DESC LIMIT 25").fetchall()]
        top_5 = [dict(zip(summary_columns.split(", "), row)) for row in conn.execute(f"SELECT {summary_columns} FROM wallet_summary_scored WHERE settled_markets >= 5 AND wins + losses >= 5 AND win_rate >= 0.70 ORDER BY total_pnl DESC, settled_markets DESC LIMIT 25").fetchall()]
        top_10 = [dict(zip(summary_columns.split(", "), row)) for row in conn.execute(f"SELECT {summary_columns} FROM wallet_summary_scored WHERE settled_markets >= 10 AND wins + losses >= 10 AND win_rate >= 0.70 ORDER BY total_pnl DESC, settled_markets DESC LIMIT 25").fetchall()]
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
        "prematch_wallet_market_ledgers": int(metrics[6]),
        "prematch_bettors": int(metrics[7]),
        "markets_with_kickoff": int(metrics[10]),
        "candidate_5_count": int(metrics[8]),
        "candidate_10_count": int(metrics[9]),
        "ranking_basis": "BUY/SELL positions frozen strictly before kickoff; post-kickoff trades are excluded from skill metrics",
        "win_rate_definition": "profitable qualifying pre-match wallet × moneyline ledgers / non-flat qualifying resolved ledgers",
        "candidate_filters": {
            "5_game_view": {"minimum_prematch_settled_games": 5, "minimum_win_rate": 0.70, "minimum_buy_cost": None},
            "10_game_view": {"minimum_prematch_settled_games": 10, "minimum_win_rate": 0.70, "minimum_buy_cost": None},
            "trade_cutoff": "trade_timestamp < game_start_ts",
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
