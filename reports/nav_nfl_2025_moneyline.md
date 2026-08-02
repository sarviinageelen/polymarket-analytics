# Nav1212 NFL 2025 full-game moneyline experiment

Generated 2026-08-02 UTC from [Nav1212/PolyMarketAnalytics](https://github.com/Nav1212/PolyMarketAnalytics), pinned to commit `75d70d8f1659380591c63cc28330fc3c87efde17`.

## Scope and result

“Full time moneyline” is interpreted as the full-game moneyline market only: `sportsMarketType == moneyline`. The run includes maker and taker trades (`takerOnly=false`) from each market's creation/start timestamp through its end/close timestamp. Therefore, this is a **full-life market** view, not a strict September 4, 2025 season-window view; some markets had trading activity before the first NFL game.

| Measure | Result |
| --- | ---: |
| Moneyline games/markets | 285 |
| Public trade rows fetched | 1,677,376 |
| Fetch failures | 0 |
| Wallets with trades | 89,402 |
| Wallet × game ledgers | 332,084 |
| Minimum buy cost in candidate views | $1,000 |

The raw Nav-backed Parquet census is in `data/experiments/nav_nfl_2025_moneyline/`; the analysis outputs are in `data/experiments/nav_nfl_2025_moneyline/results/`. The persistent DuckDB silver layer is `data/experiments/nav_nfl_2025_moneyline/silver/nfl_2025_moneyline.duckdb`.

The DuckDB build reads only the cached Parquet and market snapshot; it does not call the Polymarket APIs.

## Candidate filters

For each wallet × game ledger, trades are replayed using buy cash flow, sell proceeds, and final Gamma outcome prices. A ledger is a win when its final replayed P&L is positive and a loss when it is negative; flat ledgers are excluded from the denominator. Thus:

```text
win rate = profitable settled wallet × moneyline ledgers / non-flat ledgers
```

This is a **profitable-game rate**, not pure pick accuracy. A market maker, hedger, or trader who buys and sells both outcomes can have a profitable ledger without simply making one directional game prediction.

## Top 5-game candidates

All rows below have at least five games, at least 70% profitable-game rate, and at least $1,000 of buy cost.

| Rank | Wallet/display name | Games | W-L | Win rate | Replay P&L | Buy cost | ROI |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Firm-Semicircle (`0x1d8a…`) | 5 | 4-1 | 80.0% | $1,134,801 | $2,420,131 | 46.89% |
| 2 | cozyfnf | 18 | 14-4 | 77.8% | $1,107,890 | $2,521,766 | 43.93% |
| 3 | ilovecircle | 80 | 62-18 | 77.5% | $705,713 | $7,529,441 | 9.37% |
| 4 | Anointed-Connect | 68 | 48-19 | 71.6% | $562,438 | $2,975,996 | 18.90% |
| 5 | shutitfatty | 11 | 8-3 | 72.7% | $411,813 | $672,249 | 61.26% |
| 6 | gatorr | 6 | 5-1 | 83.3% | $190,968 | $454,555 | 42.01% |
| 7 | RN1 | 227 | 161-65 | 71.2% | $159,429 | $3,467,135 | 4.60% |
| 8 | Shrill-Aunt (`0x20d6…`) | 5 | 4-1 | 80.0% | $147,704 | $569,745 | 25.92% |
| 9 | Kluivert9 | 29 | 21-8 | 72.4% | $124,995 | $615,399 | 20.31% |
| 10 | one8tyfive | 87 | 68-19 | 78.2% | $123,862 | $1,763,329 | 7.02% |

There are 713 total rows in this view. The 5-game leader should be treated as a small-sample candidate, not as the strongest conclusion.

## Top 10-game candidates

Raising the minimum to ten games removes the two five-game wallets and leaves 374 candidates. The top of that view is:

| Rank | Wallet/display name | Games | W-L | Win rate | Replay P&L | Buy cost | ROI |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | cozyfnf | 18 | 14-4 | 77.8% | $1,107,890 | $2,521,766 | 43.93% |
| 2 | ilovecircle | 80 | 62-18 | 77.5% | $705,713 | $7,529,441 | 9.37% |
| 3 | Anointed-Connect | 68 | 48-19 | 71.6% | $562,438 | $2,975,996 | 18.90% |
| 4 | shutitfatty | 11 | 8-3 | 72.7% | $411,813 | $672,249 | 61.26% |
| 5 | RN1 | 227 | 161-65 | 71.2% | $159,429 | $3,467,135 | 4.60% |
| 6 | Kluivert9 | 29 | 21-8 | 72.4% | $124,995 | $615,399 | 20.31% |
| 7 | one8tyfive | 87 | 68-19 | 78.2% | $123,862 | $1,763,329 | 7.02% |
| 8 | Adept-Closing | 14 | 13-1 | 92.9% | $115,233 | $353,221 | 32.62% |
| 9 | ScroooogeMcDuck | 13 | 10-3 | 76.9% | $110,062 | $344,745 | 31.93% |
| 10 | asfgh | 43 | 35-8 | 81.4% | $99,364 | $542,458 | 18.32% |

## What we used from the repository

The experiment reuses Nav's worker manager/token-bucket rate limiter, HTTP client setup, Parquet persister, and resumable output layout. We did not run its default trade worker unchanged. The default worker uses 500-row pages and changes its pagination/filter behavior after offset 1,000; that is unsuitable for an exact historical census on busy markets.

The adapter therefore owns three correctness-sensitive pieces:

1. exact NFL moneyline market selection;
2. maker-inclusive Data API requests; and
3. 10,000-row pagination with recursive timestamp-window splitting when a window is capped.

This makes Nav a useful ETL foundation, but not a drop-in answer without these changes. The project’s own silver transformation is also marked prototype/untested upstream, so the wallet/game replay remains the analysis authority here.

## Reproduction

From the repository root:

```bash
.venv-nav/bin/python scripts/nav_moneyline_experiment.py \
  --workers 2 \
  --out-dir data/experiments/nav_nfl_2025_moneyline
.venv-nav/bin/python scripts/analyze_nav_moneyline.py
```

The run is resumable: existing Parquet condition IDs are recovered before fetching pending markets. The final manifest reports all 285 markets and zero failures.

To materialize the local silver layer after a fetch:

```bash
.venv-nav/bin/python scripts/build_nav_duckdb.py
```

## Recommended interpretation

Use `cozyfnf`, `ilovecircle`, `Anointed-Connect`, and `shutitfatty` as research candidates rather than confirmed “best bettors.” The next analysis should add a larger capital floor, fees/markouts, directional pick accuracy, and an out-of-sample split. Those controls are more important than lowering the game-count threshold because the 70% filter still produces hundreds of candidates.
