# WNBA 2025 Full-Game Moneyline Analysis

Generated from the cached Gamma event snapshot and Nav-backed Parquet trade layer at `2026-08-05T20:50:46.073959+00:00`.
The snapshot uses series `10105`, an inclusive event window of `2025-05-16` through `2025-10-17`, and the market filter `sportsMarketType == moneyline`.

## Snapshot

| Metric | Value |
| --- | ---: |
| Moneyline markets | 283 |
| Resolved markets | 283 |
| Unresolved markets | 0 |
| Unique trades | 122,454 |
| Wallets with trades | 5,563 |
| Wallet × game ledgers | 27,209 |
| Pre-match wallet × game ledgers | 18,854 |
| Markets with a kickoff timestamp | 283 |

## Candidate views

The candidate files require at least five or ten qualifying positions established before kickoff and at least a 70% non-flat profitable-ledger rate. There is no minimum dollar-turnover filter. They are descriptive filters, not a guarantee of future performance.

- 5+ game candidates: `122` saved in `results/bettor_candidates_5games_70pct.csv`.
- 10+ game candidates: `48` saved in `results/bettor_candidates_10games_70pct.csv`.

## Reproducibility

- Source repository: https://github.com/Nav1212/PolyMarketAnalytics
- Source revision: `75d70d8f1659380591c63cc28330fc3c87efde17`
- Raw event cache: `/root/polymarket-analytics/data/raw/wnba_2025_events.json`
- Experiment directory: `data/experiments/nav_wnba_2025_moneyline`
- DuckDB, Parquet, CSV analysis, validation JSON, and Excel are produced as separate local artifacts.
