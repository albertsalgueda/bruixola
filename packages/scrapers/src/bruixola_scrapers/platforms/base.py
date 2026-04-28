"""platforms.base — shared HTTP + parsing contract for every portal.

Honors the project rules from CLAUDE.md:
  - One identifying UA per scraper, no rotation.
  - Respect robots.txt where present.
  - 1 req/sec/domain rate limit.
  - No detection-evasion. ToS exposure is documented and accepted.

Each adapter is a stateless object that knows how to:
  - enumerate listing-detail URLs for a given town slug,
  - fetch one detail page,
  - parse the HTML into a RawListing + image URL list.

The orchestrator (`pipeline.py`) drives this loop and persists rows to Supabase
one at a time (streaming writes — see `storage.supabase.upsert_listing`).
"""

from __future__ import annotations

import hashlib
import logging
import time
import urllib.robotparser
from abc import ABC, abstractmethod
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

logger = logging.getLogger(__name__)


# Single identifying UA. Do NOT rotate. Embeds a contact URL per the
# scraping etiquette rule in CLAUDE.md.
DEFAULT_USER_AGENT = "BruixolaBot/0.1 (+https://bruixola.cat/bot)"


class RobotsBlocked(Exception):
    """Raised when robots.txt disallows the URL we tried to fetch."""


@dataclass
class RawListing:
    """Adapter output. Mirrors the columns we'll upsert into public.listings.

    Whatever the adapter can't parse stays None — derive.py fills in derived
    columns later. The orchestrator (pipeline.py) is responsible for stamping
    crawl_id, scraped_at, and resolving city_slug.
    """

    platform: str
    platform_id: str
    url: str
    source_host: str
    source_kind: str = "major"

    title: str | None = None
    description: str | None = None
    city_slug: str | None = None              # filled in by pipeline
    address: str | None = None
    lat: float | None = None
    lng: float | None = None

    price_eur: float | None = None
    m2: float | None = None
    beds: int | None = None
    baths: int | None = None
    lift: bool | None = None
    energy_cert: str | None = None
    year_built: int | None = None
    year_renovated: int | None = None

    photos: list[str] = field(default_factory=list)

    # Derived id — sha1(platform + ":" + platform_id)[:12].
    @property
    def bruixola_id(self) -> str:
        digest = hashlib.sha1(
            f"{self.platform}:{self.platform_id}".encode()
        ).hexdigest()
        return digest[:12]


class _RateLimiter:
    """Per-host token-bucket of one. Blocks until min_interval has elapsed
    since the last call to acquire() for the same host."""

    def __init__(self, min_interval_s: float = 1.0) -> None:
        self.min_interval_s = min_interval_s
        self._last_call: dict[str, float] = {}

    def acquire(self, host: str) -> None:
        now = time.monotonic()
        last = self._last_call.get(host, 0.0)
        gap = now - last
        if gap < self.min_interval_s:
            time.sleep(self.min_interval_s - gap)
        self._last_call[host] = time.monotonic()


class PlatformAdapter(ABC):
    """Each portal subclasses this and implements the four abstract methods.

    Subclasses MUST set:
        name           — short id, e.g. 'habitaclia'
        source_host    — bare hostname, e.g. 'www.habitaclia.com'
    """

    name: str
    source_host: str
    source_kind: str = "major"
    user_agent: str = DEFAULT_USER_AGENT
    rate_limit_per_sec: float = 1.0
    request_timeout_s: float = 20.0

    def __init__(self) -> None:
        self._client = httpx.Client(
            headers={
                "User-Agent": self.user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
                "Accept-Language": "ca,es;q=0.9,en;q=0.8",
            },
            timeout=self.request_timeout_s,
            follow_redirects=True,
        )
        self._limiter = _RateLimiter(min_interval_s=1.0 / self.rate_limit_per_sec)
        self._robots: dict[str, urllib.robotparser.RobotFileParser] = {}

    # ── robots.txt ───────────────────────────────────────────────────────

    def _robots_for(self, url: str) -> urllib.robotparser.RobotFileParser:
        host = urlparse(url).netloc
        if host in self._robots:
            return self._robots[host]
        rp = urllib.robotparser.RobotFileParser()
        robots_url = f"{urlparse(url).scheme}://{host}/robots.txt"
        try:
            self._limiter.acquire(host)
            resp = self._client.get(robots_url)
            if resp.status_code == 200:
                rp.parse(resp.text.splitlines())
            else:
                # No robots.txt or unreachable → permit (etiquette rule says
                # "respect where present"). Log so we know.
                logger.info("no robots.txt at %s (status %s)", robots_url, resp.status_code)
                rp.parse([])
        except httpx.HTTPError as exc:
            logger.warning("robots fetch failed for %s: %s — permitting", host, exc)
            rp.parse([])
        self._robots[host] = rp
        return rp

    def can_fetch(self, url: str) -> bool:
        return self._robots_for(url).can_fetch(self.user_agent, url)

    # ── HTTP ─────────────────────────────────────────────────────────────

    @retry(
        retry=retry_if_exception_type((httpx.TransportError, httpx.RemoteProtocolError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        reraise=True,
    )
    def fetch(self, url: str) -> str:
        """Rate-limited, robots-respecting GET. Returns response text."""
        if not self.can_fetch(url):
            raise RobotsBlocked(url)
        host = urlparse(url).netloc
        self._limiter.acquire(host)
        resp = self._client.get(url)
        resp.raise_for_status()
        return resp.text

    # ── adapter contract ─────────────────────────────────────────────────

    @abstractmethod
    def search_pages(self, city_slug: str) -> Iterator[str]:
        """Yield listing-detail URLs for the given city. May fetch index pages
        internally — those fetches go through self.fetch() and are rate-limited
        like everything else."""

    @abstractmethod
    def parse_listing(self, html: str, url: str) -> RawListing:
        """Parse a detail page into a RawListing. Adapters are responsible for
        resolving platform_id from the URL or page content."""

    # Default — adapters can override if images live somewhere unusual.
    def parse_images(self, html: str) -> list[str]:
        """Return ordered list of image URLs (highest-res variants).

        Default extracts JSON-LD `image[]` and `<img>` srcset largest values.
        Override per-platform when needed.
        """
        from .image_extract import extract_image_urls

        return extract_image_urls(html)

    # Aux — adapters can override for richer dict (raw_jsonb, etc.).
    def raw_payload(self, html: str, url: str) -> dict[str, Any]:
        return {"source_url": url, "html_bytes": len(html)}

    def close(self) -> None:
        self._client.close()
