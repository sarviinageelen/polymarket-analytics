"""Small, dependency-free clients for Polymarket's public APIs.

The public APIs are intentionally kept behind this module so the rest of the
project can be tested with fixtures and so retries/pagination stay consistent.
"""

from __future__ import annotations

import json
import random
import threading
import time
from dataclasses import dataclass
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


class APIError(RuntimeError):
    """An API request failed after retries."""


@dataclass(frozen=True)
class APIConfig:
    gamma_base: str = "https://gamma-api.polymarket.com"
    data_base: str = "https://data-api.polymarket.com"
    clob_base: str = "https://clob.polymarket.com"
    user_agent: str = "polymarket-analytics/0.1"
    timeout_seconds: float = 120.0
    max_retries: int = 5
    min_request_interval_seconds: float = 0.08


class PolymarketAPI:
    """Read-only client for the public Gamma, Data, and CLOB APIs."""

    def __init__(self, config: APIConfig | None = None) -> None:
        self.config = config or APIConfig()
        self._rate_lock = threading.Lock()
        self._last_request_at = 0.0

    def _request_json(self, base: str, path: str, params: dict[str, Any]) -> Any:
        clean_params = {key: value for key, value in params.items() if value is not None}
        query = urlencode(clean_params)
        url = f"{base.rstrip('/')}/{path.lstrip('/')}"
        if query:
            url = f"{url}?{query}"
        request = Request(url, headers={"User-Agent": self.config.user_agent})

        for attempt in range(self.config.max_retries + 1):
            with self._rate_lock:
                wait_for = self.config.min_request_interval_seconds - (
                    time.monotonic() - self._last_request_at
                )
                if wait_for > 0:
                    time.sleep(wait_for)
                self._last_request_at = time.monotonic()

            try:
                with urlopen(request, timeout=self.config.timeout_seconds) as response:
                    return json.load(response)
            except HTTPError as exc:
                body = exc.read().decode("utf-8", errors="replace")
                if exc.code not in RETRYABLE_STATUS_CODES or attempt >= self.config.max_retries:
                    raise APIError(f"{exc.code} GET {url}: {body[:500]}") from exc
                retry_after = exc.headers.get("Retry-After")
                delay = float(retry_after) if retry_after else 2**attempt
            except (URLError, TimeoutError, OSError) as exc:
                if attempt >= self.config.max_retries:
                    raise APIError(f"GET {url}: {exc}") from exc
                delay = 2**attempt

            time.sleep(delay + random.random() * 0.25)

        raise AssertionError("unreachable")

    def gamma(self, path: str, **params: Any) -> Any:
        return self._request_json(self.config.gamma_base, path, params)

    def data(self, path: str, **params: Any) -> Any:
        return self._request_json(self.config.data_base, path, params)

    def clob(self, path: str, **params: Any) -> Any:
        return self._request_json(self.config.clob_base, path, params)

    def fetch_season_events(self, series_id: int = 10187) -> list[dict[str, Any]]:
        """Fetch every event in a Gamma series using keyset pagination."""

        events: list[dict[str, Any]] = []
        cursor: str | None = None
        while True:
            page = self.gamma(
                "/events/keyset",
                series_id=str(series_id),
                closed="true",
                limit=100,
                order="eventDate",
                ascending="true",
                after_cursor=cursor,
            )
            batch = page.get("events", []) if isinstance(page, dict) else []
            events.extend(batch)
            cursor = page.get("next_cursor") if isinstance(page, dict) else None
            if not cursor:
                break
        return events

    def fetch_sports_leaderboard(
        self,
        *,
        order_by: str = "PNL",
        time_period: str = "ALL",
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Fetch one page of Polymarket's public sports leaderboard."""

        rows = self.data(
            "/v1/leaderboard",
            category="SPORTS",
            timePeriod=time_period,
            orderBy=order_by,
            limit=min(limit, 50),
            offset=offset,
        )
        return rows if isinstance(rows, list) else []

    def fetch_event_trades(
        self,
        event_id: int | str,
        *,
        start_ts: int,
        end_ts: int,
        taker_only: bool = False,
        page_size: int = 10_000,
    ) -> list[dict[str, Any]]:
        """Fetch public trade rows for one event.

        The endpoint has a per-window offset cap. Most NFL events fit in one
        response; if a window hits the cap we split the timestamp range and
        retry recursively so a busy event cannot silently truncate the census.
        """

        if start_ts > end_ts:
            return []
        page_size = min(max(page_size, 1), 10_000)

        def fetch_window(window_start: int, window_end: int) -> list[dict[str, Any]]:
            rows = self.data(
                "/trades",
                eventId=str(event_id),
                limit=page_size,
                offset=0,
                takerOnly="true" if taker_only else "false",
                start=window_start,
                end=window_end,
            )
            rows = rows if isinstance(rows, list) else []
            if len(rows) < page_size:
                return rows

            # The API allows offsets through 10,000, so make one additional
            # page attempt before splitting. This preserves efficiency for a
            # busy but not extreme event.
            second = self.data(
                "/trades",
                eventId=str(event_id),
                limit=page_size,
                offset=page_size,
                takerOnly="true" if taker_only else "false",
                start=window_start,
                end=window_end,
            )
            second = second if isinstance(second, list) else []
            combined = rows + second
            if len(second) < page_size:
                return combined

            if window_start == window_end:
                raise APIError(
                    f"trade window for event {event_id} remains capped at one timestamp"
                )
            midpoint = (window_start + window_end) // 2
            left = fetch_window(window_start, midpoint)
            right = fetch_window(midpoint + 1, window_end)
            return left + right

        rows = fetch_window(start_ts, end_ts)
        # Deduplicate only exact repeated API rows. Distinct fills can share a
        # transaction hash, so the hash alone is not a safe key.
        seen: set[tuple[Any, ...]] = set()
        deduped: list[dict[str, Any]] = []
        for row in rows:
            key = (
                row.get("proxyWallet"),
                row.get("asset"),
                row.get("conditionId"),
                row.get("side"),
                row.get("size"),
                row.get("price"),
                row.get("timestamp"),
                row.get("transactionHash"),
            )
            if key not in seen:
                seen.add(key)
                deduped.append(row)
        return deduped

    def fetch_closed_positions(
        self,
        user: str,
        event_ids: Iterable[int | str],
        *,
        page_size: int = 50,
    ) -> list[dict[str, Any]]:
        """Fetch all closed positions for a user across a set of events."""

        ids = [str(event_id) for event_id in event_ids]
        rows: list[dict[str, Any]] = []
        # The API rejects large eventId lists; 100 is accepted in practice and
        # keeps each request well below common URL limits.
        for start in range(0, len(ids), 100):
            chunk = ",".join(ids[start : start + 100])
            offset = 0
            while True:
                page = self.data(
                    "/closed-positions",
                    user=user,
                    eventId=chunk,
                    limit=min(page_size, 50),
                    offset=offset,
                    sortBy="REALIZEDPNL",
                    sortDirection="DESC",
                )
                page = page if isinstance(page, list) else []
                rows.extend(page)
                if len(page) < min(page_size, 50):
                    break
                offset += len(page)
        return rows
