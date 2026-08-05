# Operations and reproducibility

## Local setup

The dependency-light package uses the Python standard library for the core API
client and replay logic. Optional tooling can be installed with:

```bash
python -m pip install -e '.[dev,data,excel]'
```

The Nav experiment also needs the upstream checkout under `external/` and its
existing `.venv-nav` environment. Neither is committed to Git.

## Cache-first workflow

1. Collect or refresh raw event metadata and trade files.
2. Run the Nav adapter; it reuses existing Parquet condition IDs.
3. Build DuckDB from local Parquet.
4. Run analysis and export reports.

```bash
.venv-nav/bin/python scripts/nav_moneyline_experiment.py \
  --workers 2 --out-dir data/experiments/nav_nfl_2025_moneyline
.venv-nav/bin/python scripts/build_nav_duckdb.py
.venv-nav/bin/python scripts/analyze_nav_moneyline.py
PYTHONPATH=/usr/lib/python3/dist-packages \
  .venv-nav/bin/python scripts/export_nfl_2025_picks_excel.py
```

The DuckDB command is API-free. A cache-only test has verified that the base
collector does not call the network when valid cached metadata and trade files
are present.

## Sport/year refresh runbook

Run metadata discovery before the trade collector. The metadata command is
cache-first when the request arguments match the saved manifest; use force for
an intentional refresh. Then rebuild all derived layers from local files.

    .venv-nav/bin/python scripts/fetch_sports_events.py \
      --series-id 10105 \
      --output data/raw/wnba_2026_events.json \
      --season-label 'WNBA 2026' \
      --start-date 2026-05-08 \
      --end-date 2026-09-24 \
      --force

    .venv-nav/bin/python scripts/nav_moneyline_experiment.py \
      --events data/raw/wnba_2026_events.json \
      --out-dir data/experiments/nav_wnba_2026_moneyline \
      --season-label 'WNBA 2026' \
      --series-id 10105 \
      --start-date 2026-05-08 \
      --end-date 2026-09-24 \
      --workers 8

    .venv-nav/bin/python scripts/build_nav_duckdb.py \
      --experiment-dir data/experiments/nav_wnba_2026_moneyline \
      --db data/experiments/nav_wnba_2026_moneyline/silver/wnba_2026_moneyline.duckdb

    .venv-nav/bin/python scripts/analyze_sports_moneyline.py \
      --experiment-dir data/experiments/nav_wnba_2026_moneyline

    .venv-nav/bin/python scripts/export_sports_moneyline_excel.py \
      --experiment-dir data/experiments/nav_wnba_2026_moneyline \
      --output reports/generated/wnba_2026_moneyline_picks.xlsx

    .venv-nav/bin/python scripts/validate_sports_snapshot.py \
      --experiment-dir data/experiments/nav_wnba_2026_moneyline \
      --events data/raw/wnba_2026_events.json \
      --workbook reports/generated/wnba_2026_moneyline_picks.xlsx \
      --output reports/wnba_2026_validation.json

The current snapshot intentionally excludes six April 30–May 3 Polymarket
events because the configured scope starts at the official May 8 regular
season. Change both date arguments if preseason should be analyzed.

WNBA 2025 uses the same series with its own isolated cache and season window:

    .venv-nav/bin/python scripts/fetch_sports_events.py \
      --series-id 10105 \
      --output data/raw/wnba_2025_events.json \
      --season-label 'WNBA 2025' \
      --start-date 2025-05-16 \
      --end-date 2025-10-17 \
      --force

The control panel supplies those arguments automatically when WNBA 2025 is
selected. Every downstream path uses `nav_wnba_2025_moneyline`, so refreshing
the historical season cannot overwrite WNBA 2026.

The same cache-first sequence is registered for every requested dataset:

| Dataset | Gamma series | Event window | Experiment directory |
| --- | ---: | --- | --- |
| NFL 2025 | 10187 | 2025-09-04 to 2026-02-08 | `nav_nfl_2025_moneyline` |
| NBA 2025 | 10345 | 2025-10-01 to 2026-06-30 | `nav_nba_2025_moneyline` |
| MLB 2025 | 3 | 2025-03-01 to 2025-11-01 | `nav_mlb_2025_moneyline` |
| MLB 2026 | 3 | 2026-03-01 to 2026-11-01 | `nav_mlb_2026_moneyline` |
| NHL 2025 | 10346 | 2025-10-01 to 2026-06-30 | `nav_nhl_2025_moneyline` |
| NCAAF 2025 | 10210 | 2025-08-01 to 2026-01-31 | `nav_ncaaf_2025_moneyline` |
| NCAAB 2025 | 10012 | 2025-01-01 to 2025-12-31 | `nav_ncaab_2025_moneyline` |

The two WNBA datasets use the same pattern and are listed in the control-panel
registry as well. MLB 2026 includes open markets, so its scheduled refreshes
continue to update those trade windows. NCAAB 2025 uses the explicit
`--allow-untagged-binary` exception for legacy `cbb-` markets and remains
marked as limited source coverage in its validation report and scheduler view.

Each registry entry is isolated end to end: its own cached event JSON (the full
returned event/market payload), the complete fetched moneyline trade results
as Parquet bronze files, DuckDB silver database,
analysis CSVs/Markdown report, validation JSON, scheduler record, and Excel
export path. A refresh reads settled markets from that dataset's local cache
and only goes back to the APIs for open or deliberately refreshed windows.
The cache and derived data are ignored by Git and should be included in the
VPS backup under `backups/`.

## Validation commands

```bash
PYTHONPATH=src python -m unittest discover -s tests -v
.venv-nav/bin/python -m py_compile scripts/*.py
unzip -t reports/generated/nfl_2025_moneyline_picks.xlsx
```

## Local web control panel

The repository includes a shadcn-based local dashboard for manual refreshes,
minute/hour scheduling, validation mode, and guarded GitHub publication. See
the [control-panel guide](control-panel.md) for startup and service-manager
notes.

## What belongs in Git

Commit source code, tests, configuration, Markdown documentation, and small
methodology reports. Do not commit:

- `data/raw/`, `data/derived/`, or `data/experiments/`;
- `external/` upstream checkouts;
- virtual environments;
- DuckDB files;
- generated XLSX/CSV outputs; or
- secrets and credentials.

The `.gitignore` enforces these defaults. Keep a separate backup of local data
if the server is disposable.

## Reproducibility metadata

Every Nav experiment manifest should record the upstream repository, revision,
market filter, taker setting, generation time, market count, row count, and
failures. Do not overwrite a historical snapshot when changing collection
boundaries; write a new versioned output directory instead.
