# WNBA 2025 Full-Game Moneyline Analysis

## Executive summary

- The historical snapshot covers all 283 full-game moneyline markets listed by
  Polymarket from May 16 through October 17, 2025.
- The local layers reconcile at 122,454 canonical trades, 5,563 public wallet
  identifiers, and 27,209 wallet-game ledgers.
- All 283 markets are closed: 278 have a decisive binary resolution and five
  contingent or voided games resolve as ties. Ties never enter the win-rate
  denominator.
- The 5+ filter contains 83 wallets and the 10+ filter contains 54 wallets.
  Both require at least a 70% settled non-flat win rate and at least $1,000 in
  settled BUY cost.

## Scope

This dataset uses Polymarket WNBA series `10105` and an inclusive event-date
window of `2025-05-16` through `2025-10-17`. The saved Gamma cache contains 316
events. The ETL keeps the 283 nested markets where `sportsMarketType` is
`moneyline`; 33 other WNBA market types are deliberately excluded.

| Layer | Count |
|---|---:|
| Event cache | 316 |
| Full-game moneyline markets | 283 |
| Decisively resolved markets | 278 |
| Tie / void resolutions | 5 |
| Canonical trades | 122,454 |
| Wallets with trades | 5,563 |
| Wallet-game ledgers | 27,209 |
| Unsettled ledgers | 0 |
| 5+ game candidates | 83 |
| 10+ game candidates | 54 |

## Interpretation

The database replays BUY and SELL activity at the wallet × moneyline-market
grain. A settled ledger is profitable when replayed realized P&L is positive
and unprofitable when it is negative. Flat and tie rows remain visible for the
audit trail but do not count as wins or losses.

The workbook's Primary Pick is inferred from the outcome with the largest
cumulative BUY notional. `Both / hedged` means the wallet bought both outcomes;
`Sell-only` means no BUY direction can be inferred. These labels describe
trading exposure, not a person's intent or a predictive model.

## Validation

All 20 local, workbook, external, and on-chain checks pass. The evidence
reconciles the event cache, manifest, Parquet, DuckDB, per-market trade counts,
wallet ledgers, candidate CSVs, workbook XML, Gamma scope, CLOB status, an ESPN
schedule sample, and Polygon transaction receipts.

The ESPN sample deliberately uses the latest decisive 1–0 market resolution.
Polymarket listed contingent Finals games through October 17 that were never
played and resolved 0.5–0.5; those correctly have no matching ESPN fixture and
must not be treated as missing schedule data.

See [the saved validation evidence](wnba_2025_validation.json). To reproduce it:

    .venv-nav/bin/python scripts/validate_sports_snapshot.py \
      --experiment-dir data/experiments/nav_wnba_2025_moneyline \
      --events data/raw/wnba_2025_events.json \
      --workbook reports/generated/wnba_2025_moneyline_picks.xlsx \
      --output reports/wnba_2025_validation.json

## Caveats

- This is a point-in-time reconstruction from public Polymarket data.
- Realized P&L is a gross replay estimate; explicit fees, funding, transfers,
  gas, and activity outside the captured markets are not modeled.
- Wallets are public analytical identifiers. Display names are not verified
  real-world identities.
- Raw JSON, Parquet, and DuckDB data remain local on the VPS. GitHub contains
  the code, methodology, validation evidence, and generated workbook.
