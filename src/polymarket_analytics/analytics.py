"""Read-only, source-backed analytics queries for the control panel.

The control panel deliberately queries the local DuckDB silver layer instead of
calling Polymarket from the browser.  This keeps the UI responsive, makes the
numbers reproducible, and gives every filter the same market and ledger grain.
The functions in this module are defensive about older NFL snapshots that do
not yet contain all of the enriched market-status columns present in the WNBA
snapshot.
"""

from __future__ import annotations

import math
from datetime import date, datetime
from pathlib import Path
from typing import Any

import duckdb


Z_SCORE = 1.959963984540054
DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100
SAMPLE_WINDOWS = {"last5": 5, "last10": 10, "last20": 20}


def _json_value(value: Any) -> Any:
    """Convert DuckDB scalar values into JSON-safe values."""

    if value is None:
        return None
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _rows(result: Any) -> list[dict[str, Any]]:
    columns = [item[0] for item in result.description]
    return [
        {column: _json_value(value) for column, value in zip(columns, row)}
        for row in result.fetchall()
    ]


def _column_names(conn: duckdb.DuckDBPyConnection, table: str) -> set[str]:
    return {row[0] for row in conn.execute(f"DESCRIBE {table}").fetchall()}


def _column(columns: set[str], name: str, fallback: str) -> str:
    return f'"{name}"' if name in columns else fallback


def _open(path: Path) -> duckdb.DuckDBPyConnection:
    if not path.exists():
        raise FileNotFoundError(f"DuckDB snapshot not found: {path}")
    connection = duckdb.connect(str(path), read_only=True)
    connection.execute("PRAGMA threads=4")
    return connection


def _market_cte(conn: duckdb.DuckDBPyConnection) -> tuple[str, set[str]]:
    columns = _column_names(conn, "market_dim")
    market_status = _column(columns, "market_status", "NULL::VARCHAR")
    market_closed = _column(columns, "market_closed", "FALSE")
    event_live = _column(columns, "event_live", "FALSE")
    event_ended = _column(columns, "event_ended", "FALSE")
    resolution = _column(columns, "resolution_type", "'unresolved'")
    current_price_a = _column(columns, "current_price_a", "NULL::DOUBLE")
    current_price_b = _column(columns, "current_price_b", "NULL::DOUBLE")
    final_price_a = _column(columns, "final_price_a", "NULL::DOUBLE")
    final_price_b = _column(columns, "final_price_b", "NULL::DOUBLE")
    winner = _column(columns, "winner", "NULL::VARCHAR")
    return (
        f"""
        market_view AS (
            SELECT
                m.*,
                COALESCE(
                    {market_status},
                    CASE
                        WHEN COALESCE({resolution}, 'unresolved') IN ('resolved', 'tie') THEN 'closed'
                        WHEN COALESCE({market_closed}, FALSE) THEN 'closed'
                        WHEN COALESCE({event_live}, FALSE) THEN 'live'
                        WHEN COALESCE({event_ended}, FALSE) THEN 'stale_unresolved'
                        WHEN CAST(event_date AS DATE) <= CURRENT_DATE THEN 'open'
                        ELSE 'upcoming'
                    END
                ) AS normalized_market_status,
                COALESCE({resolution}, 'unresolved') AS normalized_resolution,
                {current_price_a} AS normalized_price_a,
                {current_price_b} AS normalized_price_b,
                {final_price_a} AS normalized_final_price_a,
                {final_price_b} AS normalized_final_price_b,
                {winner} AS normalized_winner
            FROM market_dim m
        )
        """,
        columns,
    )


def _ledger_expressions(conn: duckdb.DuckDBPyConnection) -> dict[str, str]:
    columns = _column_names(conn, "wallet_game_ledger")
    pnl = "l.realized_pnl" if "realized_pnl" in columns else "l.pnl"
    result = "l.result" if "result" in columns else "'unresolved'"
    resolution = "l.resolution_type" if "resolution_type" in columns else "m.normalized_resolution"
    buy_cost = "l.buy_cost" if "buy_cost" in columns else "0.0"
    event_date = "m.event_date"
    return {
        "pnl": pnl,
        "result": result,
        "resolution": resolution,
        "buy_cost": buy_cost,
        "event_date": event_date,
    }


