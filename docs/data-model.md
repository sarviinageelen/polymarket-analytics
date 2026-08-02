# Data model and accounting

## Grain

| Dataset/table | Grain | Main use |
|---|---|---|
| `market_dim` | One moneyline market/game | Teams, dates, outcomes, final prices |
| `trade_fact` | One API trade row | Full-fidelity replay and microstructure checks |
| `wallet_game_ledger` | One wallet × game | Performance filters and bettor rankings |
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

## Filtering bettors

Filters should be applied to `wallet_game_ledger`, not individual trade rows.
A safe starting definition is:

```sql
SELECT
    wallet,
    COUNT(*) AS settled_games,
    SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins,
    SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS losses,
    SUM(pnl) AS total_pnl,
    SUM(buy_cost) AS total_buy_cost
FROM wallet_game_ledger
WHERE resolution_type = 'resolved'
GROUP BY wallet
HAVING COUNT(*) >= 5
   AND SUM(CASE WHEN result IN ('win', 'loss') THEN 1 ELSE 0 END) >= 5
   AND SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) * 1.0
       / NULLIF(SUM(CASE WHEN result IN ('win', 'loss') THEN 1 ELSE 0 END), 0)
       >= 0.70;
```

This calculates profitable-game rate, not pure pick accuracy. A later model
should add directional pick accuracy, hedge rate, fees, markouts, and an
out-of-sample period.
