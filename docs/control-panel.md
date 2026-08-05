# Control panel

The repository includes a responsive web workspace for the refreshable NFL
2025, WNBA 2025–2026, NBA 2025, MLB 2025–2026, NHL 2025, NCAAF 2025, and NCAAB
2025 full-game moneyline datasets. The frontend uses the shadcn
design system, Radix primitives, Tailwind CSS, Inter, and Lucide icons. The
Python controller runs beside the local Parquet and DuckDB files.

Each dataset is isolated by its own event snapshot, Parquet experiment
directory, DuckDB file, validation JSON, workbook, and scheduler record. The
NCAAB 2025 selector includes a visible limited-coverage warning because the
current official source contains only 255 legacy CBB markets from February
8–12, 2025.

The interface is grouped by intent:

- **Overview** summarizes freshness, coverage, recent resolved games, and
  overall market calibration.
- **Wallets** compares wallet histories by team or resolved game and opens
  wallet details in a side panel.
- **Games** shows team-price movement, hourly volume, and current wallet
  positioning without joining across missing observations.
- **Odds & results** compares pre-match market prices with resolved outcomes,
  including confidence intervals and separate market-role and venue views.
- **Refresh data** runs or schedules the pipeline and links to its workbook and
  validation evidence.
- **Run history** exposes step-level outcomes, publication details, and
  downloadable structured logs.

The refresh page's **Dataset schedules** table is the source of truth for
automation: every sport/year has its own enabled state, cadence, validation
depth, publication preference, next run, latest run, and data-health status.
Changing the selected dataset only changes the editor below the table; it does
not silently change another sport's schedule.

## Start it

From the repository root:

```bash
npm --prefix web install
npm --prefix web run build
.venv-nav/bin/python scripts/control_panel_server.py
```

Open <http://127.0.0.1:8787>. The server binds to localhost by default. The
frontend is served from `web/dist`; the refresh worker uses `.venv-nav/bin/python`
when that environment is present, so the same process can operate the existing
Nav-backed ETL.

## What a refresh does

The **Refresh** button runs the same cache-first sequence as the documented
runbook:

1. Refresh the Gamma event snapshot for the selected season.
2. Fetch new/open trade windows and persist them as Parquet bronze files.
3. Rebuild the local DuckDB silver database.
4. Recalculate the complete all-trades ledger, freeze a second ledger strictly
   before each game's kickoff, and build the 5+ / 10+ pre-match candidate CSVs
   without a minimum dollar-turnover threshold.
5. Export the profile-hyperlinked Excel workbook.
6. Run local validation, or full external checks when selected.
7. Optionally upload the workbook to the stable GitHub Release and commit the
   Markdown report and validation JSON.

Settled markets are reused by the Nav adapter. Open, live, and unresolved
markets are refreshed through the current capture time.

## Scheduling

Each sport/year has an independent schedule with its own enabled state,
interval, validation depth, GitHub-publishing preference, and next-run time.
The **Dataset schedules** table makes those settings, the latest outcome, data
health, and log access visible together. Selecting **Configure** changes the
editor below the table; no setting is changed until **Save schedule** is
pressed.

Intervals are whole numbers in minutes or hours. Configuration is saved locally
under the ignored `data/control_panel/` directory. The scheduler is active while
`control_panel_server.py` is running and executes one due dataset at a time. If
the process is stopped, no job starts; when it is started again, each enabled
dataset resumes from its saved next-run time. For a server that should run
continuously, put the command under your normal service manager (systemd,
launchd, Docker, or a process supervisor).

The panel exposes both manual and scheduled runs through the same API:

- `GET /api/status` — controller, per-dataset schedules, counts, validation, and links;
- `POST /api/config` — update one dataset schedule without changing the others;
- `POST /api/run` — start a manual refresh;
- `GET /api/logs?tail=80` — read the recent controller log.

Analytics and run-detail endpoints are documented in the
[analytics guide](analytics.md). The run history endpoints include
`GET /api/runs`, `GET /api/runs/{run_id}`, `GET /api/runs/{run_id}/logs`,
`POST /api/runs/{run_id}/retry`, and `POST /api/runs/{run_id}/cancel`.

Run-specific logs are stored as redacted JSON Lines files under the ignored
`data/control_panel/runs/` directory. The controller keeps up to forty recent
run records and forty structured log files. API keys, tokens, authorization
headers, cookies, passwords, and private-key-like values are redacted before
persistence.

## Auto-push behavior

Auto-push is deliberately narrow and guarded:

- only the selected Markdown report and validation JSON are staged in Git;
- the generated workbook is uploaded to the stable `generated-workbooks`
  GitHub Release, so large files and frequent refreshes do not bloat Git history;
- a pre-existing staged change stops the job instead of being included silently;
- the configured push branch must match the checked-out branch;
- the current local Git credential is used; no token is stored in the UI or in
  the repository; and
- the status page builds a stable GitHub Release download URL, so each dataset's
  latest published Excel link remains constant when the asset is replaced.

The controller should remain localhost-only unless it is placed behind a
protected reverse proxy. It can be bound to another interface with `--host`,
but that should only be done with network access controls in place.

## Hosted UI versus local controller

This is intentionally a local admin panel rather than a public data runner.
The ETL writes local Parquet/DuckDB state and uses the host's Git credentials;
the Python controller therefore remains bound to `127.0.0.1`.

On the configured server, Caddy provides the public HTTPS edge:

<https://76.13.189.147.sslip.io>

The edge uses automatic TLS and is currently unauthenticated at the owner's
request, so anyone who knows the URL can view the panel and call its refresh,
scheduler, and GitHub-push endpoints. Re-enable authentication or add an IP
allowlist before sharing it broadly. If the server's public IP changes, update
the hostname in the Caddy configuration and restart Caddy; `sslip.io` derives
DNS from the IP.

The frontend is kept separate in `web/` and is built into `web/dist`. Its
shadcn components remain local source files, so visual changes do not depend on
a hosted component service.

## Rollback backup

Before the analytics expansion, the stable control-panel state was tagged and
pushed as `backup/control-panel-ui-20260803`. To restore that exact state in a
working copy:

```bash
git switch --detach backup/control-panel-ui-20260803
```

Create a new branch from the tag if you need to continue development after
restoring it.
