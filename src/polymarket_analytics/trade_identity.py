"""Canonical identity helpers for public Polymarket trade rows.

The same fill can appear more than once in overlapping API windows or across
incremental refreshes.  Enrichment fields such as a bettor's display name or
event title are not part of a trade's identity and may change between fetches.
Keep the identity definition in one place so the bronze census, DuckDB silver
layer, and validator cannot silently count the same fill differently.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


TRADE_IDENTITY_COLUMNS: tuple[str, ...] = (
    "proxyWallet",
    "asset",
    "conditionId",
    "side",
    "size",
    "price",
    "timestamp",
    "transactionHash",
)


def _text(value: Any, *, lower: bool = False, upper: bool = False) -> str:
    text = "" if value is None else str(value)
    if lower:
        return text.lower()
    if upper:
        return text.upper()
    return text


def _number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        # Preserve malformed values as a stable string instead of making two
        # malformed rows look like the same valid numeric trade.
        return str(value)  # type: ignore[return-value]


def _integer(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return str(value)  # type: ignore[return-value]


def trade_identity(row: Mapping[str, Any]) -> tuple[Any, ...]:
    """Return the canonical, case-normalized identity for one trade fill."""

    return (
        _text(row.get("proxyWallet"), lower=True),
        _text(row.get("asset")),
        _text(row.get("conditionId")),
        _text(row.get("side"), upper=True),
        _number(row.get("size")),
        _number(row.get("price")),
        _integer(row.get("timestamp")),
        _text(row.get("transactionHash"), lower=True),
    )


def identity_sql_columns(alias: str = "") -> tuple[str, ...]:
    """Return DuckDB expressions matching :func:`trade_identity`."""

    prefix = f"{alias}." if alias else ""
    return (
        f"lower(coalesce({prefix}proxyWallet, ''))",
        f"coalesce({prefix}asset, '')",
        f"coalesce({prefix}conditionId, '')",
        f"upper(coalesce({prefix}side, ''))",
        f"CAST({prefix}size AS DOUBLE)",
        f"CAST({prefix}price AS DOUBLE)",
        f"CAST({prefix}timestamp AS BIGINT)",
        f"lower(coalesce({prefix}transactionHash, ''))",
    )


def identity_hash_sql(alias: str = "") -> str:
    """Return a stable DuckDB hash expression for the canonical identity."""

    columns = identity_sql_columns(alias)
    values = ", ".join(f"coalesce(CAST({column} AS VARCHAR), '')" for column in columns)
    return f"md5(concat_ws('|', {values}))"
