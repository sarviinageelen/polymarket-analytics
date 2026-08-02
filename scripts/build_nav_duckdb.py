"""Materialize the cached Nav bronze Parquet into a local DuckDB silver layer.

This script is intentionally API-free. It only reads the already persisted
NFL 2025 moneyline Parquet and market snapshot files, then writes a local
DuckDB database for repeatable SQL analysis.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import duckdb


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EXPERIMENT_DIR = ROOT / "data/experiments/nav_nfl_2025_moneyline"
DEFAULT_DB = DEFAULT_EXPERIMENT_DIR / "silver" / "nfl_2025_moneyline.duckdb"


def sql_path(path: Path) -> str:
    return str(path).replace("'", "''")


def build_database(experiment_dir: Path, db_path: Path) -> dict[str, int | str]:
    trade_dir = experiment_dir / "bronze" / "trades"
    market_path = experiment_dir / "moneyline_markets.parquet"
    manifest_path = experiment_dir / "manifest.json"
    trade_files = sorted(trade_dir.glob("*.parquet"))
    if not trade_files:
        raise FileNotFoundError(f"no bronze Parquet files found under {trade_dir}")
    if not market_path.exists():
        raise FileNotFoundError(f"market snapshot not found: {market_path}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    db_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = db_path.with_suffix(db_path.suffix + ".tmp")
    if temporary_path.exists():
        temporary_path.unlink()

    trade_glob = sql_path(trade_dir / "*.parquet")
    market_file = sql_path(market_path)
    conn = duckdb.connect(str(temporary_path))
    try:
        conn.execute("PRAGMA threads=4")
        conn.execute(
            f"""
            CREATE OR REPLACE TABLE market_dim AS
            SELECT
                condition_id,
                event_id,
                event_slug,
                title,
                market_type,
                season,
                event_date,
                market_start_ts,
                market_end_ts,
                slug,
                outcomes,
                outcome_prices,
                json_extract_string(outcomes, '$[0]') AS team_a,
                json_extract_string(outcomes, '$[1]') AS team_b,
                CASE
                    WHEN TRY_CAST(json_extract_string(outcome_prices, '$[0]') AS DOUBLE) >= 0.999
                        THEN json_extract_string(outcomes, '$[0]')
                    WHEN TRY_CAST(json_extract_string(outcome_prices, '$[1]') AS DOUBLE) >= 0.999
                        THEN json_extract_string(outcomes, '$[1]')
                    ELSE NULL
                END AS winner
                ,CASE
                    WHEN TRY_CAST(json_extract_string(outcome_prices, '$[0]') AS DOUBLE) = 0.5
                     AND TRY_CAST(json_extract_string(outcome_prices, '$[1]') AS DOUBLE) = 0.5
                        THEN 'tie'
                    WHEN TRY_CAST(json_extract_string(outcome_prices, '$[0]') AS DOUBLE) IN (0, 1)
                     AND TRY_CAST(json_extract_string(outcome_prices, '$[1]') AS DOUBLE) IN (0, 1)
                     AND TRY_CAST(json_extract_string(outcome_prices, '$[0]') AS DOUBLE)
                         <> TRY_CAST(json_extract_string(outcome_prices, '$[1]') AS DOUBLE)
                        THEN 'resolved'
                    ELSE 'unresolved'
                END AS resolution_type
            FROM read_parquet('{market_file}')
            """
        )
        conn.execute(
            f"""
            CREATE OR REPLACE TABLE trade_fact AS
            SELECT
                proxyWallet,
                lower(proxyWallet) AS wallet,
                side,
                asset,
                price,
                size,
                conditionId AS condition_id,
                timestamp AS trade_timestamp,
                to_timestamp(timestamp) AS trade_time_utc,
                transactionHash AS transaction_hash,
                outcome,
                outcomeIndex AS outcome_index,
                name,
                pseudonym,
                eventSlug AS event_slug,
                title,
                event_id,
                market_type,
                season,
                market_start_ts,
                market_end_ts
            FROM read_parquet('{trade_glob}')
            """
        )
        conn.execute(
            """
            CREATE OR REPLACE TABLE wallet_game_ledger AS
            WITH aggregated AS (
                SELECT
                    wallet,
                    condition_id,
                    any_value(name) AS name,
                    any_value(pseudonym) AS pseudonym,
                    count(*) AS trade_count,
                    min(trade_timestamp) AS first_trade_timestamp,
                    max(trade_timestamp) AS last_trade_timestamp,
                    sum(CASE WHEN upper(side) = 'BUY' THEN size * price ELSE 0 END) AS buy_cost,
                    sum(CASE WHEN upper(side) = 'SELL' THEN size * price ELSE 0 END) AS sell_proceeds,
                    sum(CASE WHEN upper(side) = 'BUY' THEN -size * price ELSE size * price END) AS cash_flow,
                    sum(CASE WHEN outcome_index = 0 AND upper(side) = 'BUY' THEN size WHEN outcome_index = 0 AND upper(side) = 'SELL' THEN -size ELSE 0 END) AS net_shares_a,
                    sum(CASE WHEN outcome_index = 1 AND upper(side) = 'BUY' THEN size WHEN outcome_index = 1 AND upper(side) = 'SELL' THEN -size ELSE 0 END) AS net_shares_b
                FROM trade_fact
                GROUP BY wallet, condition_id
            ), settled AS (
                SELECT
                    a.*,
                    m.event_id,
                    m.event_slug,
                    m.event_date,
                    m.title,
                    m.team_a,
                    m.team_b,
                    m.winner,
                    m.resolution_type,
                    TRY_CAST(json_extract_string(m.outcome_prices, '$[0]') AS DOUBLE) AS price_a,
                    TRY_CAST(json_extract_string(m.outcome_prices, '$[1]') AS DOUBLE) AS price_b
                FROM aggregated a
                JOIN market_dim m USING (condition_id)
            )
            SELECT
                *,
                net_shares_a * price_a + net_shares_b * price_b AS settlement_value,
                cash_flow + net_shares_a * price_a + net_shares_b * price_b AS pnl,
                CASE
                    WHEN cash_flow + net_shares_a * price_a + net_shares_b * price_b > 1e-9 THEN 'win'
                    WHEN cash_flow + net_shares_a * price_a + net_shares_b * price_b < -1e-9 THEN 'loss'
                    ELSE 'flat'
                END AS result
            FROM settled
            """
        )
        conn.execute(
            """
            CREATE OR REPLACE TABLE pipeline_metadata AS
            SELECT * FROM (VALUES
                ('source_repo', ?),
                ('source_revision', ?),
                ('season', ?),
                ('market_filter', ?),
                ('taker_only', ?),
                ('generated_at_utc', ?),
                ('bronze_path', ?)
            ) AS metadata(key, value)
            """,
            [
                str(manifest.get("source_repo", "")),
                str(manifest.get("source_revision", "")),
                str(manifest.get("season", "NFL 2025")),
                str(manifest.get("market_filter", "sportsMarketType == moneyline")),
                str(manifest.get("taker_only", False)),
                datetime.now(timezone.utc).isoformat(),
                str(trade_dir),
            ],
        )
        counts = {
            "trade_rows": int(conn.execute("SELECT count(*) FROM trade_fact").fetchone()[0]),
            "markets": int(conn.execute("SELECT count(*) FROM market_dim").fetchone()[0]),
            "wallets": int(conn.execute("SELECT count(DISTINCT wallet) FROM trade_fact").fetchone()[0]),
            "wallet_game_ledgers": int(conn.execute("SELECT count(*) FROM wallet_game_ledger").fetchone()[0]),
            "db_path": str(db_path),
        }
        conn.execute("CHECKPOINT")
    finally:
        conn.close()
    os.replace(temporary_path, db_path)
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--experiment-dir", default=str(DEFAULT_EXPERIMENT_DIR))
    parser.add_argument("--db", default=str(DEFAULT_DB))
    args = parser.parse_args()
    counts = build_database(Path(args.experiment_dir), Path(args.db))
    print(json.dumps(counts, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
