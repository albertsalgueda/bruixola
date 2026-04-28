"""platforms.fotocasa — STUB.

Same Imperva-blocked situation as habitaclia. See docs/SCRAPERS.md.
"""

from __future__ import annotations

from collections.abc import Iterator

from .base import PlatformAdapter, RawListing


class FotocasaAdapter(PlatformAdapter):
    name = "fotocasa"
    source_host = "www.fotocasa.es"

    def search_pages(self, city_slug: str) -> Iterator[str]:
        raise NotImplementedError(
            "fotocasa: blocked by Imperva. Needs paid proxy — see docs/SCRAPERS.md."
        )

    def parse_listing(self, html: str, url: str) -> RawListing:
        raise NotImplementedError("fotocasa adapter not active")
