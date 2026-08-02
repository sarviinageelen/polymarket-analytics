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
