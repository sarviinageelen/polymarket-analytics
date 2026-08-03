import tempfile
import unittest
from pathlib import Path

try:
    import duckdb
except ModuleNotFoundError:  # pragma: no cover - the base test environment is intentionally light
    duckdb = None

if duckdb is not None:
    from polymarket_analytics.analytics import catalog, game_trends, leaderboard, trader_detail


@unittest.skipIf(duckdb is None, "DuckDB analytics dependencies are not installed")
class AnalyticsTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "analytics.duckdb"
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
                outcome_index INTEGER, trade_timestamp BIGINT, trade_time_utc TIMESTAMP
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
            "INSERT INTO trade_fact VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                ("0x1", "BUY", 10, 0.6, "g1", 0, 1, "2025-01-01 00:01:00"),
                ("0x1", "BUY", 10, 0.6, "g2", 1, 2, "2025-01-02 00:01:00"),
                ("0x1", "BUY", 10, 0.55, "g3", 0, 3, "2025-01-03 00:01:00"),
                ("0x2", "BUY", 10, 0.6, "g1", 0, 1, "2025-01-01 00:02:00"),
                ("0x2", "BUY", 10, 0.6, "g2", 1, 2, "2025-01-02 00:02:00"),
                ("0x2", "BUY", 10, 0.55, "g3", 1, 3, "2025-01-03 00:02:00"),
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


if __name__ == "__main__":
    unittest.main()
