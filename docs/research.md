# NFL 2025 Polymarket bettor research

## Research question

Who performed best on Polymarket across the 2025 NFL season, and what data and open-source tooling can support a defensible answer?

## Findings so far

The official Gamma API exposes a dedicated NFL 2025 series, ID `10187`. Its closed-event listing returned 285 games from September 4, 2025 through February 8, 2026, containing 10,964 markets. The collected Data API census contains 3,162,649 public trade rows with maker and taker activity included.

The season is broader than moneyline markets. It includes spreads, totals, first-half markets, team totals, anytime/first touchdowns, rushing and receiving props, passing props, and a small number of parlays. The result should therefore be reported both as an all-market ranking and, later, as market-type slices.

## Official API research

Polymarket documents three public surfaces in its [API introduction](https://docs.polymarket.com/api-reference/introduction):

- [Gamma](https://gamma-api.polymarket.com) for event, market, sports, tag, and series discovery.
- [Data API](https://data-api.polymarket.com) for public trades, activity, positions, closed positions, and leaderboard snapshots.
- [CLOB](https://clob.polymarket.com) for prices, order books, and trading operations.

The collector uses the [sports metadata endpoint](https://docs.polymarket.com/api-reference/sports/get-sports-metadata-information), the [keyset event listing](https://docs.polymarket.com/api-reference/events/list-events-keyset-pagination), and the Data API's [user-or-market trade endpoint](https://docs.polymarket.com/api-reference/core/get-trades-for-a-user-or-markets). The Data API's trade history is capped by offset, so the implementation recursively splits time windows when a busy event reaches the 10,000-row page boundary.

The [closed-position endpoint](https://docs.polymarket.com/api-reference/core/get-closed-positions-for-a-user) is useful for validation because it exposes realized P&L and total bought by user and market. In this snapshot, it does not return a row for every replayed losing/held position, so validation compares overlapping condition IDs and reports coverage rather than treating the endpoint sum as a complete season total. It is not sufficient as the primary season census: the [leaderboard endpoint](https://docs.polymarket.com/api-reference/core/get-trader-leaderboard-rankings) supports `DAY`, `WEEK`, `MONTH`, and `ALL`, but not an arbitrary historical NFL-season interval. The current sports leaderboard is therefore only a candidate/sanity-check snapshot, not the season answer.

## Reproducible method

1. Discover the closed events in series `10187`.
2. Flatten each nested Gamma event into a condition-ID market index, retaining final `outcomePrices`, market type, line, event date, and title.
3. Fetch every event's public trade history with `takerOnly=false`, retrying transient failures and splitting capped windows. Save each event independently as gzip JSONL.
4. Replay each wallet × condition-ID ledger. Buys reduce cash and add shares; sells add cash and remove shares; final outcome prices settle remaining shares.
5. Rank wallets by realized P&L and retain capital, market-count, win-rate, active-week, positive-week, and maximum weekly drawdown fields.
6. Validate the leading wallets against closed-position realized P&L.

The current replay is gross P&L. It does not yet model explicit fees, rebates, transfers, split/merge operations, or negative-risk conversions. Those are important for a production-grade accounting result, especially for strategies that use composability outside direct binary NFL markets.

## What “best bettor” means

The project keeps several distinct concepts separate:

- **Most dollars earned:** total replayed P&L, the primary leaderboard.
- **Capital efficiency:** P&L divided by buy cost, with minimum buy-cost and market-count thresholds.
- **Repeatability:** positive-week rate, market-level win rate, and drawdown, with minimum active weeks.
- **Breadth:** number of games and markets traded, plus market-type exposure.

These are not interchangeable. A high-P&L market maker may have a modest ROI; a small account may have a high ROI from a few bets; and a hedger may look mediocre in a single market while reducing risk across markets. The final report should show all views rather than declare one metric to be causal “skill.”

## GitHub survey

The following repositories were inspected as implementation references. They are inputs to design decisions, not dependencies of this project.

| Repository | Useful contribution | Decision |
| --- | --- | --- |
| [Polymarket/py-sdk](https://github.com/Polymarket/py-sdk) | Current official Python SDK direction | Prefer its maintained API shapes if this project later adds an SDK dependency. |
| [Polymarket/polymarket-subgraph](https://github.com/Polymarket/polymarket-subgraph) | Official indexing/subgraph option | Consider for historical entity joins and event-level indexing when the REST census is insufficient. |
| [qualiaenjoyer/polymarket-apis](https://github.com/qualiaenjoyer/polymarket-apis) | Unified typed Gamma/Data/CLOB/Web3/WebSocket clients | Good reference for typed client boundaries; the first version here stays dependency-free. |
| [Nav1212/PolyMarketAnalytics](https://github.com/Nav1212/PolyMarketAnalytics) | Multi-threaded ETL, Parquet/DuckDB layers, rate limiting, resumable cursors | Validates the bronze/silver pipeline direction for scaling beyond one season. |
| [sarviinageelen/polymarket-sports-analysis](https://github.com/sarviinageelen/polymarket-sports-analysis) | Direct NFL/NBA sports analytics, season leaderboards, P&L, accuracy, streaks, and filters | Closest sports-analysis reference; its NFL 2025 series-ID convention helped confirm the discovery path. |
| [PaulieB14/polymarket-subgraph-analytics](https://github.com/PaulieB14/polymarket-subgraph-analytics) | GraphQL examples for positions, activity, and realized P&L | Useful validation and microstructure fallback, especially if REST pagination becomes limiting. |
| [klickburn/polymarket-sports-analysis](https://github.com/klickburn/polymarket-sports-analysis) | Larger sports tracker/bot project with P&L and whale-following components | Interesting operational reference, but methodology needs independent review before reuse. |
| [evan-kolberg/prediction-market-backtesting](https://github.com/evan-kolberg/prediction-market-backtesting) | General prediction-market backtesting concepts | Potential source for later execution-cost and counterfactual testing, not used in the current census. |

The strongest immediate combination is the official API contract plus the sports-analysis repository's domain-specific dimensions, with the ETL and subgraph projects informing later performance and validation work.

## Important caveats

- Public trade rows identify wallets and may include display names, but identity is not necessarily a person. Do not publish doxxing-style attribution.
- The API's current leaderboard is not a historical NFL 2025 leaderboard.
- The closed-position endpoint is a partial validation source here: some losing/held replay ledgers have no corresponding row. Use the overlap and coverage columns in `closed_position_validation.csv`.
- The overlap check is strong for several leaders but not universal; material residuals remain for two of the top ten and should be resolved before presenting the ranking as audited accounting.
- Final Gamma prices are used as the resolution oracle; preserve the raw metadata snapshot so a later API correction can be diffed.
- `takerOnly=false` is intentional. Using the default `true` would omit maker-side rows and bias the bettor census.
- Market-level win rate is based on the settled wallet × market ledger, not on individual trade direction.
- Report all-market and market-type results separately because props and moneyline markets have very different liquidity and risk profiles.