def _wilson_sql(wins: str, picks: str) -> str:
    z2 = Z_SCORE * Z_SCORE
    return f"""
        CASE WHEN {picks} > 0 THEN
            (
                ({wins} / {picks}) + ({z2} / (2 * {picks})) -
                {Z_SCORE} * SQRT(
                    (({wins} / {picks}) * (1 - ({wins} / {picks})) / {picks}) +
                    ({z2} / (4 * {picks} * {picks}))
                )
            ) / (1 + ({z2} / {picks}))
        ELSE NULL END
    """


def _current_streak(sequence: Any) -> int:
    if not isinstance(sequence, list) or not sequence:
        return 0
    first = sequence[0]
    if first not in {"win", "loss"}:
        return 0
    count = 0
    for item in sequence:
        if item != first:
            break
        count += 1
    return count if first == "win" else -count


def _pick_label(net_a: float | None, net_b: float | None, team_a: str | None, team_b: str | None) -> str | None:
    a = float(net_a or 0.0)
    b = float(net_b or 0.0)
    if a > 1e-9 and b > 1e-9:
        return "Hedged"
    if a > 1e-9:
        return team_a or "Team A"
    if b > 1e-9:
        return team_b or "Team B"
    return None


def _position_map(conn: duckdb.DuckDBPyConnection, condition_id: str) -> dict[str, dict[str, Any]]:
    result = conn.execute(
        """
        SELECT
            wallet,
            SUM(CASE WHEN outcome_index = 0 AND UPPER(side) = 'BUY' THEN size
                     WHEN outcome_index = 0 AND UPPER(side) = 'SELL' THEN -size ELSE 0 END) AS net_a,
            SUM(CASE WHEN outcome_index = 1 AND UPPER(side) = 'BUY' THEN size
                     WHEN outcome_index = 1 AND UPPER(side) = 'SELL' THEN -size ELSE 0 END) AS net_b,
            MAX(trade_timestamp) AS last_trade_timestamp
        FROM trade_fact
        WHERE condition_id = ?
        GROUP BY wallet
        """,
        [condition_id],
    )
    return {row[0]: {"net_a": row[1], "net_b": row[2], "last_trade_timestamp": row[3]} for row in result.fetchall()}


def _next_market(conn: duckdb.DuckDBPyConnection, team: str | None = None) -> dict[str, Any] | None:
    where = "normalized_resolution = 'unresolved'"
    params: list[Any] = []
    if team:
        where += " AND (team_a = ? OR team_b = ?)"
        params.extend([team, team])
    result = conn.execute(
        f"""
        WITH {_market_cte(conn)[0]}
        SELECT condition_id, event_id, event_slug, title, event_date, team_a, team_b,
               normalized_market_status AS market_status,
               normalized_price_a AS current_price_a,
               normalized_price_b AS current_price_b
        FROM market_view
        WHERE {where}
        ORDER BY CAST(event_date AS DATE) ASC, condition_id ASC
        LIMIT 1
        """,
        params,
    )
    found = _rows(result)
    return found[0] if found else None


def catalog(db_path: Path) -> dict[str, Any]:
    """Return real teams, games, and market coverage for a dataset."""

    conn = _open(db_path)
    try:
        market_cte, _ = _market_cte(conn)
        games = _rows(
            conn.execute(
                f"""
                WITH {market_cte}
                SELECT condition_id, event_id, event_slug, title, event_date,
                       team_a, team_b, normalized_market_status AS market_status,
                       normalized_resolution AS resolution_type, normalized_winner AS winner,
                       normalized_price_a AS current_price_a, normalized_price_b AS current_price_b
                FROM market_view
                ORDER BY CAST(event_date AS DATE) DESC, condition_id DESC
                """
            )
        )
        teams = sorted({team for game in games for team in (game.get("team_a"), game.get("team_b")) if team})
        resolved = sum(game.get("resolution_type") == "resolved" for game in games)
        return {
            "teams": teams,
            "games": games,
            "summary": {
                "games": len(games),
                "resolved_games": resolved,
                "unresolved_games": len(games) - resolved,
            },
        }
    finally:
        conn.close()


