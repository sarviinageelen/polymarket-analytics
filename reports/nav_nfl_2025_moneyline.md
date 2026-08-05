# NFL 2025 Full-Game Moneyline Analysis

Generated from the cached Gamma event snapshot and Nav-backed Parquet trade layer at `2026-08-05T20:47:23.073591+00:00`.
The snapshot uses series `10187`, an inclusive event window of `2025-09-04` through `2026-02-08`, and the market filter `sportsMarketType == moneyline`.

## Snapshot

| Metric | Value |
| --- | ---: |
| Moneyline markets | 285 |
| Resolved markets | 285 |
| Unresolved markets | 0 |
| Unique trades | 1,677,376 |
| Wallets with trades | 89,402 |
| Wallet × game ledgers | 332,084 |
| Pre-match wallet × game ledgers | 280,047 |
| Markets with a kickoff timestamp | 285 |

## Candidate views

The candidate files require at least five or ten qualifying positions established before kickoff and at least a 70% non-flat profitable-ledger rate. There is no minimum dollar-turnover filter. They are descriptive filters, not a guarantee of future performance.

- 5+ game candidates: `2,256` saved in `results/bettor_candidates_5games_70pct.csv`.
- 10+ game candidates: `646` saved in `results/bettor_candidates_10games_70pct.csv`.

## Reproducibility

- Source repository: https://github.com/Nav1212/PolyMarketAnalytics
- Source revision: `75d70d8f1659380591c63cc28330fc3c87efde17`
- Raw event cache: `/root/polymarket-analytics/data/raw/nfl_2025_events.json`
- Experiment directory: `data/experiments/nav_nfl_2025_moneyline`
- DuckDB, Parquet, CSV analysis, validation JSON, and Excel are produced as separate local artifacts.
