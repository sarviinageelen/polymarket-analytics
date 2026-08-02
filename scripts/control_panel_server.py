"""Run the local Polymarket Analytics control panel.

The web page is intentionally a thin client.  This process owns the local
ETL, the Parquet/DuckDB cache, the scheduler, and the optional Git push.  It
binds to localhost by default so a GitHub credential and the local data store
are not accidentally exposed to the network.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import threading
import traceback
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
WEB_DIST = ROOT / "web" / "dist"
CONTROL_PANEL_DIR = ROOT / "data" / "control_panel"
CONFIG_PATH = CONTROL_PANEL_DIR / "config.json"
STATE_PATH = CONTROL_PANEL_DIR / "state.json"
LOG_PATH = CONTROL_PANEL_DIR / "control_panel.log"


SPORTS: dict[str, dict[str, Any]] = {
    "wnba_2026": {
        "label": "WNBA 2026",
        "season_label": "WNBA 2026",
        "series_id": 10105,
        "start_date": "2026-05-08",
        "end_date": "2026-09-24",
        "events": "data/raw/wnba_2026_events.json",
        "experiment_dir": "data/experiments/nav_wnba_2026_moneyline",
        "db": "data/experiments/nav_wnba_2026_moneyline/silver/wnba_2026_moneyline.duckdb",
        "workbook": "reports/generated/wnba_2026_moneyline_picks.xlsx",
        "report": "reports/wnba_2026_moneyline.md",
        "validation": "reports/wnba_2026_validation.json",
        "workers": 8,
    },
    "nfl_2025": {
        "label": "NFL 2025",
        "season_label": "NFL 2025",
        "series_id": 10187,
        "start_date": "2025-09-04",
        "end_date": "2026-02-08",
        "events": "data/raw/nfl_2025_events.json",
        "experiment_dir": "data/experiments/nav_nfl_2025_moneyline",
        "db": "data/experiments/nav_nfl_2025_moneyline/silver/nfl_2025_moneyline.duckdb",
        "workbook": "reports/generated/nfl_2025_moneyline_picks.xlsx",
        "report": "reports/nav_nfl_2025_moneyline.md",
        "validation": "reports/nfl_2025_validation.json",
        "workers": 4,
    },
}

ALLOWED_BRANCH = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat()


def parse_iso(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return default


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, default=str), encoding="utf-8")
    temporary.replace(path)


def run_command(command: list[str], *, capture: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
        check=False,
    )


def current_branch() -> str:
    result = run_command(["git", "branch", "--show-current"])
    return (result.stdout or "").strip() or "main"


def repository_name() -> str | None:
    result = run_command(["git", "remote", "get-url", "origin"])
    remote = (result.stdout or "").strip()
    match = re.search(r"github\.com[:/]([^/]+/[^/]+?)(?:\.git)?$", remote)
    return match.group(1) if match else None


def public_download_url(sport: str, branch: str | None = None) -> str | None:
    repo = repository_name()
    if not repo or sport not in SPORTS:
        return None
    ref = quote(branch or current_branch(), safe="/")
    path = quote(str(SPORTS[sport]["workbook"]), safe="/")
    return f"https://github.com/{repo}/raw/refs/heads/{ref}/{path}"


def interval_seconds(config: dict[str, Any]) -> int:
    value = int(config.get("interval_value", 6))
    return value * (60 if config.get("interval_unit") == "minutes" else 3600)


def default_config() -> dict[str, Any]:
    return {
        "sport": "wnba_2026",
        "interval_value": 6,
        "interval_unit": "hours",
        "enabled": False,
        "auto_push": True,
        "full_validation": False,
        "push_branch": current_branch(),
    }


def normalize_config(payload: dict[str, Any], base: dict[str, Any] | None = None) -> dict[str, Any]:
    current = default_config()
    if base:
        current.update(base)
    if "sport" in payload:
        sport = str(payload["sport"])
        if sport not in SPORTS:
            raise ValueError(f"unsupported sport: {sport}")
        current["sport"] = sport
    if "interval_value" in payload:
        try:
            value = int(payload["interval_value"])
        except (TypeError, ValueError) as exc:
            raise ValueError("interval_value must be a whole number") from exc
        if value < 1 or value > 10080:
            raise ValueError("interval_value must be between 1 and 10080")
        current["interval_value"] = value
    if "interval_unit" in payload:
        unit = str(payload["interval_unit"])
        if unit not in {"minutes", "hours"}:
            raise ValueError("interval_unit must be minutes or hours")
        current["interval_unit"] = unit
    for key in ("enabled", "auto_push", "full_validation"):
        if key in payload:
            current[key] = bool(payload[key])
    if "push_branch" in payload:
        branch = str(payload["push_branch"]).strip()
        if not ALLOWED_BRANCH.fullmatch(branch) or ".." in branch or "//" in branch:
            raise ValueError("push_branch is not a valid Git branch name")
        current["push_branch"] = branch
    return current


def count_csv_rows(path: Path) -> int | None:
    try:
        with path.open(encoding="utf-8") as handle:
            return max(sum(1 for _ in handle) - 1, 0)
    except OSError:
        return None


def dataset_status(sport: str, config: dict[str, Any]) -> dict[str, Any]:
    spec = SPORTS[sport]
    experiment = ROOT / spec["experiment_dir"]
    manifest = read_json(experiment / "manifest.json", {})
    summary = read_json(experiment / "results" / "summary.json", {})
    validation = read_json(ROOT / spec["validation"], {})
    workbook_path = ROOT / spec["workbook"]
    validation_counts = validation.get("counts", {}) if isinstance(validation, dict) else {}
    generated_at = manifest.get("generated_at_utc") or manifest.get("capture_time_utc")
    if not generated_at and workbook_path.exists():
        generated_at = datetime.fromtimestamp(workbook_path.stat().st_mtime, timezone.utc).isoformat()
    candidates_5 = count_csv_rows(experiment / "results" / "bettor_candidates_5games_70pct.csv")
    candidates_10 = count_csv_rows(experiment / "results" / "bettor_candidates_10games_70pct.csv")
    return {
        "id": sport,
        "label": spec["label"],
        "season": spec["season_label"],
        "series_id": spec["series_id"],
        "available": bool(manifest or summary or workbook_path.exists()),
        "generated_at_utc": generated_at,
        "counts": {
            "markets": summary.get("markets") or manifest.get("market_count"),
            "resolved_markets": summary.get("resolved_markets"),
            "unresolved_markets": summary.get("unresolved_markets"),
            "trade_rows": summary.get("trade_rows_fetched") or manifest.get("trade_rows"),
            "bettors": summary.get("bettors_with_trades"),
            "wallet_market_ledgers": summary.get("wallet_market_ledgers"),
            "unsettled_ledgers": summary.get("unsettled_wallet_market_ledgers"),
            "candidates_5games_70pct": candidates_5,
            "candidates_10games_70pct": candidates_10,
        },
        "validation": {
            "pass": validation_counts.get("pass", 0),
            "warning": validation_counts.get("warning", 0),
            "fail": validation_counts.get("fail", 0),
            "not_run": validation_counts.get("not_run", 0),
        },
        "workbook": {
            "exists": workbook_path.exists(),
            "name": workbook_path.name,
            "path": str(spec["workbook"]),
            "download_url": public_download_url(sport, config.get("push_branch")),
        },
    }


def build_pipeline_commands(sport: str, full_validation: bool) -> list[tuple[str, list[str]]]:
    spec = SPORTS[sport]
    python = ROOT / ".venv-nav" / "bin" / "python"
    if not python.exists():
        python = Path(sys.executable)
    common = [
        "--season-label",
        str(spec["season_label"]),
        "--series-id",
        str(spec["series_id"]),
        "--start-date",
        str(spec["start_date"]),
        "--end-date",
        str(spec["end_date"]),
    ]
    experiment = str(spec["experiment_dir"])
    commands: list[tuple[str, list[str]]] = [
        (
            "Refresh event metadata",
            [
                str(python),
                "scripts/fetch_sports_events.py",
                "--output",
                str(spec["events"]),
                *common,
                "--force",
            ],
        ),
        (
            "Fetch and persist trades",
            [
                str(python),
                "scripts/nav_moneyline_experiment.py",
                "--events",
                str(spec["events"]),
                "--out-dir",
                experiment,
                "--workers",
                str(spec["workers"]),
                *common,
            ],
        ),
        (
            "Rebuild local DuckDB",
            [
                str(python),
                "scripts/build_nav_duckdb.py",
                "--experiment-dir",
                experiment,
                "--db",
                str(spec["db"]),
            ],
        ),
        (
            "Recalculate bettor analysis",
            [
                str(python),
                "scripts/analyze_sports_moneyline.py",
                "--experiment-dir",
                experiment,
            ],
        ),
        (
            "Export Excel workbook",
            [
                str(python),
                "scripts/export_sports_moneyline_excel.py",
                "--experiment-dir",
                experiment,
                "--output",
                str(spec["workbook"]),
            ],
        ),
    ]
    validation = [
        str(python),
        "scripts/validate_sports_snapshot.py",
        "--experiment-dir",
        experiment,
        "--events",
        str(spec["events"]),
        "--workbook",
        str(spec["workbook"]),
        "--output",
        str(spec["validation"]),
    ]
    if not full_validation:
        validation.append("--skip-network")
    commands.append(("Validate the refreshed snapshot", validation))
    return commands


class ControlPanel:
    def __init__(self) -> None:
        CONTROL_PANEL_DIR.mkdir(parents=True, exist_ok=True)
        saved_config = read_json(CONFIG_PATH, {})
        self.config = normalize_config(saved_config if isinstance(saved_config, dict) else {})
        saved_state = read_json(STATE_PATH, {})
        self.runtime: dict[str, Any] = saved_state if isinstance(saved_state, dict) else {}
        self.runtime.setdefault("running", False)
        self.runtime.setdefault("current_step", None)
        self.runtime.setdefault("last_run", None)
        self.runtime.setdefault("history", [])
        self.runtime.setdefault("next_run_at", None)
        self.lock = threading.RLock()
        self.stop_event = threading.Event()
        self._log("control panel started")
        if self.config["enabled"] and not parse_iso(self.runtime.get("next_run_at")):
            self.runtime["next_run_at"] = (utc_now() + timedelta(seconds=interval_seconds(self.config))).isoformat()
        self._persist()
        self.scheduler = threading.Thread(target=self._scheduler_loop, name="scheduler", daemon=True)
        self.scheduler.start()

    def _persist(self) -> None:
        with self.lock:
            write_json(CONFIG_PATH, self.config)
            write_json(STATE_PATH, self.runtime)

    def _log(self, message: str) -> None:
        CONTROL_PANEL_DIR.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as handle:
            handle.write(f"{iso_now()} {message}\n")

    def log_tail(self, limit: int = 80) -> list[str]:
        try:
            lines = LOG_PATH.read_text(encoding="utf-8").splitlines()
        except OSError:
            return []
        return lines[-max(1, min(limit, 500)) :]

    def update_config(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            old = dict(self.config)
            self.config = normalize_config(payload, self.config)
            if self.config["enabled"]:
                changed_schedule = any(
                    self.config.get(key) != old.get(key)
                    for key in ("sport", "interval_value", "interval_unit", "enabled")
                )
                if changed_schedule or not parse_iso(self.runtime.get("next_run_at")):
                    self.runtime["next_run_at"] = (
                        utc_now() + timedelta(seconds=interval_seconds(self.config))
                    ).isoformat()
            else:
                self.runtime["next_run_at"] = None
            self._log(f"configuration updated: {self.config}")
            self._persist()
            return dict(self.config)

    def _scheduler_loop(self) -> None:
        while not self.stop_event.wait(5):
            with self.lock:
                enabled = bool(self.config.get("enabled"))
                due = parse_iso(self.runtime.get("next_run_at"))
                can_run = enabled and not self.runtime.get("running") and due and due <= utc_now()
                sport = str(self.config.get("sport"))
            if can_run:
                self.start_job(sport=sport, trigger="scheduled")

    def start_job(
        self,
        *,
        sport: str | None = None,
        trigger: str = "manual",
        full_validation: bool | None = None,
    ) -> dict[str, Any]:
        with self.lock:
            selected = sport or str(self.config["sport"])
            if selected not in SPORTS:
                raise ValueError(f"unsupported sport: {selected}")
            if self.runtime.get("running"):
                raise RuntimeError("a refresh is already running")
            run_id = utc_now().strftime("%Y%m%dT%H%M%SZ")
            validation_mode = (
                bool(self.config.get("full_validation"))
                if full_validation is None
                else bool(full_validation)
            )
            self.runtime.update(
                {
                    "running": True,
                    "current_step": "Starting refresh",
                    "last_run": {
                        "id": run_id,
                        "sport": selected,
                        "trigger": trigger,
                        "status": "running",
                        "started_at_utc": iso_now(),
                        "full_validation": validation_mode,
                    },
                }
            )
            self._persist()
            self._log(f"starting {trigger} refresh for {selected}")
            thread = threading.Thread(
                target=self._run_job,
                args=(run_id, selected, trigger, validation_mode),
                name=f"refresh-{selected}",
                daemon=True,
            )
            thread.start()
            return {"accepted": True, "run_id": run_id, "sport": selected}

    def _set_step(self, step: str) -> None:
        with self.lock:
            self.runtime["current_step"] = step
            self._persist()

    def _run_job(self, run_id: str, sport: str, trigger: str, full_validation: bool) -> None:
        started = utc_now()
        output_tail: list[str] = []
        pushed: dict[str, Any] = {"pushed": False, "reason": "auto-push disabled"}
        try:
            commands = build_pipeline_commands(sport, full_validation)
            for step, command in commands:
                self._set_step(step)
                self._log(f"[{run_id}] {step}: {' '.join(command)}")
                result = run_command(command)
                output = result.stdout or ""
                output_tail = (output_tail + output.splitlines())[-30:]
                if output:
                    for line in output.splitlines()[-20:]:
                        self._log(f"[{run_id}] {line}")
                if result.returncode != 0:
                    raise RuntimeError(f"{step} failed with exit code {result.returncode}")

            with self.lock:
                auto_push = bool(self.config.get("auto_push"))
                branch = str(self.config.get("push_branch") or current_branch())
            if auto_push:
                self._set_step("Commit and push updated artifacts")
                pushed = self.push_outputs(sport, branch)

            finished = utc_now()
            last_run = {
                "id": run_id,
                "sport": sport,
                "trigger": trigger,
                "status": "success",
                "started_at_utc": started.isoformat(),
                "finished_at_utc": finished.isoformat(),
                "duration_seconds": round((finished - started).total_seconds(), 1),
                "full_validation": full_validation,
                "push": pushed,
                "download_url": public_download_url(sport, self.config.get("push_branch")),
                "output_tail": output_tail,
            }
            self._log(f"[{run_id}] refresh complete")
            self._finish_run(last_run)
        except Exception as exc:  # noqa: BLE001 - the UI needs a durable error state
            finished = utc_now()
            error = f"{type(exc).__name__}: {exc}"
            self._log(f"[{run_id}] refresh failed: {error}")
            self._log(traceback.format_exc())
            self._finish_run(
                {
                    "id": run_id,
                    "sport": sport,
                    "trigger": trigger,
                    "status": "failed",
                    "started_at_utc": started.isoformat(),
                    "finished_at_utc": finished.isoformat(),
                    "duration_seconds": round((finished - started).total_seconds(), 1),
                    "full_validation": full_validation,
                    "error": error,
                    "output_tail": output_tail,
                    "download_url": public_download_url(sport, self.config.get("push_branch")),
                }
            )

    def _finish_run(self, last_run: dict[str, Any]) -> None:
        with self.lock:
            self.runtime["running"] = False
            self.runtime["current_step"] = None
            self.runtime["last_run"] = last_run
            history = [last_run, *self.runtime.get("history", [])]
            self.runtime["history"] = history[:10]
            if self.config.get("enabled"):
                self.runtime["next_run_at"] = (
                    utc_now() + timedelta(seconds=interval_seconds(self.config))
                ).isoformat()
            else:
                self.runtime["next_run_at"] = None
            self._persist()

    def push_outputs(self, sport: str, branch: str) -> dict[str, Any]:
        if branch != current_branch():
            raise RuntimeError(
                f"configured push branch {branch!r} does not match the checked-out branch {current_branch()!r}"
            )
        paths = [SPORTS[sport][key] for key in ("workbook", "report", "validation")]
        allowed = {str(path) for path in paths}
        staged_before = (run_command(["git", "diff", "--cached", "--name-only"]).stdout or "").splitlines()
        if staged_before:
            raise RuntimeError("Git has pre-staged changes; clear or commit them before auto-push")
        add_result = run_command(["git", "add", "--", *paths])
        if add_result.returncode != 0:
            raise RuntimeError((add_result.stdout or "git add failed").strip())
        staged_after = set((run_command(["git", "diff", "--cached", "--name-only"]).stdout or "").splitlines())
        if not staged_after.issubset(allowed):
            run_command(["git", "reset"])
            raise RuntimeError(f"auto-push found unexpected staged files: {sorted(staged_after - allowed)}")
        if not staged_after:
            return {
                "pushed": False,
                "reason": "no artifact changes",
                "commit": (run_command(["git", "rev-parse", "HEAD"]).stdout or "").strip(),
            }
        message = f"automated refresh {SPORTS[sport]['label']}"
        commit = run_command(["git", "commit", "-m", message])
        if commit.returncode != 0:
            run_command(["git", "reset"])
            raise RuntimeError((commit.stdout or "git commit failed").strip())
        push = run_command(["git", "push", "origin", f"HEAD:{branch}"])
        if push.returncode != 0:
            raise RuntimeError((push.stdout or "git push failed").strip())
        revision = (run_command(["git", "rev-parse", "HEAD"]).stdout or "").strip()
        self._log(f"pushed {SPORTS[sport]['label']} artifacts at {revision}")
        return {"pushed": True, "commit": revision, "branch": branch}

    def status(self) -> dict[str, Any]:
        with self.lock:
            config = dict(self.config)
            runtime = json.loads(json.dumps(self.runtime, default=str))
        return {
            "controller": {"online": True, "now_utc": iso_now()},
            "project": {
                "repository": repository_name(),
                "branch": current_branch(),
                "push_branch": config.get("push_branch"),
            },
            "config": config,
            "runtime": runtime,
            "sports": [dataset_status(sport, config) for sport in SPORTS],
        }

    def close(self) -> None:
        self.stop_event.set()


class RequestHandler(BaseHTTPRequestHandler):
    server_version = "PolymarketAnalyticsControlPanel/1.0"

    @property
    def controller(self) -> ControlPanel:
        return self.server.controller  # type: ignore[attr-defined]

    def _headers(self, content_type: str, length: int) -> None:
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store" if content_type == "application/json" else "no-cache")
        self.send_header("Access-Control-Allow-Origin", os.environ.get("CONTROL_PANEL_ALLOWED_ORIGIN", "*"))
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _send_json(self, payload: Any, status: int = 200) -> None:
        body = json.dumps(payload, default=str).encode("utf-8")
        self.send_response(status)
        self._headers("application/json; charset=utf-8", len(body))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length > 1_000_000:
            raise ValueError("request body is too large")
        raw = self.rfile.read(length) if length else b"{}"
        payload = json.loads(raw.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("request body must be a JSON object")
        return payload

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._headers("text/plain", 0)
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/status":
            self._send_json(self.controller.status())
            return
        if parsed.path == "/api/config":
            self._send_json(self.controller.status()["config"])
            return
        if parsed.path == "/api/logs":
            query = parse_qs(parsed.query)
            try:
                limit = int(query.get("tail", [80])[0])
            except ValueError:
                limit = 80
            self._send_json({"lines": self.controller.log_tail(limit)})
            return
        self._serve_static(parsed.path)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        try:
            payload = self._read_json()
            if parsed.path in {"/api/config", "/api/scheduler"}:
                config = self.controller.update_config(payload)
                self._send_json({"ok": True, "config": config})
                return
            if parsed.path == "/api/run":
                result = self.controller.start_job(
                    sport=str(payload.get("sport")) if payload.get("sport") else None,
                    trigger="manual",
                    full_validation=payload.get("full_validation"),
                )
                self._send_json(result, 202)
                return
            self._send_json({"error": "not found"}, 404)
        except (ValueError, RuntimeError) as exc:
            self._send_json({"error": str(exc)}, 409 if isinstance(exc, RuntimeError) else 400)
        except json.JSONDecodeError as exc:
            self._send_json({"error": f"invalid JSON: {exc}"}, 400)

    def _serve_static(self, request_path: str) -> None:
        if request_path in {"", "/"}:
            relative = Path("index.html")
        else:
            relative = Path(unquote(request_path.lstrip("/")))
        candidate = (WEB_DIST / relative).resolve()
        if WEB_DIST.exists() and candidate.is_file() and WEB_DIST.resolve() in candidate.parents:
            content = candidate.read_bytes()
            content_type = {
                ".html": "text/html; charset=utf-8",
                ".css": "text/css; charset=utf-8",
                ".js": "text/javascript; charset=utf-8",
                ".json": "application/json; charset=utf-8",
                ".svg": "image/svg+xml",
                ".ico": "image/x-icon",
            }.get(candidate.suffix, "application/octet-stream")
            self.send_response(200)
            self._headers(content_type, len(content))
            self.end_headers()
            self.wfile.write(content)
            return
        message = (
            "Control-panel frontend is not built yet. Run `npm --prefix web install && "
            "npm --prefix web run build`, then refresh this page."
        ).encode("utf-8")
        self.send_response(503)
        self._headers("text/plain; charset=utf-8", len(message))
        self.end_headers()
        self.wfile.write(message)

    def log_message(self, format: str, *args: Any) -> None:
        self.controller._log(format % args)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    controller = ControlPanel()
    server = ThreadingHTTPServer((args.host, args.port), RequestHandler)
    server.controller = controller  # type: ignore[attr-defined]
    print(f"Polymarket Analytics control panel: http://{args.host}:{args.port}")
    print("The scheduler is active while this process is running; press Ctrl-C to stop it.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        controller.close()
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
