import unittest

from polymarket_analytics.trade_identity import trade_identity


class TradeIdentityTests(unittest.TestCase):
    def test_enrichment_changes_do_not_create_a_new_trade(self):
        base = {
            "proxyWallet": "0xABC",
            "asset": "token-1",
            "conditionId": "condition-1",
            "side": "buy",
            "size": "2.5",
            "price": "0.36",
            "timestamp": "123",
            "transactionHash": "0xHASH",
            "name": "Old name",
            "title": "Old title",
        }
        refreshed = {
            **base,
            "proxyWallet": "0xabc",
            "side": "BUY",
            "name": "New name",
            "title": "New title",
        }
        self.assertEqual(trade_identity(base), trade_identity(refreshed))

    def test_financial_fill_changes_create_a_new_trade(self):
        base = {
            "proxyWallet": "0xabc",
            "asset": "token-1",
            "conditionId": "condition-1",
            "side": "BUY",
            "size": 2.5,
            "price": 0.36,
            "timestamp": 123,
            "transactionHash": "0xhash",
        }
        changed = {**base, "price": 0.37}
        self.assertNotEqual(trade_identity(base), trade_identity(changed))


if __name__ == "__main__":
    unittest.main()
