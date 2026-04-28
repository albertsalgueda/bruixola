"""platforms.api_cat — STUB.

api_cat targets the Generalitat de Catalunya open-data portal (analisi.transparenciacatalunya.cat /
dadesobertes.gencat.cat). When activated this adapter ingests official property-related datasets
(IDESCAT housing, land registry exports, etc.) — not real-time listings, but
canonical reference data.

Wave 2 — see docs/SCRAPERS.md.
"""

from __future__ import annotations

from collections.abc import Iterator

from .base import PlatformAdapter, RawListing


class ApiCatAdapter(PlatformAdapter):
    name = "api_cat"
    source_host = "analisi.transparenciacatalunya.cat"

    def search_pages(self, city_slug: str) -> Iterator[str]:
        raise NotImplementedError(
            "api_cat: Wave 2 — Generalitat open-data integration. See docs/SCRAPERS.md."
        )

    def parse_listing(self, html: str, url: str) -> RawListing:
        raise NotImplementedError("api_cat adapter not active")
