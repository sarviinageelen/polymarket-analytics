# NBA 2025 Full-Game Moneyline Analysis

Generated from the cached Gamma event snapshot and Nav-backed Parquet trade layer at `2026-08-04T18:26:04.905171+00:00`.
The snapshot uses series `10345`, an inclusive event window of `2025-10-01` through `2026-06-30`, and the market filter `sportsMarketType == moneyline`.

## Snapshot

| Metric | Value |
| --- | ---: |
| Moneyline markets | 1,413 |
| Resolved markets | 1,413 |
| Unresolved markets | 0 |
| Unique trades | 20,329,938 |
| Wallets with trades | 314,715 |
| Wallet × game ledgers | 3,460,813 |

## Candidate views

The candidate files require at least five or ten settled games, at least a 70% non-flat profitable-ledger rate, and at least 1,000 units of settled buy cost. They are descriptive filters, not a guarantee of future performance.

- 5+ game candidates: `8,244` saved in `results/bettor_candidates_5games_70pct.csv`.
- 10+ game candidates: `5,037` saved in `results/bettor_candidates_10games_70pct.csv`.

## Reproducibility

- Source repository: https://github.com/Nav1212/PolyMarketAnalytics
- Source revision: `75d70d8f1659380591c63cc28330fc3c87efde17`
- Raw event cache: `/root/polymarket-analytics/data/raw/nba_2025_events.json`
- Experiment directory: `data/experiments/nav_nba_2025_moneyline`
- DuckDB, Parquet, CSV analysis, validation JSON, and Excel are produced as separate local artifacts.
