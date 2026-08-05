# Data model and accounting

## Grain

| Dataset/table | Grain | Main use |
|---|---|---|
| `market_dim` | One moneyline market/game | Teams, dates, outcomes, final prices |
| `trade_fact` | One canonical API trade fill | Full-fidelity replay and microstructure checks |
| `wallet_game_ledger` | One wallet × game | Complete all-trades accounting and audit |
| `wallet_game_prematch_ledger` | One wallet × game with activity before kickoff | Pre-match skill filters and rankings |
| Wallet summary CSV | One wallet | Cross-game ranking and consistency |

## Core trade fields

- `wallet` / `proxyWallet`: the public wallet identifier;
- `condition_id`: the unique market/game key;
- `side`: `BUY` or `SELL`;
- `asset`: the traded outcome token;
- `outcome_index`: binary outcome position, 0 or 1;
- `price`: dollars per share;
- `size`: number of shares;
- `timestamp` and `trade_time_utc`: event time;
- `transaction_hash`: blockchain transaction reference, not a unique fill ID.

The canonical trade identity is the normalized tuple
`proxyWallet + asset + conditionId + side + size + price + timestamp + transactionHash`.
Wallet addresses, sides, and transaction hashes are case-normalized. API
refreshes can overlap, and enrichment fields such as bettor names and event
titles can change; those fields are not used to decide whether a fill is new.
Bronze keeps the raw overlap count for auditability, while `trade_fact` keeps
exactly one row per canonical identity.

## Replay logic

For each wallet and game:

```text
BUY:  cash_flow -= size × price; net_shares[outcome] += size
SELL: cash_flow += size × price; net_shares[outcome] -= size

settlement = net_shares_a × final_price_a
           + net_shares_b × final_price_b

pnl = cash_flow + settlement
```

The database preserves negative net positions rather than clipping them. This
matters for sell-only and partially hedged activity.

## Resolution rules

Most markets resolve as `[1, 0]` or `[0, 1]`. One captured Packers–Cowboys
market resolves as `[0.5, 0.5]`; it is stored as `resolution_type = 'tie'` and
excluded from strict one-winner calculations when appropriate.

## Ongoing-market fields

For an ongoing season, market status and resolution are separate concepts:

| Field | Meaning |
|---|---|
| market_status | closed, live, open, upcoming, or stale_unresolved |
| resolution_type | resolved, tie, or unresolved |
| current_price_a/b | Latest cached Gamma prices used for mark-to-market |
| final_price_a/b | Populated only for resolved or tie markets |
| settlement_value | Populated only for resolved or tie wallet-game ledgers |
| realized_pnl | Populated only for resolved or tie wallet-game ledgers |
| mark_to_market_pnl | Current cash flow plus current position value |

Never turn a current price of 1.0 into a final result unless the market is
also marked closed and the resulting resolution passes the database rules.
This protects the ranking from premature settlement and canceled-market
artifacts.

## Pre-match cutoff and filtering users

Candidate filters are applied to `wallet_game_prematch_ledger`, not the
all-trades ledger. The ledger contains only trades strictly before kickoff;
trades exactly at kickoff or later do not contribute. A safe definition is:

```sql
SELECT
    wallet,
    COUNT(*) AS settled_games,
    SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins,
    SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS losses,
    SUM(pnl) AS total_pnl,
    SUM(buy_cost) AS total_buy_cost
FROM wallet_game_prematch_ledger
WHERE resolution_type = 'resolved'
  AND qualifying_position
GROUP BY wallet
HAVING COUNT(*) >= 5
   AND SUM(CASE WHEN result IN ('win', 'loss') THEN 1 ELSE 0 END) >= 5
   AND SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) * 1.0
       / NULLIF(SUM(CASE WHEN result IN ('win', 'loss') THEN 1 ELSE 0 END), 0)
       >= 0.70;
```

This calculates profitable pre-match-game rate, not pure pick accuracy. The
ledger also stores `primary_pick` and `pick_result` for directional accuracy,
plus post-kickoff trade counts and all-trades P&L for comparison. There is no
minimum BUY-cost filter.
