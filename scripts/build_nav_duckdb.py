"""Materialize cached Nav bronze Parquet into a local DuckDB silver layer.

This script is intentionally API-free. It only reads already-persisted
moneyline Parquet and market snapshot files, then writes a local DuckDB
database for repeatable SQL analysis. It supports both settled historical
markets and ongoing/upcoming markets.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import duckdb


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from polymarket_analytics.trade_identity import (  # noqa: E402
    TRADE_IDENTITY_COLUMNS,
    identity_hash_sql,
    identity_sql_columns,
)

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
    spill_dir = db_path.parent / ".duckdb_build_tmp"
    spill_dir.mkdir(parents=True, exist_ok=True)
    try:
        conn.execute("PRAGMA memory_limit='2GB'")
        conn.execute("PRAGMA threads=2")
        conn.execute("PRAGMA preserve_insertion_order=false")
        conn.execute(f"PRAGMA temp_directory='{sql_path(spill_dir)}'")
        market_columns = {
            row[0]
            for row in conn.execute(
                f"DESCRIBE SELECT * FROM read_parquet('{market_file}', union_by_name=true)"
            ).fetchall()
        }

        def market_field(name: str, fallback: str) -> str:
            return name if name in market_columns else fallback

        historical_closed = "event_date < CAST(current_date AS VARCHAR)"
        market_closed = market_field("market_closed", historical_closed)
        event_closed = market_field("event_closed", historical_closed)
        event_live = market_field("event_live", "FALSE")
        event_ended = market_field("event_ended", historical_closed)
        source_market_status = market_field("market_status", "NULL::VARCHAR")
        market_active = market_field("market_active", "NULL::BOOLEAN")
        market_archived = market_field("market_archived", "NULL::BOOLEAN")
        accepting_orders = market_field("accepting_orders", "NULL::BOOLEAN")
        uma_status = market_field("uma_resolution_status", "NULL::VARCHAR")
        event_active = market_field("event_active", "NULL::BOOLEAN")
        event_archived = market_field("event_archived", "NULL::BOOLEAN")
        event_period = market_field("event_period", "NULL::VARCHAR")
        game_start_ts = market_field("game_start_ts", "0::BIGINT")
        game_start_source = market_field("game_start_source", "NULL::VARCHAR")
        conn.execute(
            f"""
            CREATE OR REPLACE TABLE market_dim AS
            WITH base AS (
                SELECT
                    condition_id,
                    event_id,
                    event_slug,
                    title,
                    market_type,
                    season,
                    event_date,
                    {game_start_ts} AS game_start_ts,
                    {game_start_source} AS game_start_source,
                    market_start_ts,
                    market_end_ts,
                    slug,
                    outcomes,
                    outcome_prices,
                    COALESCE({market_closed}, FALSE) AS market_closed,
                    COALESCE({event_closed}, FALSE) AS event_closed,
                    COALESCE({event_live}, FALSE) AS event_live,
                    COALESCE({event_ended}, FALSE) AS event_ended,
                    {market_active} AS market_active,
                    {market_archived} AS market_archived,
                    {accepting_orders} AS accepting_orders,
                    {uma_status} AS uma_resolution_status,
                    {event_active} AS event_active,
                    {event_archived} AS event_archived,
                    {event_period} AS event_period,
                    COALESCE(
                        {source_market_status},
                        CASE
                            WHEN COALESCE({market_closed}, FALSE) THEN 'closed'
                            WHEN COALESCE({market_archived}, FALSE)
                              OR {market_active} IS FALSE THEN 'stale_unresolved'
                            WHEN COALESCE({event_live}, FALSE) THEN 'live'
                            WHEN event_date <= CAST(current_date AS VARCHAR) THEN 'open'
                            ELSE 'upcoming'
                        END
                    ) AS market_status,
                    json_extract_string(outcomes, '$[0]') AS team_a,
                    json_extract_string(outcomes, '$[1]') AS team_b,
                    TRY_CAST(json_extract_string(outcome_prices, '$[0]') AS DOUBLE) AS current_price_a,
                    TRY_CAST(json_extract_string(outcome_prices, '$[1]') AS DOUBLE) AS current_price_b
                FROM read_parquet('{market_file}', union_by_name=true)
            ), scored AS (
                SELECT
                    *,
                    CASE
                    WHEN NOT market_closed THEN 'unresolved'
                        WHEN current_price_a = 0.5 AND current_price_b = 0.5 THEN 'tie'
                        WHEN current_price_a IN (0, 1)
                         AND current_price_b IN (0, 1)
                         AND current_price_a <> current_price_b THEN 'resolved'
                        ELSE 'unresolved'
                    END AS resolution_type
                FROM base
            )
            SELECT
                *,
                CASE
                    WHEN resolution_type IN ('resolved', 'tie') AND current_price_a >= 0.999 THEN team_a
                    WHEN resolution_type IN ('resolved', 'tie') AND current_price_b >= 0.999 THEN team_b
                    ELSE NULL
                END AS winner,
                CASE WHEN resolution_type IN ('resolved', 'tie') THEN current_price_a ELSE NULL END AS final_price_a,
                CASE WHEN resolution_type IN ('resolved', 'tie') THEN current_price_b ELSE NULL END AS final_price_b
            FROM scored
            """
        )
        conn.execute(
            f"""
            CREATE OR REPLACE TABLE trade_fact AS
            WITH ranked AS (
                SELECT
                    *,
                    row_number() OVER (
                        PARTITION BY {", ".join(identity_sql_columns())}
                        ORDER BY
                            CASE WHEN upper(coalesce(side, '')) IN ('BUY', 'SELL') THEN 1 ELSE 0 END DESC,
                            CASE WHEN outcomeIndex IN (0, 1) THEN 1 ELSE 0 END DESC,
                            CASE WHEN price BETWEEN 0 AND 1 THEN 1 ELSE 0 END DESC,
                            CASE WHEN size > 0 THEN 1 ELSE 0 END DESC,
                            CASE WHEN timestamp > 0 THEN 1 ELSE 0 END DESC,
                            CASE WHEN nullif(coalesce(event_id, ''), '') IS NOT NULL THEN 1 ELSE 0 END DESC,
                            CASE WHEN nullif(coalesce(title, ''), '') IS NOT NULL THEN 1 ELSE 0 END DESC,
                            CASE WHEN nullif(coalesce(name, ''), '') IS NOT NULL THEN 1 ELSE 0 END DESC,
                            CASE WHEN nullif(coalesce(pseudonym, ''), '') IS NOT NULL THEN 1 ELSE 0 END DESC,
                            coalesce(event_id, '') DESC,
                            coalesce(eventSlug, '') DESC,
                            coalesce(title, '') DESC,
                            coalesce(name, '') DESC,
                            coalesce(pseudonym, '') DESC
                    ) AS _trade_identity_rank
                FROM read_parquet('{trade_glob}', union_by_name=true)
            ), deduplicated AS (
                SELECT * EXCLUDE (_trade_identity_rank)
                FROM ranked
                WHERE _trade_identity_rank = 1
            )
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
                {identity_hash_sql()} AS trade_key,
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
            FROM deduplicated
            """
        )
        duplicate_trade_rows = int(
            conn.execute(
                "SELECT count(*) - count(DISTINCT trade_key) FROM trade_fact"
            ).fetchone()[0]
        )
        if duplicate_trade_rows:
            raise RuntimeError(
                "DuckDB trade identity deduplication left "
                f"{duplicate_trade_rows} duplicate trade rows"
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
                    m.market_status,
                    m.market_closed,
                    m.current_price_a AS price_a,
                    m.current_price_b AS price_b,
                    m.final_price_a,
                    m.final_price_b
                FROM aggregated a
                JOIN market_dim m USING (condition_id)
            )
            SELECT
                *,
                net_shares_a * price_a + net_shares_b * price_b AS mark_to_market_value,
                CASE
                    WHEN resolution_type IN ('resolved', 'tie')
                        THEN net_shares_a * final_price_a + net_shares_b * final_price_b
                    ELSE NULL
                END AS settlement_value,
                CASE
                    WHEN resolution_type IN ('resolved', 'tie')
                        THEN cash_flow + net_shares_a * final_price_a + net_shares_b * final_price_b
                    ELSE NULL
                END AS realized_pnl,
                cash_flow + net_shares_a * price_a + net_shares_b * price_b AS mark_to_market_pnl,
                CASE
                    WHEN resolution_type IN ('resolved', 'tie')
                        THEN cash_flow + net_shares_a * final_price_a + net_shares_b * final_price_b
                    ELSE NULL
                END AS pnl,
                CASE
                    WHEN resolution_type NOT IN ('resolved', 'tie') THEN 'unsettled'
                    WHEN cash_flow + net_shares_a * final_price_a + net_shares_b * final_price_b > 1e-9 THEN 'win'
                    WHEN cash_flow + net_shares_a * final_price_a + net_shares_b * final_price_b < -1e-9 THEN 'loss'
                    ELSE 'flat'
                END AS result
            FROM settled
            """
        )
        conn.execute(
            """
            CREATE OR REPLACE TABLE wallet_game_prematch_ledger AS
            WITH aggregated AS (
                SELECT
                    t.wallet,
                    t.condition_id,
                    any_value(t.name) AS name,
                    any_value(t.pseudonym) AS pseudonym,
                    count(*) AS all_trade_count,
                    count(*) FILTER (
                        WHERE t.trade_timestamp < m.game_start_ts
                    ) AS trade_count,
                    count(*) FILTER (
                        WHERE t.trade_timestamp >= m.game_start_ts
                    ) AS post_kickoff_trade_count,
                    min(t.trade_timestamp) FILTER (
                        WHERE t.trade_timestamp < m.game_start_ts
                    ) AS first_trade_timestamp,
                    max(t.trade_timestamp) FILTER (
                        WHERE t.trade_timestamp < m.game_start_ts
                    ) AS last_trade_timestamp,
                    sum(CASE
                        WHEN t.trade_timestamp < m.game_start_ts
                         AND upper(t.side) = 'BUY'
                            THEN t.size * t.price
                        ELSE 0
                    END) AS buy_cost,
                    sum(CASE
                        WHEN t.trade_timestamp < m.game_start_ts
                         AND upper(t.side) = 'BUY'
                            THEN t.size
                        ELSE 0
                    END) AS buy_shares,
                    sum(CASE
                        WHEN t.trade_timestamp < m.game_start_ts
                         AND upper(t.side) = 'SELL'
                            THEN t.size * t.price
                        ELSE 0
                    END) AS sell_proceeds,
                    sum(CASE
                        WHEN t.trade_timestamp >= m.game_start_ts THEN 0
                        WHEN upper(t.side) = 'BUY' THEN -t.size * t.price
                        ELSE t.size * t.price
                    END) AS cash_flow,
                    sum(CASE
                        WHEN t.trade_timestamp >= m.game_start_ts THEN 0
                        WHEN t.outcome_index = 0 AND upper(t.side) = 'BUY' THEN t.size
                        WHEN t.outcome_index = 0 AND upper(t.side) = 'SELL' THEN -t.size
                        ELSE 0
                    END) AS net_shares_a,
                    sum(CASE
                        WHEN t.trade_timestamp >= m.game_start_ts THEN 0
                        WHEN t.outcome_index = 1 AND upper(t.side) = 'BUY' THEN t.size
                        WHEN t.outcome_index = 1 AND upper(t.side) = 'SELL' THEN -t.size
                        ELSE 0
                    END) AS net_shares_b
                FROM trade_fact t
                JOIN market_dim m USING (condition_id)
                WHERE m.game_start_ts > 0
                GROUP BY t.wallet, t.condition_id, m.game_start_ts
                HAVING count(*) FILTER (
                    WHERE t.trade_timestamp < m.game_start_ts
                ) > 0
            ), positioned AS (
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
                    m.market_status,
                    m.market_closed,
                    m.game_start_ts,
                    m.game_start_source,
                    m.current_price_a AS price_a,
                    m.current_price_b AS price_b,
                    m.final_price_a,
                    m.final_price_b,
                    a.net_shares_a - a.net_shares_b AS directional_net_shares,
                    abs(a.net_shares_a - a.net_shares_b) > 1e-7 AS qualifying_position,
                    CASE
                        WHEN a.net_shares_a - a.net_shares_b > 1e-7 THEN m.team_a
                        WHEN a.net_shares_b - a.net_shares_a > 1e-7 THEN m.team_b
                        ELSE NULL
                    END AS primary_pick,
                    m.game_start_ts - a.last_trade_timestamp AS seconds_before_kickoff
                FROM aggregated a
                JOIN market_dim m USING (condition_id)
            ), valued AS (
                SELECT
                    p.*,
                    p.net_shares_a * p.price_a + p.net_shares_b * p.price_b
                        AS mark_to_market_value,
                    CASE
                        WHEN p.resolution_type IN ('resolved', 'tie')
                            THEN p.net_shares_a * p.final_price_a
                               + p.net_shares_b * p.final_price_b
                        ELSE NULL
                    END AS settlement_value,
                    CASE
                        WHEN p.resolution_type IN ('resolved', 'tie')
                            THEN p.cash_flow
                               + p.net_shares_a * p.final_price_a
                               + p.net_shares_b * p.final_price_b
                        ELSE NULL
                    END AS realized_pnl,
                    p.cash_flow + p.net_shares_a * p.price_a
                        + p.net_shares_b * p.price_b AS mark_to_market_pnl
                FROM positioned p
            )
            SELECT
                v.*,
                v.realized_pnl AS pnl,
                CASE
                    WHEN v.resolution_type = 'tie' THEN 'tie'
                    WHEN v.resolution_type <> 'resolved' THEN 'unsettled'
                    WHEN NOT v.qualifying_position THEN 'hedged_or_flat'
                    WHEN v.realized_pnl > 1e-9 THEN 'win'
                    WHEN v.realized_pnl < -1e-9 THEN 'loss'
                    ELSE 'flat'
                END AS result,
                CASE
                    WHEN v.resolution_type = 'tie' THEN 'tie'
                    WHEN v.resolution_type <> 'resolved' THEN 'unsettled'
                    WHEN NOT v.qualifying_position THEN 'no_pick'
                    WHEN v.primary_pick = v.winner THEN 'win'
                    ELSE 'loss'
                END AS pick_result,
                all_l.buy_cost AS all_buy_cost,
                all_l.sell_proceeds AS all_sell_proceeds,
                all_l.realized_pnl AS all_realized_pnl,
                all_l.mark_to_market_pnl AS all_mark_to_market_pnl,
                all_l.result AS all_result
            FROM valued v
            JOIN wallet_game_ledger all_l USING (wallet, condition_id)
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
                ('series_id', ?),
                ('start_date', ?),
                ('end_date', ?),
                ('generated_at_utc', ?),
                ('bronze_path', ?),
                ('trade_identity', ?)
            ) AS metadata(key, value)
            """,
            [
                str(manifest.get("source_repo", "")),
                str(manifest.get("source_revision", "")),
                str(manifest.get("season", "NFL 2025")),
                str(manifest.get("market_filter", "sportsMarketType == moneyline")),
                str(manifest.get("taker_only", False)),
                str(manifest.get("series_id", "")),
                str(manifest.get("start_date", "")),
                str(manifest.get("end_date", "")),
                datetime.now(timezone.utc).isoformat(),
                str(trade_dir),
                "|".join(TRADE_IDENTITY_COLUMNS),
            ],
        )
        counts = {
            "trade_rows": int(conn.execute("SELECT count(*) FROM trade_fact").fetchone()[0]),
            "markets": int(conn.execute("SELECT count(*) FROM market_dim").fetchone()[0]),
            "wallets": int(conn.execute("SELECT count(DISTINCT wallet) FROM trade_fact").fetchone()[0]),
            "wallet_game_ledgers": int(conn.execute("SELECT count(*) FROM wallet_game_ledger").fetchone()[0]),
            "prematch_wallet_game_ledgers": int(conn.execute("SELECT count(*) FROM wallet_game_prematch_ledger").fetchone()[0]),
            "prematch_trade_rows": int(conn.execute("SELECT coalesce(sum(trade_count), 0) FROM wallet_game_prematch_ledger").fetchone()[0]),
            "unsettled_ledgers": int(conn.execute("SELECT count(*) FROM wallet_game_ledger WHERE result = 'unsettled'").fetchone()[0]),
            "db_path": str(db_path),
        }
        expected_trade_rows = manifest.get("trade_rows")
        if expected_trade_rows is not None and int(expected_trade_rows) != counts["trade_rows"]:
            raise RuntimeError(
                "manifest and DuckDB trade counts disagree: "
                f"manifest={expected_trade_rows} db={counts['trade_rows']}"
            )
        conn.execute("CHECKPOINT")
    finally:
        conn.close()
    os.replace(temporary_path, db_path)
    shutil.rmtree(spill_dir, ignore_errors=True)
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
