# Polymarket Analytics

Reproducible research tooling for Polymarket sports data, starting with the
2025 NFL season and a full-game moneyline analysis.

The project keeps the raw API snapshot, a Parquet bronze layer, a DuckDB silver
layer, replayed wallet/game ledgers, and human-readable reports separate. Large
local data files are deliberately excluded from Git so the repository remains
code- and documentation-first.

## Current status

The current local experiment contains:

- 285 NFL 2025 moneyline markets, including 13 playoff markets;
- 1,677,376 cached trade rows;
- 89,402 wallets;
- 332,084 wallet/game ledgers; and
- a persistent local DuckDB database.

The artifacts reconcile internally across the manifest, Parquet, DuckDB, CSV,
and Excel layers. One follow-up remains before calling the capture complete
through every possible market-closure timestamp: an independent raw-archive
comparison found a collection-window difference involving `endDate` versus
`closedTime`. See the [audit report](docs/audit.md).

## Repository layout

```text
polymarket-analytics/
├── docs/                         # Architecture, data model, audit, operations
├── scripts/                      # Nav ETL adapter, DuckDB build, analysis, export
├── src/polymarket_analytics/     # Dependency-light API client and replay logic
├── tests/                        # Unit tests
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
to `reports/generated/nfl_2025_moneyline_picks.xlsx` and is intentionally not
committed.

## Data layers in one sentence each

- **Raw:** the original JSON/GZIP API responses, preserved for reproducibility.
- **Bronze:** normalized, columnar Parquet trade and market snapshots.
- **Silver:** DuckDB tables for markets, trades, wallet/game ledgers, and metadata.
- **Reports:** rankings, candidate filters, audit notes, and generated workbook.

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
