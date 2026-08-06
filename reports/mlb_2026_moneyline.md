# MLB 2026 Full-Game Moneyline Analysis

Generated from the cached Gamma event snapshot and Nav-backed Parquet trade layer at `2026-08-06T12:02:54.123317+00:00`.
The snapshot uses series `3`, an inclusive event window of `2026-03-01` through `2026-11-01`, and the market filter `sportsMarketType == moneyline`.

## Snapshot

| Metric | Value |
| --- | ---: |
| Moneyline markets | 2,067 |
| Resolved markets | 1,980 |
| Unresolved markets | 87 |
| Unique trades | 9,116,488 |
| Wallets with trades | 106,711 |
| Wallet × game ledgers | 1,401,757 |
| Pre-match wallet × game ledgers | 651,113 |
| Markets with a kickoff timestamp | 2,067 |

## Candidate views

The candidate files require at least five or ten qualifying positions established before kickoff and at least a 70% non-flat profitable-ledger rate. There is no minimum dollar-turnover filter. They are descriptive filters, not a guarantee of future performance.

- 5+ game candidates: `1,125` saved in `results/bettor_candidates_5games_70pct.csv`.
- 10+ game candidates: `348` saved in `results/bettor_candidates_10games_70pct.csv`.

## Reproducibility

- Source repository: https://github.com/Nav1212/PolyMarketAnalytics
- Source revision: `75d70d8f1659380591c63cc28330fc3c87efde17`
- Raw event cache: `/root/polymarket-analytics/data/raw/mlb_2026_events.json`
- Experiment directory: `data/experiments/nav_mlb_2026_moneyline`
- DuckDB, Parquet, CSV analysis, validation JSON, and Excel are produced as separate local artifacts.
