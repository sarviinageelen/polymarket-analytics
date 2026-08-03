# Control panel

The repository now includes a small local web control panel for the refreshable
WNBA 2026 and NFL 2025 full-game moneyline datasets. The page uses Cloudflare's
Kumo component library for its controls and status elements, while the server
that powers those controls runs next to the local Parquet and DuckDB files.

## Start it

From the repository root:

```bash
npm --prefix web install
npm --prefix web run build
python3 scripts/control_panel_server.py
```

Open <http://127.0.0.1:8787>. The server binds to localhost by default. The
frontend is served from `web/dist`; the refresh worker uses `.venv-nav/bin/python`
when that environment is present, so the same process can operate the existing
Nav-backed ETL.

## What a refresh does

The **Update now** button runs the same cache-first sequence as the documented
runbook:

1. Refresh the Gamma event snapshot for the selected season.
2. Fetch new/open trade windows and persist them as Parquet bronze files.
3. Rebuild the local DuckDB silver database.
4. Recalculate wallet/game ledgers and the 5+ / 10+ game candidate CSVs.
5. Export the profile-hyperlinked Excel workbook.
6. Run local validation, or full external checks when selected.
7. Optionally commit and push the workbook, Markdown report, and validation JSON.

Settled markets are reused by the Nav adapter. Open, live, and unresolved
markets are refreshed through the current capture time.

## Scheduling

The scheduler accepts an integer interval in minutes or hours. Its configuration
is saved locally under the ignored `data/control_panel/` directory. It is active
while `control_panel_server.py` is running. If the process is stopped, no job is
started; when it is started again, the saved schedule is resumed from the next
interval. For a server that should run continuously, put the command under your
normal service manager (systemd, launchd, Docker, or a process supervisor).

The panel exposes both manual and scheduled runs through the same API:

- `GET /api/status` — controller, schedule, dataset counts, validation, and links;
- `POST /api/config` — save the selected dataset and schedule;
- `POST /api/run` — start a manual refresh;
- `GET /api/logs?tail=80` — read the recent controller log.

## Auto-push behavior

Auto-push is deliberately narrow and guarded:

- only the selected workbook, report, and validation JSON are staged;
- a pre-existing staged change stops the job instead of being included silently;
- the configured push branch must match the checked-out branch;
- the current local Git credential is used; no token is stored in the UI or in
  the repository; and
- the status page builds the raw GitHub download URL from the repository and
  branch, so the latest published Excel link is always visible.

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

The frontend is kept separate in `web/`, uses Kumo, and can later be moved to
an authenticated Cloudflare Worker if a shared remote control plane is needed.
