# WNBA 2026 Full-Game Moneyline Analysis

## Executive Summary

- **The WNBA pipeline is running locally and is refreshable.** The snapshot contains 262 full-game moneyline markets in the regular-season window from May 8 through September 24, 2026. At capture time, 220 markets were resolved and 42 remained unresolved.
- **The data layers reconcile.** The cache contains 816,971 unique trades, 18,111 wallets, and 100,982 wallet-game ledgers. Manifest, Parquet, DuckDB, CSV filters, and the Excel workbook agree on the key counts.
- **The bettor filters are intentionally conservative.** The 5+ view contains 343 public wallet identifiers and the 10+ view contains 211, each requiring at least 70% settled non-flat win rate and at least $1,000 of settled BUY cost.
- **Live and upcoming games are visible but not scored as wins or losses.** Their current positions are shown as mark-to-market exposure only. This prevents an in-progress price from being mistaken for a final result.

## Scope and snapshot

This report covers Polymarket series 10105 (wnba) and keeps only nested markets where sportsMarketType == moneyline. The configured event-date window is inclusive: 2026-05-08 through 2026-09-24. May 8 is the official WNBA 2026 regular-season start; six earlier Polymarket 2026 events dated April 30–May 3 are therefore treated as preseason/out-of-scope.

The API currently lists the captured games only through August 15. That is expected for an ongoing season: rerunning the metadata refresh will add later games as Polymarket publishes them.

| Layer | Count |
|---|---:|
| Moneyline markets | 262 |
| Resolved markets | 220 |
| Open markets | 4 |
| Stale/unresolved markets | 1 |
| Upcoming markets | 37 |
| Unique trades | 816,971 |
| Wallets with trades | 18,111 |
| Wallet-game ledgers | 100,982 |
| Unsettled wallet-game ledgers | 535 |

## What the bettor filters mean

The database replays each wallet’s BUY and SELL activity at the (wallet, condition_id) grain. A settled ledger is a win when realized replayed P&L is positive and a loss when it is negative. Flat ledgers are excluded from the win-rate denominator.

The workbook’s “Primary Pick” is the outcome with the largest cumulative BUY notional for that wallet/game. Buying both outcomes is labeled Both / hedged; a ledger with no BUY rows is Sell-only. This is an inferred trading-direction label, not proof of intent or a pure prediction.

The current top 10+ candidate by realized P&L is DLEK (0x6e82…a752c): 10 wins and 3 losses across 13 settled games, a 76.92% settled non-flat win rate, and approximately $132.3k gross realized P&L on approximately $317.4k settled BUY cost. Fees, funding, and identity attribution are not modeled.

## Ongoing, upcoming, and exceptional markets

The 42 unresolved markets stay in the data model but never populate realized_pnl, settlement_value, or a settled win/loss result. Open positions use the latest cached Gamma outcome prices for mark-to-market values.

One important exception is Atlanta Dream vs. Minnesota Lynx, event 436142. Gamma reports the event closed, while its moneyline remains inactive/archived and unresolved. It is labeled stale_unresolved, not a normal open market. The external schedule shows the game was played, but Polymarket’s market state has not produced a final binary settlement in this snapshot. It should be monitored and excluded from settled ranking until resolution is confirmed.

The workbook’s Games, Open Exposure, and Picks Ledger sheets preserve this distinction. Profile and wallet cells are clickable links to https://polymarket.com/profile/{wallet}.

## Validation and reconciliation

The reproducible validator ran 17 checks:

- 16 passed across cache scope, market filtering, manifest/Parquet/DuckDB counts, referential integrity, domains, timestamps, replay accounting, candidate filters, workbook reload, Excel table XML, Gamma, CLOB, and ESPN spot checks.
- 1 check was not run to completion: the Polygon receipt probe received HTTP 401 from the public RPC endpoint. This is an access limitation, not evidence that the sampled transactions are invalid.
- Raw Parquet contains 818,551 rows versus 816,971 exact-key-deduplicated rows because refreshing unresolved markets appends a small amount of repeated history. DuckDB deduplicates those exact source rows before replay; the mismatch is recorded rather than hidden.

See the saved [validation evidence](wnba_2026_validation.json) and rerun it with:

    .venv-nav/bin/python scripts/validate_sports_snapshot.py \
      --experiment-dir data/experiments/nav_wnba_2026_moneyline \
      --events data/raw/wnba_2026_events.json \
      --workbook reports/generated/wnba_2026_moneyline_picks.xlsx \
      --output reports/wnba_2026_validation.json

## Recommended next step

Refresh the WNBA event metadata and unresolved-market trades on a schedule, rebuild DuckDB, rerun the validator, and republish the workbook. Keep the May 8 regular-season boundary unless preseason markets are explicitly wanted. Add a separate settlement-monitoring queue for stale/unresolved markets before using their prices in any final ranking.

## Caveats and assumptions

- This is a point-in-time snapshot, not a live workbook.
- Polymarket’s public APIs can revise market status, prices, names, and resolution metadata.
- “Win rate” means profitable settled wallet-game ledgers divided by settled non-flat ledgers; it is not directional pick accuracy.
- P&L is a gross replay model. Explicit trading fees, gas, transfers, and external wallet activity are not included.
- Wallet addresses are public analytical identifiers; no real-world identity should be inferred from display names or pseudonyms.
- The Excel workbook is generated locally from DuckDB. Large raw/API/Parquet/DuckDB files remain ignored by Git; the published repository contains the code, documentation, validation evidence, and reviewed workbook.