def leaderboard(
    db_path: Path,
    *,
    dimension: str,
    team: str | None = None,
    condition_id: str | None = None,
    sample: str = "season",
    min_picks: int = 5,
    include_no_pick: bool = False,
    search: str = "",
    sort: str = "confidence_score",
    direction: str = "desc",
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    start_date: str | None = None,
    end_date: str | None = None,
    export_all: bool = False,
) -> dict[str, Any]:
    """Return a paginated, sample-size-aware trader leaderboard."""

    if dimension not in {"team", "game"}:
        raise ValueError("dimension must be team or game")
    if dimension == "team" and not team:
        raise ValueError("team is required for the team leaderboard")
    if dimension == "game" and not condition_id:
        raise ValueError("condition_id is required for the game leaderboard")
    min_picks = max(1, min(int(min_picks), 10000))
    page = max(1, int(page))
    page_size = max(1, min(int(page_size), MAX_PAGE_SIZE))
    sample_limit = SAMPLE_WINDOWS.get(sample)
    search_value = search.strip().lower()

    conn = _open(db_path)
    try:
        market_cte, _ = _market_cte(conn)
        expressions = _ledger_expressions(conn)
        scope_filters = ["m.normalized_resolution = 'resolved'", f"{expressions['result']} IN ('win', 'loss')"]
        params: list[Any] = []
        target_team_a = team or ""
        target_team_b = team or ""
        if condition_id:
            target_teams = conn.execute("SELECT team_a, team_b FROM market_dim WHERE condition_id = ?", [condition_id]).fetchone()
            if target_teams:
                target_team_a = target_teams[0] or ""
                target_team_b = target_teams[1] or ""
        if dimension == "team":
            scope_filters.append("(m.team_a = ? OR m.team_b = ?)")
            params.extend([team, team])
        if start_date:
            scope_filters.append("CAST(m.event_date AS DATE) >= CAST(? AS DATE)")
            params.append(start_date)
        if end_date:
            scope_filters.append("CAST(m.event_date AS DATE) <= CAST(? AS DATE)")
            params.append(end_date)

        aggregate_having = f"HAVING COUNT(*) >= {min_picks}"
        if dimension == "game" and not include_no_pick:
            aggregate_having += " AND wallet IN (SELECT wallet FROM trade_fact WHERE condition_id = ?)"

        scoped = f"""
            scoped_base AS (
                SELECT
                    l.wallet,
                    COALESCE(NULLIF(l.name, ''), NULLIF(l.pseudonym, ''), l.wallet) AS display_name,
                    l.name,
                    l.pseudonym,
                    l.condition_id,
                    m.event_date,
                    m.team_a,
                    m.team_b,
                    m.title,
                    m.event_slug,
                    {expressions['result']} AS result,
                    COALESCE({expressions['pnl']}, 0.0) AS total_pnl,
                    COALESCE({expressions['buy_cost']}, 0.0) AS buy_cost,
                    COALESCE(b.buy_shares, 0.0) AS buy_shares,
                    ROW_NUMBER() OVER (
                        PARTITION BY l.wallet
                        ORDER BY CAST(m.event_date AS DATE) DESC, l.condition_id DESC
                    ) AS sample_rank
                FROM wallet_game_ledger l
                JOIN market_view m USING (condition_id)
                LEFT JOIN (
                    SELECT wallet, condition_id,
                           SUM(CASE WHEN UPPER(side) = 'BUY' THEN size ELSE 0 END) AS buy_shares
                    FROM trade_fact
                    GROUP BY wallet, condition_id
                ) b USING (wallet, condition_id)
                WHERE {' AND '.join(scope_filters)}
            ), scoped AS (
                SELECT *
                FROM scoped_base
                WHERE {('sample_rank <= ' + str(sample_limit)) if sample_limit else 'TRUE'}
            ), aggregates AS (
                SELECT
                    wallet,
                    MAX(display_name) AS display_name,
                    MAX(name) AS name,
                    MAX(pseudonym) AS pseudonym,
                    COUNT(*)::INTEGER AS picks,
                    SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END)::INTEGER AS wins,
                    SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END)::INTEGER AS losses,
                    SUM(total_pnl) AS total_pnl,
                    SUM(buy_cost) AS buy_cost,
                    SUM(buy_shares) AS buy_shares,
                    CASE WHEN SUM(buy_shares) > 0 THEN SUM(buy_cost) / SUM(buy_shares) ELSE NULL END AS avg_entry_price,
                    LIST(result ORDER BY CAST(event_date AS DATE) DESC, condition_id DESC) AS result_sequence,
                    MAX(event_date) AS latest_pick_date,
                    SUM(CASE WHEN team_a = ? OR team_b = ? THEN 1 ELSE 0 END)::INTEGER AS team_a_picks,
                    SUM(CASE WHEN (team_a = ? OR team_b = ?) AND result = 'win' THEN 1 ELSE 0 END)::INTEGER AS team_a_wins,
                    SUM(CASE WHEN team_a = ? OR team_b = ? THEN 1 ELSE 0 END)::INTEGER AS team_b_picks,
                    SUM(CASE WHEN (team_a = ? OR team_b = ?) AND result = 'win' THEN 1 ELSE 0 END)::INTEGER AS team_b_wins,
                    COUNT(*) FILTER (WHERE condition_id = ?)::INTEGER AS target_picks,
                    MAX(result) FILTER (WHERE condition_id = ?) AS target_result,
                    SUM(total_pnl) FILTER (WHERE condition_id = ?) AS target_pnl
                FROM scoped
                GROUP BY wallet
                {aggregate_having}
            ), scored AS (
                SELECT *,
                       wins::DOUBLE / NULLIF(picks, 0) AS raw_accuracy,
                       CASE WHEN buy_cost > 0 THEN total_pnl / buy_cost ELSE NULL END AS roi,
                       {_wilson_sql('wins::DOUBLE', 'picks::DOUBLE')} AS confidence_score
                FROM aggregates
            )
        """
        target_id = condition_id or ""
        count_params = [
            *params,
            target_team_a,
            target_team_a,
            target_team_a,
            target_team_a,
            target_team_b,
            target_team_b,
            target_team_b,
            target_team_b,
            target_id,
            target_id,
            target_id,
        ]
        if dimension == "game" and not include_no_pick:
            count_params.append(target_id)
        count_result = conn.execute(f"WITH {market_cte}, {scoped} SELECT COUNT(*) FROM scored", count_params)
        total = int(count_result.fetchone()[0])

        allowed_sort = {
            "rank": "confidence_score",
            "confidence_score": "confidence_score",
            "raw_accuracy": "raw_accuracy",
            "picks": "picks",
            "wins": "wins",
            "total_pnl": "total_pnl",
            "roi": "roi",
            "avg_entry_price": "avg_entry_price",
            "latest_pick_date": "latest_pick_date",
            "display_name": "display_name",
        }
        order_column = allowed_sort.get(sort, "confidence_score")
        order_direction = "ASC" if direction.lower() == "asc" else "DESC"
        query_params = [*count_params]
        search_filter = ""
        if search_value:
            search_filter = "WHERE lower(display_name) LIKE ? OR lower(wallet) LIKE ?"
            query_params.extend([f"%{search_value}%", f"%{search_value}%"])
        # Search is applied before the count returned to the client.  Re-run the
        # count with the same filter so pagination remains honest.
        if search_value:
            total = int(
                conn.execute(
                    f"WITH {market_cte}, {scoped} SELECT COUNT(*) FROM scored {search_filter}",
                    query_params,
                ).fetchone()[0]
            )
        if export_all:
            page = 1
            page_size = max(total, 1)
        offset = (page - 1) * page_size
        query_params.extend([page_size, offset])
        rows = _rows(
            conn.execute(
                f"""
                WITH {market_cte}, {scoped}
                SELECT * EXCLUDE (result_sequence)
                FROM scored
                {search_filter}
                ORDER BY {order_column} {order_direction} NULLS LAST, wallet ASC
                LIMIT ? OFFSET ?
                """,
                query_params,
            )
        )

        target_game: dict[str, Any] | None = None
        position_map: dict[str, dict[str, Any]] = {}
        if condition_id:
            target_result = conn.execute(
                f"""
                WITH {market_cte}
                SELECT condition_id, event_id, event_slug, title, event_date, team_a, team_b,
                       normalized_market_status AS market_status,
                       normalized_resolution AS resolution_type,
                       normalized_price_a AS current_price_a,
                       normalized_price_b AS current_price_b
                FROM market_view
                WHERE condition_id = ?
                """,
                [condition_id],
            )
            found = _rows(target_result)
            target_game = found[0] if found else None
            position_map = _position_map(conn, condition_id)
        elif team:
            target_game = _next_market(conn, team)
            if target_game:
                position_map = _position_map(conn, str(target_game["condition_id"]))

        for row in rows:
            # DuckDB LIST values are excluded from the JSON row, so fetch the
            # sequence in a tiny keyed query only for the visible page.
            sequence = conn.execute(
                f"""
                WITH {market_cte}, {scoped}
                SELECT result_sequence FROM scored WHERE wallet = ?
                """,
                [*count_params, row["wallet"]],
            ).fetchone()
            row["current_streak"] = _current_streak(sequence[0] if sequence else None)
            row["record"] = f"{row.get('wins', 0)}-{row.get('losses', 0)}"
            row["raw_accuracy_pct"] = round(float(row["raw_accuracy"] or 0.0) * 100, 2)
            row["confidence_score_pct"] = round(float(row["confidence_score"] or 0.0) * 100, 2)
            row["roi_pct"] = round(float(row["roi"] or 0.0) * 100, 2) if row.get("roi") is not None else None
            row["full_wallet"] = row["wallet"]
            row["wallet_short"] = f"{row['wallet'][:6]}…{row['wallet'][-4:]}"
            if target_game:
                position = position_map.get(row["wallet"], {})
                row["current_pick"] = _pick_label(
                    position.get("net_a"),
                    position.get("net_b"),
                    target_game.get("team_a"),
                    target_game.get("team_b"),
                )
                row["latest_pick_timestamp"] = position.get("last_trade_timestamp")
            else:
                row["current_pick"] = None
                row["latest_pick_timestamp"] = None
            if dimension == "game" and target_game:
                team_a_picks = int(row.get("team_a_picks") or 0)
                team_a_wins = int(row.get("team_a_wins") or 0)
                team_b_picks = int(row.get("team_b_picks") or 0)
                team_b_wins = int(row.get("team_b_wins") or 0)
                row["team_a_accuracy_pct"] = round(team_a_wins / team_a_picks * 100, 2) if team_a_picks else None
                row["team_b_accuracy_pct"] = round(team_b_wins / team_b_picks * 100, 2) if team_b_picks else None
                combined_picks = team_a_picks + team_b_picks
                row["combined_accuracy_pct"] = round((team_a_wins + team_b_wins) / combined_picks * 100, 2) if combined_picks else None
                row["target_result"] = row.get("target_result")
                row["target_pnl"] = row.get("target_pnl")

        return {
            "dimension": dimension,
            "filters": {
                "team": team,
                "condition_id": condition_id,
                "sample": sample,
                "min_picks": min_picks,
                "include_no_pick": include_no_pick,
                "search": search,
                "start_date": start_date,
                "end_date": end_date,
            },
            "target_game": target_game,
            "rows": rows,
            "page": page,
            "page_size": page_size,
            "total": total,
            "pages": max(1, math.ceil(total / page_size)) if total else 0,
            "methodology": {
                "accuracy": "Profitable resolved wallet × game ledgers divided by non-flat resolved ledgers; this is not directional pick accuracy.",
                "confidence_score": "95% Wilson lower bound of the raw profitable-game rate.",
                "roi": "Realized P&L divided by settled BUY cost; shown only where settled BUY cost is positive.",
                "minimum_sample": "Only traders with at least the selected number of resolved, non-flat ledgers are included.",
                "unresolved": "Unresolved, cancelled, voided, and tie markets are excluded from accuracy rankings.",
            },
        }
    finally:
        conn.close()


