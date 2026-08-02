# Architecture and data flow

## Purpose

This repository separates collection from analysis so an analysis can be
repeated without repeatedly downloading a large API history.

```text
Gamma metadata ───────┐
Data API trades ──────┼─> raw JSON/GZIP cache ─> Bronze Parquet
CLOB/on-chain checks ─┘                              │
                                                     ▼
                                              DuckDB silver layer
                                                     │
                                      wallet/game replay and filters
                                                     │
                                                     ▼
                                          CSV, Markdown, and XLSX reports
```

## API responsibilities

Polymarket exposes different public surfaces for different jobs:

- **Gamma:** event, market, sports, outcome, and resolution metadata.
- **Data API:** public trades, activity, positions, closed positions, and
  leaderboard snapshots.
- **CLOB:** live prices, order books, and trading-oriented lookups.
- **Polygon/on-chain sources:** transaction existence and settlement evidence.

The project uses Gamma and the Data API for the primary census. CLOB and
on-chain data are validation sources, not substitutes for the local snapshot.

## Local layers

### Raw

`data/raw/` stores the original API responses. Event trade files are compressed
JSONL, one event per file. The base collector reuses a file unless `--force` is
provided.

### Bronze

`data/experiments/nav_nfl_2025_moneyline/bronze/` stores normalized Parquet
trade shards and the market snapshot. Parquet is compact, columnar, and easy to
scan without loading the entire dataset into memory.

### Silver

`silver/nfl_2025_moneyline.duckdb` contains:

- `market_dim`: one row per `condition_id`;
- `trade_fact`: one normalized row per saved trade;
- `wallet_game_ledger`: one aggregate row per `(wallet, condition_id)`; and
- `pipeline_metadata`: source revision, filter, and generation details.

`scripts/build_nav_duckdb.py` creates the database atomically from local
Parquet. It does not make network requests.

### Reports

The analysis scripts write CSV and JSON results under the ignored experiment
directory. The Excel exporter writes to `reports/generated/`. Markdown reports
under `reports/` are small, reviewable, and suitable for Git.

## Design principles

1. Preserve raw inputs before transforming them.
2. Use `condition_id` for joins; display names and team aliases can change.
3. Never deduplicate by transaction hash alone; one transaction can contain
   multiple distinct fills.
4. Keep maker-inclusive collection (`takerOnly=false`) when measuring all
   wallet activity.
5. Treat the collection window as data, not an invisible assumption; record it
   in the manifest and audit it against `closedTime`.
