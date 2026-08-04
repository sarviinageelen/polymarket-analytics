import unittest

from polymarket_analytics.api import PolymarketAPI


class FakeGammaAPI(PolymarketAPI):
    def __init__(self):
        super().__init__()
        self.calls = []

    def gamma(self, path, **params):
        self.calls.append((path, params))
        closed = params["closed"]
        cursor = params.get("after_cursor")
        if closed == "true" and cursor is None:
            return {
                "events": [
                    {"id": "2", "eventDate": "2026-08-02"},
                    {"id": "1", "eventDate": "2026-08-01"},
                ],
                "next_cursor": "closed-next",
            }
        if closed == "true":
            return {"events": [{"id": "2", "eventDate": "2026-08-02"}]}
        return {
            "events": [
                {"id": "3", "eventDate": "2026-08-03"},
                {"id": "2", "eventDate": "2026-08-02", "live": True},
            ]
        }


class SeriesEventTests(unittest.TestCase):
    def test_include_open_unions_and_deduplicates_views(self):
        api = FakeGammaAPI()
        events = api.fetch_series_events(10105, include_open=True)
        self.assertEqual([event["id"] for event in events], ["1", "2", "3"])
        self.assertEqual(len(api.calls), 3)
        self.assertEqual({call[1]["closed"] for call in api.calls}, {"true", "false"})

    def test_historical_fetch_only_uses_closed_view(self):
        api = FakeGammaAPI()
        events = api.fetch_series_events(10105, include_open=False)
        self.assertEqual([event["id"] for event in events], ["1", "2"])
        self.assertEqual(len(api.calls), 2)
        self.assertTrue(all(call[1]["closed"] == "true" for call in api.calls))


if __name__ == "__main__":
    unittest.main()
