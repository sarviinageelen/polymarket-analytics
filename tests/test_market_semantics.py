import unittest

from polymarket_analytics.market_semantics import is_moneyline_market


class MarketSemanticsTests(unittest.TestCase):
    def test_tagged_moneyline_is_selected(self):
        self.assertTrue(is_moneyline_market({"sportsMarketType": "moneyline"}))

    def test_props_are_not_selected(self):
        self.assertFalse(is_moneyline_market({"sportsMarketType": "totals", "slug": "cbb-a-b-2025-01-01"}, allow_untagged_binary=True))

    def test_legacy_cbb_binary_market_requires_opt_in(self):
        market = {"slug": "cbb-a-b-2025-01-01", "outcomes": '["A", "B"]'}
        self.assertFalse(is_moneyline_market(market))
        self.assertTrue(is_moneyline_market(market, allow_untagged_binary=True))

    def test_non_cbb_untagged_binary_market_is_not_selected(self):
        market = {"slug": "nba-a-b-2025-01-01", "outcomes": '["A", "B"]'}
        self.assertFalse(is_moneyline_market(market, allow_untagged_binary=True))


if __name__ == "__main__":
    unittest.main()
