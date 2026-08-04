# Analytics views and metric definitions

The control panel's analytics tabs are read-only views over the local DuckDB
silver snapshot. The browser does not call Polymarket directly for rankings or
trend data. This keeps filters reproducible and prevents a partial live API
response from silently changing a published table.

## Available views

- **Data updates** — refresh the selected dataset, inspect validation, and open
  the latest workbook.
- **Best traders by team** — compare wallets with resolved moneyline ledgers
  involving a selected team. The trader detail view separately attributes
  single-sided positions to the team that was held; hedged and flat rows are
  not assigned to either team.
- **Best traders by game** — compare qualifying wallets around one matchup and
  show team-specific samples and the current net position when available.
- **Trader trends** — inspect one wallet's recent ledger rows, rolling accuracy,
  cumulative realized P&L, and ROI.
- **Game trends** — inspect wallet selection counts, net exposure, trade volume,
  average prices, and hourly activity for one market.
- **Run history** — inspect durable refresh status, step timing, validation
  output, redacted logs, and publication results.

The interface does not include model picks. The repository currently contains
descriptive replay and ranking logic, not a predictive model, so the panel does
not invent predictions.

## Grain and source

All leaderboard rows start from `wallet_game_ledger`, which is one wallet × one
moneyline market. Trade-level features such as average entry price and current
position are aggregated from `trade_fact`. Market status and outcomes come from
`market_dim`.

This is important: a wallet may trade, reduce, hedge, or reverse a position.
The default accuracy metric therefore describes profitable resolved wallet ×
game ledgers. It is not automatically directional pick accuracy.

## Ranking metrics

### Resolved picks

Only markets with `resolution_type = 'resolved'` and a non-flat `result` are
included in accuracy rankings. Ties, unresolved markets, cancelled markets,
voided markets, and stale unresolved markets do not count toward the accuracy
denominator.

### Raw accuracy

```text
raw accuracy = profitable resolved ledgers / non-flat resolved ledgers
```

The table displays the denominator next to every percentage, for example
`84.21% (n=19)`.

### Confidence-adjusted score

The default ranking uses the 95% Wilson lower bound of the raw accuracy. This
penalizes small samples without hiding the underlying raw percentage. Both
values are displayed. A 1–0 wallet therefore does not automatically outrank a
large wallet with a well-supported record.

### ROI and P&L

```text
realized P&L = cash flow + settlement value
ROI = realized P&L / settled BUY cost
```

ROI is shown only when settled BUY cost is positive. Open exposure is not
treated as realized profit.

### Current pick

For an open or upcoming market, the panel aggregates net shares from
`trade_fact`. A wallet with positive exposure to both outcomes is labelled
`Hedged`. A flat wallet has no current pick. This is a snapshot of net
exposure, not a claim about intent or future performance.

## API endpoints

The controller exposes the same source-backed data to the frontend. Replace
the `sport` value with `wnba_2025`, `wnba_2026`, or `nfl_2025`:

- `GET /api/analytics/catalog?sport=wnba_2026`
- `GET /api/analytics/leaderboard?dimension=team&sport=wnba_2026&team=...`
- `GET /api/analytics/leaderboard?dimension=game&sport=wnba_2026&condition_id=...`
- `GET /api/analytics/trader?sport=wnba_2026&wallet=0x...`
- `GET /api/analytics/game-trends?sport=wnba_2026&condition_id=...`

Leaderboards support server-side search, sorting, pagination, sample windows,
minimum pick counts, date ranges, and CSV export. Filter state is written into
the URL so a view can be refreshed or shared without losing its context.

## Limitations

- Historical public trade data does not provide a reliable universal notion of
  a trader's directional intent after reductions, hedges, and reversals. The
  panel labels the default metric as profitable-ledger accuracy for that reason.
- Team attribution is intentionally conservative: only a positive, single-sided
  net position is assigned to a team in the trader detail breakdown. The team
  leaderboard itself is scoped to games involving the selected team.
- Fees are not included in the current replay unless they are represented in
  the source fields. ROI and P&L should be read as replay estimates.
- The panel shows descriptive trends and consensus counts. It does not imply
  causation or predictive certainty.
