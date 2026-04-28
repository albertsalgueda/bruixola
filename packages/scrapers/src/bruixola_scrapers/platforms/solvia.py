"""platforms.solvia — STUB.

Solvia.es is an Angular SPA — listing data loads via XHR after the JS bundle
runs. Static HTML scraping returns no listings. To activate this adapter we
need either:
  - Playwright-based fetcher (already a project dep) running with our
    BruixolaBot UA, OR
  - Reverse-engineer the JSON API the SPA calls (and respect any auth/rate
    limits documented or signaled by the responses).

See docs/SCRAPERS.md for the activation plan.
"""

from __future__ import annotations

from collections.abc import Iterator

from .base import PlatformAdapter, RawListing


class SolviaAdapter(PlatformAdapter):
    name = "solvia"
    source_host = "www.solvia.es"

    def search_pages(self, city_slug: str) -> Iterator[str]:
        raise NotImplementedError(
            "solvia: SPA — needs Playwright fallback or JSON API discovery. "
            "See docs/SCRAPERS.md."
        )

    def parse_listing(self, html: str, url: str) -> RawListing:
        raise NotImplementedError("solvia adapter not active")
