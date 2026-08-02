import unittest

from polymarket_analytics.analysis import compact_market_index, replay_trades


def _market(condition_id="0xabc"):
    return {
        "id": "1",
        "slug": "nfl-test",
        "title": "Team A vs. Team B",
        "eventDate": "2025-09-07",
        "eventWeek": 1,
        "markets": [
            {
                "id": "2",
                "conditionId": condition_id,
                "question": "Team A vs. Team B",
                "slug": "nfl-test",
                "sportsMarketType": "moneyline",
                "outcomes": '["Team A", "Team B"]',
                "outcomePrices": '["0", "1"]',
                "volume": "1000",
            }
        ],
    }


class AnalysisTests(unittest.TestCase):
    def test_compact_market_index_parses_gamma_strings(self):
        index = compact_market_index([_market()])
        self.assertEqual(index["0xabc"]["outcomes"], ["Team A", "Team B"])
        self.assertEqual(index["0xabc"]["outcome_prices"], [0.0, 1.0])


    def test_trade_replay_includes_sell_and_settlement(self):
        condition = "0xabc"
        trades = [
            {
                "proxyWallet": "0xuser",
                "conditionId": condition,
                "side": "BUY",
                "size": 100,
                "price": 0.60,
                "outcomeIndex": 1,
                "timestamp": 1,
                "name": "tester",
            },
            {
                "proxyWallet": "0xuser",
                "conditionId": condition,
                "side": "SELL",
                "size": 50,
                "price": 0.80,
                "outcomeIndex": 1,
                "timestamp": 2,
                "name": "tester",
            },
        ]
        summaries, ledgers = replay_trades(trades, compact_market_index([_market()]))
        self.assertEqual(len(summaries), 1)
        self.assertEqual(len(ledgers), 1)
        self.assertAlmostEqual(summaries[0]["total_pnl"], 30.0, places=6)
        self.assertEqual(summaries[0]["wins"], 1)
        self.assertAlmostEqual(summaries[0]["roi"], 30 / 60, places=6)


    def test_losing_outcome_is_a_loss(self):
        condition = "0xabc"
        trades = [
            {
                "proxyWallet": "0xuser",
                "conditionId": condition,
                "side": "BUY",
                "size": 10,
                "price": 0.40,
                "outcomeIndex": 0,
                "timestamp": 1,
            }
        ]
        summaries, _ = replay_trades(trades, compact_market_index([_market()]))
        self.assertAlmostEqual(summaries[0]["total_pnl"], -4.0, places=6)
        self.assertEqual(summaries[0]["losses"], 1)


if __name__ == "__main__":
    unittest.main()
