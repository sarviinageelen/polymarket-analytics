import json
import tempfile
import unittest
from pathlib import Path

try:
    import duckdb
    import pyarrow as pa
    import pyarrow.parquet as pq
except ModuleNotFoundError:  # pragma: no cover - optional data dependencies
    duckdb = None
    pa = None
    pq = None

if duckdb is not None:
    from scripts.analyze_sports_moneyline import candidates
    from scripts.build_nav_duckdb import build_database


@unittest.skipIf(duckdb is None or pa is None, "DuckDB and PyArrow are required")
class PrematchPipelineTests(unittest.TestCase):
    def test_kickoff_cutoff_excludes_at_and_after_kickoff_trades(self):
        with tempfile.TemporaryDirectory() as temporary:
            experiment = Path(temporary)
            trade_dir = experiment / "bronze" / "trades"
            trade_dir.mkdir(parents=True)
            market = {
                "condition_id": "game-1",
                "event_id": "event-1",
                "event_slug": "team-a-team-b",
                "title": "Team A vs Team B",
                "market_type": "moneyline",
                "season": "Test 2026",
                "event_date": "2026-08-05",
                "game_start_ts": 100,
                "game_start_source": "market.gameStartTime",
                "market_start_ts": 1,
                "market_end_ts": 200,
                "slug": "team-a-team-b",
                "outcomes": '["Team A","Team B"]',
                "outcome_prices": '["1","0"]',
                "market_closed": True,
                "event_closed": True,
                "event_live": False,
                "event_ended": True,
                "market_active": False,
                "market_archived": False,
                "accepting_orders": False,
                "uma_resolution_status": "resolved",
                "event_active": False,
                "event_archived": False,
                "event_period": "finished",
                "market_status": "closed",
            }
            pq.write_table(pa.Table.from_pylist([market]), experiment / "moneyline_markets.parquet")

            def trade(timestamp, outcome_index, price, transaction_hash):
                return {
                    "proxyWallet": "0xabc",
                    "side": "BUY",
                    "asset": f"asset-{outcome_index}",
                    "price": price,
                    "size": 10.0,
                    "conditionId": "game-1",
                    "timestamp": timestamp,
                    "transactionHash": transaction_hash,
                    "outcome": ("Team A", "Team B")[outcome_index],
                    "outcomeIndex": outcome_index,
                    "name": "Tester",
                    "pseudonym": "",
                    "eventSlug": "team-a-team-b",
                    "title": "Team A vs Team B",
                    "event_id": "event-1",
                    "market_type": "moneyline",
                    "season": "Test 2026",
                    "market_start_ts": 1,
                    "market_end_ts": 200,
                }

            pq.write_table(
                pa.Table.from_pylist(
                    [
                        trade(90, 0, 0.40, "0xpre"),
                        trade(100, 0, 0.99, "0xat"),
                        trade(110, 1, 0.99, "0xpost"),
                    ]
                ),
                trade_dir / "part.parquet",
            )
            (experiment / "manifest.json").write_text(
                json.dumps({"trade_rows": 3, "season": "Test 2026"}),
                encoding="utf-8",
            )

            db_path = experiment / "silver" / "test.duckdb"
            counts = build_database(experiment, db_path)
            self.assertEqual(counts["trade_rows"], 3)
            self.assertEqual(counts["prematch_trade_rows"], 1)

            conn = duckdb.connect(str(db_path), read_only=True)
            row = conn.execute(
                """
                SELECT trade_count, post_kickoff_trade_count, all_trade_count,
                       last_trade_timestamp, seconds_before_kickoff, primary_pick,
                       result, pick_result, buy_cost
                FROM wallet_game_prematch_ledger
                """
            ).fetchone()
            conn.close()
            self.assertEqual(row[:5], (1, 2, 3, 90, 10))
            self.assertEqual(row[5:8], ("Team A", "win", "win"))
            self.assertAlmostEqual(row[8], 4.0)

    def test_candidate_filter_has_no_minimum_buy_cost(self):
        low_turnover = {
            "settled_markets": 5,
            "wins": 4,
            "losses": 1,
            "win_rate": 0.80,
            "settled_buy_cost": 1.0,
        }
        self.assertEqual(candidates([low_turnover], 5), [low_turnover])


if __name__ == "__main__":
    unittest.main()
