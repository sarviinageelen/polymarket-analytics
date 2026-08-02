import unittest

from scripts.control_panel_server import (
    build_pipeline_commands,
    interval_seconds,
    normalize_config,
    public_download_url,
)


class ControlPanelTests(unittest.TestCase):
    def test_schedule_interval_supports_minutes_and_hours(self):
        config = normalize_config({"interval_value": 15, "interval_unit": "minutes"})
        self.assertEqual(interval_seconds(config), 900)
        config = normalize_config({"interval_value": 2, "interval_unit": "hours"})
        self.assertEqual(interval_seconds(config), 7200)

    def test_invalid_dataset_and_interval_are_rejected(self):
        with self.assertRaises(ValueError):
            normalize_config({"sport": "mlb_2026"})
        with self.assertRaises(ValueError):
            normalize_config({"interval_value": 0})

    def test_pipeline_is_explicit_and_cache_aware(self):
        commands = build_pipeline_commands("wnba_2026", full_validation=False)
        labels = [label for label, _ in commands]
        self.assertEqual(labels[-1], "Validate the refreshed snapshot")
        validation = commands[-1][1]
        self.assertIn("--skip-network", validation)
        self.assertIn("--experiment-dir", commands[2][1])
        self.assertIn("--output", commands[4][1])

    def test_download_url_points_to_the_selected_branch(self):
        url = public_download_url("wnba_2026", "agent/organize-documentation")
        self.assertIn("github.com/sarviinageelen/polymarket-analytics/raw/refs/heads/", url)
        self.assertTrue(url.endswith("reports/generated/wnba_2026_moneyline_picks.xlsx"))

if __name__ == "__main__":
    unittest.main()
