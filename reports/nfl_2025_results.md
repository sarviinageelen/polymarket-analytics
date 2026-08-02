# NFL 2025 result snapshot

Generated from the collected NFL 2025 series snapshot on 2026-08-02 UTC.

## Scope

- Series: `10187` (`nfl-2025`)
- Closed events: 285
- Markets: 10,964
- Public trade rows: 3,162,649
- Wallets with trades: 105,981
- Wallet × market ledgers: 608,143

## Highest replayed P&L

| Rank | Display name | Wallet | P&L | ROI | Markets | Active weeks |
| ---: | --- | --- | ---: | ---: | ---: | ---: |
| 1 | 432614799197 | `0xdc876e6873772d38716fda7f2452a78d426d7ab6` | $3,812,991.64 | 34.00% | 114 | 7 |
| 2 | gmpm | `0x14964aefa2cd7caff7878b3820a690a03c5aa429` | $2,375,369.22 | 9.43% | 302 | 55 |
| 3 | SeriouslySirius | `0x16b29c50f2439faf627209b2ac0c7bbddaa8a881` | $2,157,169.35 | 7.34% | 973 | 38 |
| 4 | primm | `0xd38b71f3e8ed1af71983e5c309eac3dfa9b35029` | $2,147,378.17 | 33.57% | 197 | 54 |
| 5 | cozyfnf | `0x1ff26f9f8a048d4f6fb2e4283f32f6ca64d2dbbd` | $1,531,444.95 | 39.82% | 38 | 16 |
| 6 | DrPufferfish | `0xdb27bf2ac5d428a9c63dbc914611036855a6c56e` | $1,523,514.53 | 21.05% | 78 | 26 |
| 7 | Latina | `0x26437896ed9dfeb2f69765edcafe8fdceaab39ae` | $1,244,679.35 | 25.10% | 20 | 12 |
| 8 | `0x1D8A…` | `0x1d8a377c5020f612ce63a0a151970df64baae842` | $1,114,833.22 | 42.98% | 17 | 13 |
| 9 | setsukoworldchampion2026 | `0x8b1d19252ae3a41039784b9f6f5cb1b32b4974cc` | $1,106,099.56 | 35.83% | 33 | 13 |
| 10 | row888 | `0xd2c5d404493dc772fde0990a61e64ef1120079a0` | $1,081,855.33 | 35.36% | 13 | 2 |

The highest ROI after requiring at least 10 markets and $100,000 of buy cost is `gatorr`: $475,197.31 P&L on $827,843.76 of buy cost, or 57.40% replay ROI across 21 markets. ROI is a gross capital-efficiency proxy, not a bankroll return.

## Validation interpretation

The Data API closed-position endpoint was queried for the top ten. It does not return a row for every replayed losing/held position in this snapshot, so full replay P&L versus the endpoint sum is not a valid equality test. On overlapping condition IDs, several leaders match within cents to tens of dollars, while two still have material residuals requiring a deeper trade/accounting audit. The validation CSV records coverage, overlap P&L, and the residual for every wallet.

The full CSV outputs are generated locally under `data/results/` and are
intentionally ignored by Git because they are derived artifacts. The primary
files are `bettor_ranking.csv`, `bettor_ranking_roi.csv`, and
`closed_position_validation.csv`.
