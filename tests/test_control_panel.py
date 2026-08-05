import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from scripts.control_panel_server import (
    SPORTS,
    WORKBOOK_RELEASE_TAG,
    build_pipeline_commands,
    file_sha256,
    git_publication_paths,
    interval_seconds,
    next_due_sport,
    normalize_config,
    parse_output_metrics,
    public_download_url,
    redact_log_text,
    release_asset_is_current,
    schedule_config,
)


class ControlPanelTests(unittest.TestCase):
    def test_schedule_interval_supports_minutes_and_hours(self):
        config = normalize_config({"interval_value": 15, "interval_unit": "minutes"})
        self.assertEqual(interval_seconds(config), 900)
        config = normalize_config({"interval_value": 2, "interval_unit": "hours"})
        self.assertEqual(interval_seconds(config), 7200)

    def test_invalid_dataset_and_interval_are_rejected(self):
        with self.assertRaises(ValueError):
            normalize_config({"sport": "not_a_dataset"})
        with self.assertRaises(ValueError):
            normalize_config({"schedules": {"not_a_dataset": {"enabled": True}}})
        with self.assertRaises(ValueError):
            normalize_config({"interval_value": 0})

    def test_legacy_schedule_migrates_without_enabling_other_datasets(self):
        config = normalize_config(
            {
                "sport": "wnba_2026",
                "interval_value": 1,
                "interval_unit": "hours",
                "enabled": True,
                "auto_push": True,
            }
        )
        self.assertTrue(schedule_config(config, "wnba_2026")["enabled"])
        self.assertEqual(interval_seconds(config, "wnba_2026"), 3600)
        self.assertFalse(schedule_config(config, "wnba_2025")["enabled"])
        self.assertFalse(schedule_config(config, "nfl_2025")["enabled"])

    def test_each_dataset_schedule_can_be_updated_independently(self):
        base = normalize_config(
            {
                "schedules": {
                    "wnba_2026": {"enabled": True, "interval_value": 1},
                    "wnba_2025": {"enabled": True, "interval_value": 12},
                },
                "push_branch": "main",
            }
        )
        updated = normalize_config(
            {"sport": "wnba_2025", "enabled": False, "interval_value": 24},
            base,
        )
        self.assertTrue(schedule_config(updated, "wnba_2026")["enabled"])
        self.assertEqual(schedule_config(updated, "wnba_2026")["interval_value"], 1)
        self.assertFalse(schedule_config(updated, "wnba_2025")["enabled"])
        self.assertEqual(schedule_config(updated, "wnba_2025")["interval_value"], 24)
        self.assertEqual(updated["push_branch"], "main")

    def test_scheduler_selects_the_oldest_due_enabled_dataset(self):
        now = datetime(2026, 8, 4, 6, 0, tzinfo=timezone.utc)
        config = normalize_config(
            {
                "schedules": {
                    "wnba_2026": {"enabled": True},
                    "wnba_2025": {"enabled": True},
                    "nfl_2025": {"enabled": False},
                }
            }
        )
        next_runs = {
            "wnba_2026": (now - timedelta(minutes=5)).isoformat(),
            "wnba_2025": (now - timedelta(minutes=15)).isoformat(),
            "nfl_2025": (now - timedelta(hours=1)).isoformat(),
        }
        self.assertEqual(next_due_sport(config, next_runs, now), "wnba_2025")
        self.assertIsNone(next_due_sport(config, {key: now.isoformat() for key in SPORTS}, now - timedelta(seconds=1)))

    def test_pipeline_is_explicit_and_cache_aware(self):
        commands = build_pipeline_commands("wnba_2026", full_validation=False)
        labels = [label for label, _ in commands]
        self.assertEqual(labels[-1], "Validate the refreshed snapshot")
        validation = commands[-1][1]
        self.assertIn("--skip-network", validation)
        self.assertIn("--experiment-dir", commands[2][1])
        self.assertIn("--output", commands[4][1])
        self.assertIn("--report", commands[3][1])

    def test_wnba_2025_has_its_own_complete_season_scope(self):
        spec = SPORTS["wnba_2025"]
        self.assertEqual(spec["series_id"], 10105)
        self.assertEqual(spec["start_date"], "2025-05-16")
        self.assertEqual(spec["end_date"], "2025-10-17")

    def test_requested_2025_and_mlb_2026_datasets_have_independent_scopes(self):
        expected = {
            "nba_2025": 10345,
            "mlb_2025": 3,
            "mlb_2026": 3,
            "nhl_2025": 10346,
            "ncaaf_2025": 10210,
            "ncaab_2025": 10012,
        }
        for sport, series_id in expected.items():
            self.assertEqual(SPORTS[sport]["series_id"], series_id)
            self.assertIn("events", SPORTS[sport])
            self.assertIn("experiment_dir", SPORTS[sport])
            self.assertIn("validation", SPORTS[sport])
        self.assertTrue(SPORTS["ncaab_2025"]["allow_untagged_binary"])
        ncaab_commands = build_pipeline_commands("ncaab_2025", full_validation=False)
        self.assertIn("--allow-untagged-binary", ncaab_commands[1][1])
        self.assertIn("--allow-untagged-binary", ncaab_commands[-1][1])
        commands = build_pipeline_commands("wnba_2025", full_validation=True)
        flattened = [value for _, command in commands for value in command]
        self.assertIn("WNBA 2025", flattened)
        self.assertIn("data/raw/wnba_2025_events.json", flattened)
        self.assertNotIn("--skip-network", commands[-1][1])

    def test_download_url_points_to_the_stable_workbook_release(self):
        url = public_download_url("wnba_2026", "agent/organize-documentation")
        self.assertIn(f"/releases/download/{WORKBOOK_RELEASE_TAG}/", url)
        self.assertTrue(url.endswith("wnba_2026_moneyline_picks.xlsx"))
        historical_url = public_download_url("wnba_2025", "agent/organize-documentation")
        self.assertTrue(historical_url.endswith("wnba_2025_moneyline_picks.xlsx"))

    def test_git_publication_excludes_generated_workbooks(self):
        for sport, spec in SPORTS.items():
            paths = git_publication_paths(sport)
            self.assertEqual(paths, [spec["report"], spec["validation"]])
            self.assertNotIn(spec["workbook"], paths)

    def test_release_digest_check_detects_exact_workbook(self):
        with TemporaryDirectory() as temporary:
            workbook = Path(temporary) / "example.xlsx"
            workbook.write_bytes(b"validated workbook")
            digest = file_sha256(workbook)
            release = {
                "assets": [
                    {"name": workbook.name, "digest": f"sha256:{digest}", "size": workbook.stat().st_size}
                ]
            }
            self.assertTrue(release_asset_is_current(release, workbook, digest))
            self.assertFalse(release_asset_is_current(release, workbook, "0" * 64))

    def test_structured_log_helpers_keep_secrets_out(self):
        self.assertEqual(parse_output_metrics('noise\n{"records": 12, "failed": 0}')['records'], 12)
        redacted = redact_log_text("token=abc123 authorization: Bearer-secret password = hidden")
        self.assertNotIn("abc123", redacted)
        self.assertNotIn("Bearer-secret", redacted)
        self.assertNotIn("hidden", redacted)

if __name__ == "__main__":
    unittest.main()
