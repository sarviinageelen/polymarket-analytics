# NCAAF 2025 Full-Game Moneyline Analysis

Generated from the cached Gamma event snapshot and Nav-backed Parquet trade layer at `2026-08-05T21:03:55.202195+00:00`.
The snapshot uses series `10210`, an inclusive event window of `2025-08-01` through `2026-01-31`, and the market filter `sportsMarketType == moneyline`.

## Snapshot

| Metric | Value |
| --- | ---: |
| Moneyline markets | 715 |
| Resolved markets | 714 |
| Unresolved markets | 1 |
| Unique trades | 1,197,626 |
| Wallets with trades | 46,358 |
| Wallet × game ledgers | 202,698 |
| Pre-match wallet × game ledgers | 129,448 |
| Markets with a kickoff timestamp | 715 |

## Candidate views

The candidate files require at least five or ten qualifying positions established before kickoff and at least a 70% non-flat profitable-ledger rate. There is no minimum dollar-turnover filter. They are descriptive filters, not a guarantee of future performance.

- 5+ game candidates: `1,091` saved in `results/bettor_candidates_5games_70pct.csv`.
- 10+ game candidates: `511` saved in `results/bettor_candidates_10games_70pct.csv`.

## Reproducibility

- Source repository: https://github.com/Nav1212/PolyMarketAnalytics
- Source revision: `75d70d8f1659380591c63cc28330fc3c87efde17`
- Raw event cache: `/root/polymarket-analytics/data/raw/ncaaf_2025_events.json`
- Experiment directory: `data/experiments/nav_ncaaf_2025_moneyline`
- DuckDB, Parquet, CSV analysis, validation JSON, and Excel are produced as separate local artifacts.
