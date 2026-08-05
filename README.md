# Polymarket Analytics

Reproducible research tooling for Polymarket sports data, covering NFL 2025,
WNBA 2025–2026, NBA 2025, MLB 2025–2026, NHL 2025, NCAAF 2025, and NCAAB 2025
with full-game moneyline analysis.

Every configured dataset has its own cached Gamma event snapshot, Parquet
trade layer, DuckDB analytical database, validation report, scheduler entry,
and Excel workbook path. NCAAB 2025 is intentionally marked as limited
coverage: the current official series exposes 255 legacy CBB moneyline markets
dated February 8–12, 2025 rather than a complete season.

The project keeps the raw API snapshot, a Parquet bronze layer, a DuckDB silver
layer, replayed wallet/game ledgers, and human-readable reports separate. Large
local data files are deliberately excluded from Git so the repository remains
code- and documentation-first.

## Current status

The latest local captures for the requested additions are:

| Dataset | Moneyline markets | Canonical trades | Wallet/game ledgers | Validation |
| --- | ---: | ---: | ---: | --- |
| NBA 2025 | 1,413 | 20,329,938 | 3,460,813 | 19 passed, 1 optional check unavailable |
| MLB 2025 | 2,365 | 2,707,486 | 734,069 | 19 passed, 1 optional check unavailable |
| MLB 2026 | 2,052 | 9,006,718 | 1,382,868 | 19 passed, 1 optional check unavailable |
| NHL 2025 | 1,417 | 7,103,617 | 1,438,996 | 19 passed, 1 optional check unavailable |
| NCAAF 2025 | 715 | 1,197,626 | 202,698 | 19 passed, 1 optional check unavailable |
| NCAAB 2025 | 255 | 11,294 | 7,446 | 19 passed, 1 warning, 1 optional check unavailable |

The optional check is the ESPN schedule comparison, which currently returns
HTTP 403 from the provider; it is recorded as `not_run`, not as a data failure.
NCAAB is also explicitly marked as limited coverage: the current official
Polymarket series exposes 255 legacy CBB moneyline markets dated February
8–12, 2025, rather than a complete 2025 college-basketball season archive.

NFL 2025 and WNBA 2025–2026 remain registered as existing datasets. Their
artifacts reconcile across the manifest, Parquet, DuckDB, CSV, and Excel
layers, with the current WNBA 2026 validation regenerated using the same
memory-safe reconciliation checks as the new datasets.

## Repository layout

```text
polymarket-analytics/
├── docs/                         # Architecture, data model, audit, operations
├── scripts/                      # Nav ETL adapter, DuckDB build, analysis, export
├── src/polymarket_analytics/     # Dependency-light API client and replay logic
├── tests/                        # Unit tests
├── web/                          # Responsive shadcn analytics and operations UI
├── reports/                      # Committed Markdown reports and report index
│   └── generated/                # Local XLSX/CSV outputs; ignored by Git
├── data/                         # Local API/Parquet/DuckDB cache; ignored by Git
└── external/                     # Local upstream Nav checkout; ignored by Git
```

## Quick start

### Core collector and replay

```bash
python -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'

PYTHONPATH=src .venv/bin/python -m polymarket_analytics.cli collect \
  --out-dir data --workers 4
PYTHONPATH=src .venv/bin/python -m polymarket_analytics.cli analyze \
  --data-dir data --top 25
PYTHONPATH=src .venv/bin/python -m polymarket_analytics.cli validate \
  --data-dir data --top 10
```

The collector reuses cached event metadata, leaderboard snapshots, and
per-event compressed trade files. Add `--force` when a deliberate refresh is
wanted. The analyzer reads the local cache; it does not need to fetch the APIs
again.

### Nav-backed NFL moneyline experiment

