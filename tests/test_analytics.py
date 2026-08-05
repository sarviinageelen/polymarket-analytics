import json
import tempfile
import unittest
from pathlib import Path

try:
    import duckdb
except ModuleNotFoundError:  # pragma: no cover - the base test environment is intentionally light
    duckdb = None

if duckdb is not None:
    from polymarket_analytics.analytics import catalog, game_trends, leaderboard, odds_performance, trader_detail


@unittest.skipIf(duckdb is None, "DuckDB analytics dependencies are not installed")
class AnalyticsTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "analytics.duckdb"
        self.events_path = Path(self.temp_dir.name) / "events.json"
        self.events_path.write_text(json.dumps([
            {
                "id": "1",
                "startTime": "2025-01-01T00:00:00Z",
                "teams": [{"name": "Team A", "ordering": "home"}, {"name": "Team B", "ordering": "away"}],
                "markets": [{"conditionId": "g1", "gameStartTime": "2025-01-01T00:00:00Z", "outcomes": ["Team A", "Team B"]}],
            },
            {
                "id": "2",
                "startTime": "2025-01-02T00:00:00Z",
                "teams": [{"name": "Team A", "ordering": "away"}, {"name": "Team C", "ordering": "home"}],
                "markets": [{"conditionId": "g2", "gameStartTime": "2025-01-02T00:00:00Z", "outcomes": ["Team A", "Team C"]}],
            },
        ]), encoding="utf-8")
        conn = duckdb.connect(str(self.db_path))
        conn.execute(
            """
            CREATE TABLE market_dim (
                condition_id VARCHAR, event_id VARCHAR, event_slug VARCHAR, title VARCHAR,
                market_type VARCHAR, season VARCHAR, event_date DATE, team_a VARCHAR, team_b VARCHAR,
                outcomes VARCHAR, outcome_prices VARCHAR, resolution_type VARCHAR, winner VARCHAR,
                current_price_a DOUBLE, current_price_b DOUBLE, final_price_a DOUBLE, final_price_b DOUBLE
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE trade_fact (
                wallet VARCHAR, side VARCHAR, size DOUBLE, price DOUBLE, condition_id VARCHAR,
                outcome_index INTEGER, trade_timestamp BIGINT, trade_time_utc TIMESTAMP, transaction_hash VARCHAR
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE wallet_game_ledger (
                wallet VARCHAR, condition_id VARCHAR, name VARCHAR, pseudonym VARCHAR,
                trade_count INTEGER, first_trade_timestamp BIGINT, last_trade_timestamp BIGINT,
                buy_cost DOUBLE, pnl DOUBLE, result VARCHAR, resolution_type VARCHAR
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE wallet_game_prematch_ledger (
                wallet VARCHAR, condition_id VARCHAR, name VARCHAR, pseudonym VARCHAR,
                trade_count INTEGER, first_trade_timestamp BIGINT, last_trade_timestamp BIGINT,
                buy_cost DOUBLE, buy_shares DOUBLE, pnl DOUBLE, realized_pnl DOUBLE,
                result VARCHAR, resolution_type VARCHAR, net_shares_a DOUBLE,
                net_shares_b DOUBLE, qualifying_position BOOLEAN
            )
            """
        )
        conn.executemany(
            "INSERT INTO market_dim VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                ("g1", "1", "g1", "A vs B", "moneyline", "test", "2025-01-01", "Team A", "Team B", "[]", "[]", "resolved", "Team A", 1, 0, 1, 0),
                ("g2", "2", "g2", "A vs C", "moneyline", "test", "2025-01-02", "Team A", "Team C", "[]", "[]", "resolved", "Team C", 0, 1, 0, 1),
                ("g3", "3", "g3", "A vs D", "moneyline", "test", "2099-01-03", "Team A", "Team D", "[]", "[]", "unresolved", None, 0.55, 0.45, None, None),
            ],
        )
        conn.executemany(
            "INSERT INTO wallet_game_ledger VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                ("0x1", "g1", "Trader One", "", 1, 1, 1, 10, 4, "win", "resolved"),
                ("0x1", "g2", "Trader One", "", 1, 2, 2, 10, -3, "loss", "resolved"),
                ("0x2", "g1", "Trader Two", "", 1, 1, 1, 10, 2, "win", "resolved"),
                ("0x2", "g2", "Trader Two", "", 1, 2, 2, 10, 2, "win", "resolved"),
            ],
        )
        conn.executemany(
            "INSERT INTO wallet_game_prematch_ledger VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                ("0x1", "g1", "Trader One", "", 1, 1, 1, 10, 10, 4, 4, "win", "resolved", 10, 0, True),
                ("0x1", "g2", "Trader One", "", 1, 2, 2, 10, 10, -3, -3, "loss", "resolved", 0, 10, True),
                ("0x2", "g1", "Trader Two", "", 1, 1, 1, 10, 10, 2, 2, "win", "resolved", 10, 0, True),
                ("0x2", "g2", "Trader Two", "", 1, 2, 2, 10, 10, 2, 2, "win", "resolved", 0, 10, True),
            ],
        )
        conn.executemany(
            "INSERT INTO trade_fact VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                ("0x1", "BUY", 10, 0.6, "g1", 0, 1, "2025-01-01 00:01:00", "g1-a1"),
                ("0x1", "BUY", 10, 0.6, "g2", 1, 2, "2025-01-02 00:01:00", "g2-b1"),
                ("0x1", "BUY", 10, 0.55, "g3", 0, 3, "2025-01-03 00:01:00", "g3-a1"),
                ("0x2", "BUY", 10, 0.6, "g1", 0, 1, "2025-01-01 00:02:00", "g1-a2"),
                ("0x2", "BUY", 10, 0.6, "g2", 1, 2, "2025-01-02 00:02:00", "g2-b2"),
                ("0x2", "BUY", 10, 0.55, "g3", 1, 3, "2025-01-03 00:02:00", "g3-b2"),
            ],
        )
        conn.executemany(
            "INSERT INTO trade_fact VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                ("0x3", "BUY", 10, 0.4, "g1", 1, 1, "2025-01-01 00:03:00", "g1-b"),
                ("0x3", "BUY", 10, 0.4, "g2", 0, 2, "2025-01-02 00:03:00", "g2-a"),
                # A trade stamped exactly at kickoff must not replace the
                # strictly pre-match price used by calibration analytics.
                ("0x4", "BUY", 10, 0.01, "g1", 0, 1735689600, "2025-01-01 00:00:00", "g1-at-kickoff"),
            ],
        )
        conn.close()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_catalog_and_wilson_score_are_source_backed(self):
        result = catalog(self.db_path)
        self.assertEqual(result["summary"]["games"], 3)
        leaderboard_result = leaderboard(self.db_path, dimension="team", team="Team A", min_picks=2, page_size=10)
        self.assertEqual(leaderboard_result["total"], 2)
        self.assertEqual(leaderboard_result["rows"][0]["wallet"], "0x2")
        self.assertLess(leaderboard_result["rows"][0]["confidence_score_pct"], 100)

    def test_game_trends_and_trader_detail_use_real_trades(self):
        trends = game_trends(self.db_path, "g3")
        self.assertEqual(trends["tracked_wallets"], 2)
        self.assertEqual(trends["selection_counts"]["Team A"], 1)
        self.assertEqual(trends["selection_counts"]["Team B"], 1)
        detail = trader_detail(self.db_path, "0x1")
        self.assertEqual(detail["record"], "1-1")
        self.assertEqual(len(detail["trend"]), 2)

    def test_odds_performance_reconciles_price_roles_and_venue(self):
        result = odds_performance(self.db_path, self.events_path)
        self.assertEqual(result["summary"]["selected_games"], 2)
        self.assertEqual(result["summary"]["favorite_wins"], 2)
        self.assertEqual(result["summary"]["home_away_games"], 2)
        self.assertEqual(result["games"][0]["home_implied_pct"], 60.0)
        self.assertEqual(result["games"][0]["away_result"], "loss")

        favorite_only = odds_performance(self.db_path, self.events_path, role="favorite")
        underdog_only = odds_performance(self.db_path, self.events_path, role="underdog")
        self.assertTrue(all(row["underdog"]["games"] == 0 for row in favorite_only["team_rows"]))
        self.assertTrue(all(row["favorite"]["games"] == 0 for row in underdog_only["team_rows"]))
        self.assertEqual(sum(row["favorite"]["games"] for row in favorite_only["team_rows"]), 2)
        self.assertEqual(sum(row["underdog"]["games"] for row in underdog_only["team_rows"]), 2)


if __name__ == "__main__":
    unittest.main()