def trader_detail(db_path: Path, wallet: str, *, limit: int = 50) -> dict[str, Any]:
    """Return a real trader timeline and dimension summaries."""

    if not wallet:
        raise ValueError("wallet is required")
    limit = max(1, min(int(limit), 200))
    conn = _open(db_path)
    try:
        market_cte, _ = _market_cte(conn)
        expressions = _ledger_expressions(conn)
        ledger_columns = _column_names(conn, "wallet_game_ledger")
        net_shares_a = "l.net_shares_a" if "net_shares_a" in ledger_columns else "0.0"
        net_shares_b = "l.net_shares_b" if "net_shares_b" in ledger_columns else "0.0"
        rows = _rows(
            conn.execute(
                f"""
                WITH {market_cte}
                SELECT l.condition_id, m.event_date, m.title, m.team_a, m.team_b,
                       m.event_slug, m.market_type, m.normalized_resolution AS resolution_type,
                       {expressions['result']} AS result,
                       COALESCE({expressions['pnl']}, 0.0) AS pnl,
                       COALESCE({expressions['buy_cost']}, 0.0) AS buy_cost,
                       {net_shares_a} AS net_shares_a, {net_shares_b} AS net_shares_b,
                       l.trade_count, l.first_trade_timestamp, l.last_trade_timestamp,
                       l.name, l.pseudonym
                FROM wallet_game_ledger l
                JOIN market_view m USING (condition_id)
                WHERE l.wallet = ?
                ORDER BY CAST(m.event_date AS DATE) DESC, l.condition_id DESC
                LIMIT ?
                """,
                [wallet.lower(), limit],
            )
        )
        resolved = [row for row in rows if row.get("resolution_type") == "resolved" and row.get("result") in {"win", "loss"}]
        wins = sum(row.get("result") == "win" for row in resolved)
        losses = sum(row.get("result") == "loss" for row in resolved)
        total_pnl = sum(float(row.get("pnl") or 0) for row in resolved)
        buy_cost = sum(float(row.get("buy_cost") or 0) for row in resolved)
        trend: list[dict[str, Any]] = []
        cumulative = 0.0
        recent_results: list[str] = []
        for row in sorted(rows, key=lambda item: (str(item.get("event_date") or ""), str(item.get("condition_id") or ""))):
            cumulative += float(row.get("pnl") or 0)
            if row.get("result") in {"win", "loss"}:
                recent_results.append(str(row["result"]))
            window = recent_results[-5:]
            row["cumulative_pnl"] = cumulative
            row["rolling_accuracy_pct"] = round(sum(result == "win" for result in window) / len(window) * 100, 2) if window else None
            row["rolling_sample"] = len(window)
            trend.append({
                "condition_id": row.get("condition_id"),
                "event_date": row.get("event_date"),
                "result": row.get("result"),
                "pnl": row.get("pnl"),
                "cumulative_pnl": round(cumulative, 8),
                "rolling_accuracy_pct": row.get("rolling_accuracy_pct"),
                "rolling_sample": row.get("rolling_sample"),
            })
        return {
            "wallet": wallet.lower(),
            "display_name": next((row.get("name") or row.get("pseudonym") for row in rows if row.get("name") or row.get("pseudonym")), wallet.lower()),
            "record": f"{wins}-{losses}",
            "wins": wins,
            "losses": losses,
            "resolved_picks": len(resolved),
            "raw_accuracy_pct": round(wins / len(resolved) * 100, 2) if resolved else None,
            "total_pnl": total_pnl,
            "roi_pct": round(total_pnl / buy_cost * 100, 2) if buy_cost else None,
            "recent_picks": rows,
            "trend": trend,
            "by_team": _group_team_rows(rows),
            "by_market_type": _group_rows(rows, "market_type"),
            "methodology": "Timeline uses wallet × game ledgers from the local DuckDB snapshot; unresolved rows remain visible but do not count toward accuracy.",
        }
    finally:
        conn.close()


