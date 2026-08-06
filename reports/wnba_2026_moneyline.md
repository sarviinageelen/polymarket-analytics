# WNBA 2026 Full-Game Moneyline Analysis

Generated from the cached Gamma event snapshot and Nav-backed Parquet trade layer at `2026-08-06T04:43:03.045157+00:00`.
The snapshot uses series `10105`, an inclusive event window of `2026-05-08` through `2026-09-24`, and the market filter `sportsMarketType == moneyline`.

## Snapshot

| Metric | Value |
| --- | ---: |
| Moneyline markets | 272 |
| Resolved markets | 232 |
| Unresolved markets | 40 |
| Unique trades | 858,612 |
| Wallets with trades | 18,677 |
| Wallet × game ledgers | 106,000 |
| Pre-match wallet × game ledgers | 41,187 |
| Markets with a kickoff timestamp | 272 |

## Candidate views

The candidate files require at least five or ten qualifying positions established before kickoff and at least a 70% non-flat profitable-ledger rate. There is no minimum dollar-turnover filter. They are descriptive filters, not a guarantee of future performance.

- 5+ game candidates: `398` saved in `results/bettor_candidates_5games_70pct.csv`.
- 10+ game candidates: `135` saved in `results/bettor_candidates_10games_70pct.csv`.

## Reproducibility

- Source repository: https://github.com/Nav1212/PolyMarketAnalytics
- Source revision: `75d70d8f1659380591c63cc28330fc3c87efde17`
- Raw event cache: `/root/polymarket-analytics/data/raw/wnba_2026_events.json`
- Experiment directory: `data/experiments/nav_wnba_2026_moneyline`
- DuckDB, Parquet, CSV analysis, validation JSON, and Excel are produced as separate local artifacts.
