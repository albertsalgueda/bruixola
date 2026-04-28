"""Firecrawl-backed HTTP fetcher for portals behind WAFs (Habitaclia,
Fotocasa, Idealista). Reads `FIRECRAWL_API_KEY` from env.

We use it only as the `fetch()` swap-in inside specific adapters — the rest
of the project's PlatformAdapter contract is unchanged. Firecrawl returns
both rendered HTML and clean markdown; we feed the HTML into the same
BeautifulSoup parsers we use for pisos.com so adapters stay shape-uniform.

Cost: free 500 credits/mo, $16/mo for 3k credits. Each `/scrape` with
`proxy: 'stealth'` consumes ~5 credits. Budget per crawl carefully.

Per CLAUDE.md rule 8 — using a paid stealth-proxy service is the user's
explicit decision (granted 2026-04-28). The Habitaclia adapter is the only
caller; opt-in via `FIRECRAWL_API_KEY` presence.
"""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

_FIRECRAWL_URL = "https://api.firecrawl.dev/v1/scrape"


def _load_env() -> None:
    here = Path(__file__).resolve()
    for parent in [here.parent, *here.parents]:
        if (parent / ".env").is_file():
            load_dotenv(parent / ".env")
            return
    load_dotenv()


class FirecrawlClient:
    """Thin wrapper around Firecrawl's /v1/scrape. Returns rendered HTML
    (so existing bs4 parsers work) and exposes the inner HTTP status from
    the target site for retry decisions."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        proxy: str = "stealth",          # 'basic' | 'stealth'
        timeout_s: float = 90.0,
        rate_limit_per_sec: float = 2.0,  # Firecrawl's free-tier QPS budget
    ) -> None:
        if api_key is None:
            _load_env()
            api_key = os.environ.get("FIRECRAWL_API_KEY")
        if not api_key:
            raise RuntimeError(
                "FIRECRAWL_API_KEY required in env to use FirecrawlClient. "
                "Add it to .env or skip the Firecrawl-backed adapters."
            )
        self._client = httpx.Client(
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=timeout_s,
        )
        self._proxy = proxy
        self._min_interval_s = 1.0 / rate_limit_per_sec
        self._last_call = 0.0

    def fetch_html(self, url: str) -> tuple[str, int]:
        """Returns (rendered_html, inner_http_status). Raises on Firecrawl
        outer error or when the inner site returns a non-2xx that the
        caller should treat as a hard failure."""
        gap = time.monotonic() - self._last_call
        if gap < self._min_interval_s:
            time.sleep(self._min_interval_s - gap)
        self._last_call = time.monotonic()

        body = {
            "url": url,
            "formats": ["html"],
            "proxy": self._proxy,
            # Don't retry inside Firecrawl — we'd rather see the raw status.
            "onlyMainContent": False,
        }
        r = self._client.post(_FIRECRAWL_URL, json=body)
        if r.status_code != 200:
            raise RuntimeError(f"firecrawl outer {r.status_code}: {r.text[:200]}")
        data = r.json()
        if not data.get("success"):
            raise RuntimeError(f"firecrawl error: {data}")
        d = data.get("data", {}) or {}
        meta = d.get("metadata", {}) or {}
        inner = int(meta.get("statusCode") or 0)
        html = d.get("html") or ""
        if not html:
            raise RuntimeError(f"firecrawl returned empty html for {url}")
        return html, inner

    def close(self) -> None:
        self._client.close()
