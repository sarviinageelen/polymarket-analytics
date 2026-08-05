"""Shared market-selection rules for the sports moneyline pipelines."""

from __future__ import annotations

import json
from typing import Any


def parse_jsonish(value: Any, default: Any = None) -> Any:
    if isinstance(value, (list, dict, int, float, bool)):
        return value
    if value is None:
        return default
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return default


def is_moneyline_market(market: dict[str, Any], *, allow_untagged_binary: bool = False) -> bool:
    """Identify full-match moneyline markets without admitting props.

    Most current sports markets expose ``sportsMarketType=moneyline``. The
    2025 CBB series contains older two-outcome markets without that field; the
    fallback is deliberately opt-in and requires the stable ``cbb-`` slug.
    """

    if str(market.get("sportsMarketType") or "").lower() == "moneyline":
        return True
    if not allow_untagged_binary:
        return False
    slug = str(market.get("slug") or "").lower()
    outcomes = parse_jsonish(market.get("outcomes"), [])
    return slug.startswith("cbb-") and isinstance(outcomes, list) and len(outcomes) == 2
