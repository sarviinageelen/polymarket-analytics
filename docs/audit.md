# Data audit and sense checks

Audit date: 2026-08-02 UTC.

The audit used concurrent read-only local workers and independent agent checks.
It compared the manifest, raw snapshots, Parquet, DuckDB, derived CSVs, live
Polymarket endpoints, sampled Polygon transactions, and sampled final scores.

## Results

| Check | Result | Status |
|---|---:|---|
| Manifest markets and failures | 285/285; 0 failures | Pass |
| Manifest versus Parquet/DuckDB counts | 1,677,376 rows at each layer | Pass |
| Per-market counts and joins | 0 mismatches; 0 orphan rows | Pass |
| Required fields and trade domains | 0 null/invalid required values | Pass |
| Exact duplicate trade rows | 0 observed | Pass |
| Timestamp bounds | 0 trades outside the adapter window | Pass |
| Ledger replay and accounting | 332,084 ledgers independently matched | Pass |
| Resolution metadata | 284 binary winners; 1 explicit tie | Pass with edge case |

The accounting identities were independently recomputed:

```text
cash_flow = sell_proceeds - buy_cost
settlement = net_shares_a × price_a + net_shares_b × price_b
pnl = cash_flow + settlement
```

The largest independent floating-point residual was approximately `4.2e-08`.

## External checks

Sampled Gamma metadata and CLOB token lookups matched local condition IDs,
outcomes, token sets, and final prices. Sampled local trades were found in the
current Data API for the markets that were reachable without exceeding the
historical offset cap. Eight sampled transaction hashes had successful Polygon
receipts, and five sampled final scores agreed with the resolved market winner.

These are strong spot checks, not a claim that a live API can expose every
historical row indefinitely. Polymarket documents the separation between Gamma,
Data API, and CLOB in its [API introduction](https://docs.polymarket.com/api-reference/introduction).

## Important completeness caveat

The local artifacts are internally complete for the adapter-defined window, but
they are not yet proven complete through every timestamp in the broader raw API
archive:

- the local moneyline Parquet contains 1,677,376 rows;
- an independent raw archive contained 2,424,340 moneyline rows across the same
  285 condition IDs;
- under a strict season-window comparison, 749,439 rows were outside the local
  capture, across 107 markets; and
- most of those rows occur around the difference between `endDate` and
  `closedTime`, while the local capture also contains 2,475 pre-season rows.

This is a collection-window discrepancy, not an internal Parquet/DuckDB
corruption finding. Before publishing a final “complete through closure” claim,
the adapter should be changed to use the intended close boundary and the
affected markets should be re-fetched into a versioned snapshot.

## WNBA 2026 audit addendum

The ongoing-season extension was independently checked on 2026-08-02 UTC:

| Check | Evidence | Status |
|---|---:|---|
| Event cache and moneyline filter | 262 events / 262 moneyline markets; no duplicate event or condition IDs | Pass |
| Manifest versus DuckDB | 262 markets; 0 collection failures; all condition IDs covered | Pass |
| Parquet versus DuckDB | 820,258 raw rows; 817,084 exact-key-unique rows at both manifest and DuckDB grain | Pass |
| Trade-to-market joins | 0 orphan trades | Pass |
| Domains and required fields | 0 invalid trade rows; 0 required-field nulls; binary market shape | Pass |
| Time bounds | 0 future or out-of-window trades | Pass |
| Replay accounting | Maximum cash-flow residual about 2.9e-11; no unresolved settlement/P&L values | Pass |
| Candidate filters | 5+ CSV/query: 343; 10+ CSV/query: 211 | Pass |
| Excel compatibility | Workbook reloads; 27,948 profile links; 6 table filters and no duplicate table/worksheet filters | Pass |
| External metadata | Gamma census, Gamma spot, CLOB spot, and ESPN schedule spot | Pass |
| Polygon receipt probe | Public RPC returned HTTP 401 | Not run |

The local WNBA market status census is 220 closed/resolved, 1 live, 3 open,
1 stale_unresolved, and 37 upcoming. The stale row is Atlanta Dream vs.
Minnesota Lynx, event 436142: the event is closed but the market is
inactive/archived and unresolved. It remains outside realized ranking.

The raw Parquet duplicate rows are caused by refreshing unresolved markets and
appending another capture of already-seen history. The silver build removes
exact duplicate source rows before replay. This is safe for the current
analysis, but a future compaction step should replace repeated open-market
shards rather than accumulating them.

The complete machine-readable evidence is in
reports/wnba_2026_validation.json. It is intentionally saved next to the
reviewable WNBA report so future refreshes can be compared using the same
checks.

## Known schema limitations

- The public trade rows do not identify maker versus taker per row.
- There is no canonical trade/fill ID; transaction hashes repeat across fills.
- JSON outcome arrays and some dates are stored as strings in the silver layer.
- `Rams` versus `LAR` and a few slug/date conventions require ID-based joins.
- Display names and pseudonyms can be blank; wallet addresses remain the stable
  analytical identifier.
