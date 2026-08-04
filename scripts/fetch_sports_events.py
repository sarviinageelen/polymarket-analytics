"""Cache a sports series' closed, live, and upcoming Gamma events."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from polymarket_analytics.api import PolymarketAPI  # noqa: E402


def in_date_scope(event: dict[str, Any], start: str | None, end: str | None) -> bool:
    event_date = str(event.get("eventDate") or event.get("startTime") or "")[:10]
    if not event_date:
        return False
    if start and event_date < start:
        return False
    if end and event_date > end:
        return False
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--series-id", type=int, required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--season-label", required=True)
    parser.add_argument("--start-date", help="Inclusive YYYY-MM-DD event date")
    parser.add_argument("--end-date", help="Inclusive YYYY-MM-DD event date")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    output = ROOT / args.output
    if output.exists() and not args.force:
        events = json.loads(output.read_text(encoding="utf-8"))
        manifest_path = output.with_name(f"{output.stem}_manifest.json")
        manifest = (
            json.loads(manifest_path.read_text(encoding="utf-8"))
            if manifest_path.exists()
            else {}
        )
        cache_matches = (
            manifest.get("series_id") == args.series_id
            and manifest.get("season") == args.season_label
            and manifest.get("start_date") == args.start_date
            and manifest.get("end_date") == args.end_date
        )
        if cache_matches:
            print(json.dumps({"status": "cached", "events": len(events), "output": str(output)}, indent=2))
            return 0

    if args.start_date:
        date.fromisoformat(args.start_date)
    if args.end_date:
        date.fromisoformat(args.end_date)
    if args.start_date and args.end_date and args.start_date > args.end_date:
        raise SystemExit("--start-date must be on or before --end-date")

    api = PolymarketAPI()
    all_events = api.fetch_series_events(args.series_id, include_open=True)
    events = [event for event in all_events if in_date_scope(event, args.start_date, args.end_date)]
    if not events:
        raise SystemExit("no events found in the requested scope")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(events, indent=2), encoding="utf-8")
    metadata = {
        "series_id": args.series_id,
        "season": args.season_label,
        "start_date": args.start_date,
        "end_date": args.end_date,
        "include_open": True,
        "event_count": len(events),
        "events_with_open_status": sum(not bool(event.get("closed")) for event in events),
        "output": str(output),
    }
    output.with_name(f"{output.stem}_manifest.json").write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )
    print(json.dumps({"status": "fetched", **metadata}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