The experiment uses the [Nav1212/PolyMarketAnalytics](https://github.com/Nav1212/PolyMarketAnalytics)
ETL components, pinned in the experiment manifest. The upstream checkout is
kept under the ignored `external/` directory.

```bash
.venv-nav/bin/python scripts/nav_moneyline_experiment.py \
  --workers 2 \
  --out-dir data/experiments/nav_nfl_2025_moneyline

.venv-nav/bin/python scripts/build_nav_duckdb.py
.venv-nav/bin/python scripts/analyze_nav_moneyline.py
PYTHONPATH=/usr/lib/python3/dist-packages \
  .venv-nav/bin/python scripts/export_nfl_2025_picks_excel.py
```

The DuckDB build reads cached Parquet only. The generated workbook is written
to `reports/generated/nfl_2025_moneyline_picks.xlsx`. It stays out of Git
history and, when publication is enabled, is mirrored to the stable
`generated-workbooks` GitHub Release.

## Nav-backed sport/year moneyline experiments

The reusable collector fetches both closed and open Gamma event views for each
configured series, keeps its inclusive event-date window, and selects only
full-game moneyline markets. Unresolved markets are refreshed through the
capture time and are marked to market rather than settled. The control panel
uses the same command sequence for every dataset; only the selector, paths,
series, date window, and worker count change.

For example, this is the WNBA 2026 shape:

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
      --experiment-dir data/experiments/nav_wnba_2026_moneyline \
      --report reports/wnba_2026_moneyline.md

    .venv-nav/bin/python scripts/export_sports_moneyline_excel.py \
      --experiment-dir data/experiments/nav_wnba_2026_moneyline \
      --output reports/generated/wnba_2026_moneyline_picks.xlsx

    .venv-nav/bin/python scripts/validate_sports_snapshot.py \
      --experiment-dir data/experiments/nav_wnba_2026_moneyline \
      --events data/raw/wnba_2026_events.json \
      --workbook reports/generated/wnba_2026_moneyline_picks.xlsx \
      --output reports/wnba_2026_validation.json

The same commands are parameterized for `nba_2025`, `mlb_2025`, `mlb_2026`,
`nhl_2025`, `ncaaf_2025`, and `ncaab_2025` by the control-panel registry. The
NCAAB run also passes `--allow-untagged-binary` because those legacy CBB
markets do not carry the newer `sportsMarketType=moneyline` tag; the validator
keeps that exception explicit.

## Data layers in one sentence each

- **Raw:** the original JSON/GZIP API responses, preserved for reproducibility.
- **Bronze:** normalized, columnar Parquet trade and market snapshots.
- **Silver:** DuckDB tables for markets, trades, wallet/game ledgers, and metadata.
- **Reports:** rankings, candidate filters, validation evidence, audit notes, and generated workbook.

For very large seasons, the complete candidate CSVs and ledger sheets remain
available in the local cache. The wide Excel matrix is intentionally limited
to the top 500 candidates so the workbook stays practical to open in desktop
Excel; the Read Me sheet records that scope.

The replay accounting is:

```text
cash_flow = sell_proceeds - buy_cost
settlement = net_shares_a × final_price_a + net_shares_b × final_price_b
pnl = cash_flow + settlement
```

The current `win_rate` is the share of non-flat wallet/game ledgers with positive
P&L. It is not automatically directional pick accuracy because a wallet may
trade, hedge, or sell both outcomes.

## Documentation

- [Architecture and data flow](docs/architecture.md)
- [Data model and accounting](docs/data-model.md)
- [Audit findings and caveats](docs/audit.md)
- [Operations and reproducibility runbook](docs/operations.md)
- [Local refresh control panel](docs/control-panel.md)
- [Analytics views and metric definitions](docs/analytics.md)
- [Research notes and GitHub survey](docs/research.md)
- [Report index](reports/README.md)

## Testing

```bash
PYTHONPATH=src .venv/bin/python -m unittest discover -s tests -v
```

The repository also includes a GitHub Actions workflow that runs the same
test suite on pushes and pull requests.

## Data and privacy notes

The APIs used here are public, but wallet addresses are still sensitive
identifiers. Do not infer or publish real-world identities. Never commit API
snapshots, private keys, credentials, virtual environments, or generated
databases.
