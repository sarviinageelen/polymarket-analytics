"""Replay the Nav1212 NFL 2025 full-life moneyline Parquet experiment."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Iterator

import pyarrow.parquet as pq


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from polymarket_analytics.analysis import (  # noqa: E402
    compact_market_index,
    replay_trades,
    write_csv,
)


def iter_parquet_rows(trade_dir: Path) -> Iterator[dict[str, Any]]:
    for path in sorted(trade_dir.glob("*.parquet")):
        parquet = pq.ParquetFile(path)
        for batch in parquet.iter_batches(batch_size=50_000):
            yield from batch.to_pylist()


def main() -> int:
    experiment_dir = ROOT / "data/experiments/nav_nfl_2025_moneyline"
    events = json.loads((ROOT / "data/raw/nfl_2025_events.json").read_text(encoding="utf-8"))
    market_index = {
        condition_id: market
        for condition_id, market in compact_market_index(events).items()
        if market["market_type"] == "moneyline"
    }
    summaries, market_rows = replay_trades(
        iter_parquet_rows(experiment_dir / "bronze/trades"), market_index
    )

    result_dir = experiment_dir / "results"
    write_csv(summaries, result_dir / "bettor_ranking_pnl.csv")
    write_csv(market_rows, result_dir / "market_pnl.csv")

    def candidate(min_games: int) -> list[dict[str, Any]]:
        rows = [
            row
            for row in summaries
            if row["markets"] >= min_games
            and row["wins"] + row["losses"] >= min_games
            and row["win_rate"] >= 0.70
            and row["buy_cost"] >= 1_000
        ]
        return sorted(rows, key=lambda row: (row["total_pnl"], row["buy_cost"]), reverse=True)

    candidate_5 = candidate(5)
    candidate_10 = candidate(10)
    write_csv(candidate_5, result_dir / "bettor_candidates_5games_70pct.csv")
    write_csv(candidate_10, result_dir / "bettor_candidates_10games_70pct.csv")

    manifest = json.loads((experiment_dir / "manifest.json").read_text(encoding="utf-8"))
    summary = {
        "scope": "NFL 2025 full-life moneyline markets",
        "source_repo": manifest["source_repo"],
        "source_revision": manifest["source_revision"],
        "markets": len(market_index),
        "trade_rows_fetched": manifest["trade_rows"],
        "bettors_with_trades": len(summaries),
        "wallet_market_ledgers": len(market_rows),
        "ranking_basis": "BUY/SELL replay plus final Gamma outcomePrices",
        "win_rate_definition": "profitable settled wallet × moneyline market ledgers / non-flat ledgers",
        "minimum_buy_cost": 1000,
        "candidate_filters": {
            "5_game_view": {"minimum_games": 5, "minimum_win_rate": 0.70},
            "10_game_view": {"minimum_games": 10, "minimum_win_rate": 0.70},
        },
        "top_pnl": summaries[:25],
        "top_5_game_candidates": candidate_5[:25],
        "top_10_game_candidates": candidate_10[:25],
    }
    result_dir.mkdir(parents=True, exist_ok=True)
    (result_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "markets": len(market_index),
                "trade_rows": manifest["trade_rows"],
                "bettors": len(summaries),
                "ledgers": len(market_rows),
                "candidates_5games_70pct": len(candidate_5),
                "candidates_10games_70pct": len(candidate_10),
            },
            indent=2,
        )
    )
    for rank, row in enumerate(summaries[:25], start=1):
        print(
            f"{rank:>3} {row['name'] or row['pseudonym'] or row['wallet'][:10]} "
            f"pnl=${row['total_pnl']:,.2f} roi={row['roi']:.2%} "
            f"games={row['markets']} win_rate={row['win_rate']:.1%}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
