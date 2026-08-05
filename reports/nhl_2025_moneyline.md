# NHL 2025 Full-Game Moneyline Analysis

Generated from the cached Gamma event snapshot and Nav-backed Parquet trade layer at `2026-08-05T21:02:12.870394+00:00`.
The snapshot uses series `10346`, an inclusive event window of `2025-10-01` through `2026-06-30`, and the market filter `sportsMarketType == moneyline`.

## Snapshot

| Metric | Value |
| --- | ---: |
| Moneyline markets | 1,417 |
| Resolved markets | 1,417 |
| Unresolved markets | 0 |
| Unique trades | 7,103,617 |
| Wallets with trades | 168,914 |
| Wallet × game ledgers | 1,438,996 |
| Pre-match wallet × game ledgers | 999,290 |
| Markets with a kickoff timestamp | 1,417 |

## Candidate views

The candidate files require at least five or ten qualifying positions established before kickoff and at least a 70% non-flat profitable-ledger rate. There is no minimum dollar-turnover filter. They are descriptive filters, not a guarantee of future performance.

- 5+ game candidates: `5,531` saved in `results/bettor_candidates_5games_70pct.csv`.
- 10+ game candidates: `1,410` saved in `results/bettor_candidates_10games_70pct.csv`.

## Reproducibility

- Source repository: https://github.com/Nav1212/PolyMarketAnalytics
- Source revision: `75d70d8f1659380591c63cc28330fc3c87efde17`
- Raw event cache: `/root/polymarket-analytics/data/raw/nhl_2025_events.json`
- Experiment directory: `data/experiments/nav_nhl_2025_moneyline`
- DuckDB, Parquet, CSV analysis, validation JSON, and Excel are produced as separate local artifacts.
