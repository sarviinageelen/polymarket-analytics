# WNBA 2026 Full-Game Moneyline Analysis

Generated from the cached Gamma event snapshot and Nav-backed Parquet trade layer at `2026-08-05T06:40:53.402300+00:00`.
The snapshot uses series `10105`, an inclusive event window of `2026-05-08` through `2026-09-24`, and the market filter `sportsMarketType == moneyline`.

## Snapshot

| Metric | Value |
| --- | ---: |
| Moneyline markets | 270 |
| Resolved markets | 228 |
| Unresolved markets | 42 |
| Unique trades | 845,482 |
| Wallets with trades | 18,482 |
| Wallet × game ledgers | 104,319 |

## Candidate views

The candidate files require at least five or ten settled games, at least a 70% non-flat profitable-ledger rate, and at least 1,000 units of settled buy cost. They are descriptive filters, not a guarantee of future performance.

- 5+ game candidates: `353` saved in `results/bettor_candidates_5games_70pct.csv`.
- 10+ game candidates: `216` saved in `results/bettor_candidates_10games_70pct.csv`.

## Reproducibility

- Source repository: https://github.com/Nav1212/PolyMarketAnalytics
- Source revision: `75d70d8f1659380591c63cc28330fc3c87efde17`
- Raw event cache: `/root/polymarket-analytics/data/raw/wnba_2026_events.json`
- Experiment directory: `data/experiments/nav_wnba_2026_moneyline`
- DuckDB, Parquet, CSV analysis, validation JSON, and Excel are produced as separate local artifacts.