def _group_rows(rows: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        value = row.get(key) or "Unknown"
        item = grouped.setdefault(value, {"label": value, "picks": 0, "wins": 0, "losses": 0, "pnl": 0.0})
        if row.get("result") in {"win", "loss"}:
            item["picks"] += 1
            item["wins"] += row.get("result") == "win"
            item["losses"] += row.get("result") == "loss"
        item["pnl"] += float(row.get("pnl") or 0)
    for item in grouped.values():
        item["accuracy_pct"] = round(item["wins"] / item["picks"] * 100, 2) if item["picks"] else None
    return sorted(grouped.values(), key=lambda item: item["pnl"], reverse=True)


def _group_team_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Count performance only for single-sided net positions by team.

    A matchup contains two teams, but a wallet's realized result cannot be
    attributed to both teams at once.  Hedged and flat ledgers are therefore
    intentionally omitted from this breakdown.
    """

    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        net_a = float(row.get("net_shares_a") or 0.0)
        net_b = float(row.get("net_shares_b") or 0.0)
        if net_a > 1e-9 and net_b <= 1e-9:
            team = row.get("team_a")
        elif net_b > 1e-9 and net_a <= 1e-9:
            team = row.get("team_b")
        else:
            team = None
        if not team:
            continue
        item = grouped.setdefault(team, {"label": team, "picks": 0, "wins": 0, "losses": 0, "pnl": 0.0})
        if row.get("result") in {"win", "loss"}:
            item["picks"] += 1
            item["wins"] += row.get("result") == "win"
            item["losses"] += row.get("result") == "loss"
        item["pnl"] += float(row.get("pnl") or 0)
    for item in grouped.values():
        item["accuracy_pct"] = round(item["wins"] / item["picks"] * 100, 2) if item["picks"] else None
    return sorted(grouped.values(), key=lambda item: item["pnl"], reverse=True)


def game_trends(db_path: Path, condition_id: str) -> dict[str, Any]:
    """Return descriptive, sample-sized trade and position trends for a game."""

    if not condition_id:
        raise ValueError("condition_id is required")
    conn = _open(db_path)
    try:
        market_cte, _ = _market_cte(conn)
        game_rows = _rows(
            conn.execute(
                f"""
                WITH {market_cte}
                SELECT condition_id, event_id, event_slug, title, event_date, team_a, team_b,
                       normalized_market_status AS market_status,
                       normalized_resolution AS resolution_type,
                       normalized_price_a AS current_price_a,
                       normalized_price_b AS current_price_b,
                       normalized_winner AS winner
                FROM market_view WHERE condition_id = ?
                """,
                [condition_id],
            )
        )
        if not game_rows:
            raise ValueError("game not found")
        game = game_rows[0]
        positions = _rows(
            conn.execute(
                """
                WITH positions AS (
                    SELECT wallet,
                        SUM(CASE WHEN outcome_index = 0 AND UPPER(side) = 'BUY' THEN size
                                 WHEN outcome_index = 0 AND UPPER(side) = 'SELL' THEN -size ELSE 0 END) AS net_a,
                        SUM(CASE WHEN outcome_index = 1 AND UPPER(side) = 'BUY' THEN size
                                 WHEN outcome_index = 1 AND UPPER(side) = 'SELL' THEN -size ELSE 0 END) AS net_b,
                        MAX(trade_timestamp) AS last_trade_timestamp,
                        SUM(size * price) AS gross_volume
                    FROM trade_fact
                    WHERE condition_id = ?
                    GROUP BY wallet
                )
                SELECT *,
                    CASE WHEN net_a > 0 AND net_b > 0 THEN 'Hedged'
                         WHEN net_a > 0 THEN 'Team A'
                         WHEN net_b > 0 THEN 'Team B'
                         ELSE 'Flat' END AS selection
                FROM positions
                """,
                [condition_id],
            )
        )
        side_counts = {"Team A": 0, "Team B": 0, "Hedged": 0, "Flat": 0}
        side_volume = {key: 0.0 for key in side_counts}
        for row in positions:
            selection = row.get("selection") or "Flat"
            side_counts[selection] = side_counts.get(selection, 0) + 1
            side_volume[selection] = side_volume.get(selection, 0.0) + float(row.get("gross_volume") or 0)
        timeline = _rows(
            conn.execute(
                """
                SELECT CAST(DATE_TRUNC('hour', trade_time_utc) AS VARCHAR) AS hour,
                       COUNT(*)::INTEGER AS trades,
                       COUNT(DISTINCT wallet)::INTEGER AS wallets,
                       SUM(size * price) AS volume,
                       AVG(price) AS average_price,
                       AVG(CASE WHEN outcome_index = 0 THEN price ELSE NULL END) AS average_price_a,
                       AVG(CASE WHEN outcome_index = 1 THEN price ELSE NULL END) AS average_price_b
                FROM trade_fact
                WHERE condition_id = ?
                GROUP BY 1
                ORDER BY 1
                """,
                [condition_id],
            )
        )
        return {
            "game": game,
            "selection_counts": side_counts,
            "selection_volume": side_volume,
            "tracked_wallets": len(positions),
            "timeline": timeline,
            "methodology": "Selections are net positions at the snapshot timestamp. A wallet with positive exposure to both outcomes is labelled Hedged. Percentages must be read with the displayed wallet sample size.",
        }
    finally:
        conn.close()
