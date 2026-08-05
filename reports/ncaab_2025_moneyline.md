# NCAAB 2025 Full-Game Moneyline Analysis

Generated from the cached Gamma event snapshot and Nav-backed Parquet trade layer at `2026-08-05T21:06:04.532057+00:00`.
The snapshot uses series `10012`, an inclusive event window of `2025-01-01` through `2025-12-31`, and the market filter `sportsMarketType == moneyline OR legacy binary cbb market`.

> Coverage note: The official source currently exposes only legacy two-outcome CBB markets dated February 8–12, 2025; this is limited coverage, not a complete NCAAB season.

## Snapshot

| Metric | Value |
| --- | ---: |
| Moneyline markets | 255 |
| Resolved markets | 255 |
| Unresolved markets | 0 |
| Unique trades | 11,294 |
| Wallets with trades | 4,431 |
| Wallet × game ledgers | 7,446 |
| Pre-match wallet × game ledgers | 7,225 |
| Markets with a kickoff timestamp | 255 |

## Candidate views

The candidate files require at least five or ten qualifying positions established before kickoff and at least a 70% non-flat profitable-ledger rate. There is no minimum dollar-turnover filter. They are descriptive filters, not a guarantee of future performance.

- 5+ game candidates: `27` saved in `results/bettor_candidates_5games_70pct.csv`.
- 10+ game candidates: `5` saved in `results/bettor_candidates_10games_70pct.csv`.

## Reproducibility

- Source repository: https://github.com/Nav1212/PolyMarketAnalytics
- Source revision: `75d70d8f1659380591c63cc28330fc3c87efde17`
- Raw event cache: `/root/polymarket-analytics/data/raw/ncaab_2025_events.json`
- Experiment directory: `data/experiments/nav_ncaab_2025_moneyline`
- DuckDB, Parquet, CSV analysis, validation JSON, and Excel are produced as separate local artifacts.
