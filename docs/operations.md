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

## WNBA refresh runbook

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

## Validation commands

```bash
PYTHONPATH=src python -m unittest discover -s tests -v
.venv-nav/bin/python -m py_compile scripts/*.py
unzip -t reports/generated/nfl_2025_moneyline_picks.xlsx
```

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
