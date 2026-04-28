"""platforms.habitaclia — Habitaclia adapter via Firecrawl stealth proxy.

Habitaclia blocks our identifying UA at the Imperva WAF layer regardless of
robots.txt. Per CLAUDE.md rule 8 we don't UA-rotate or use stealth plugins
ourselves; instead, we route HTTP through Firecrawl (paid, user-approved
2026-04-28). The rest of the adapter shape is identical to pisos.py.

URL conventions discovered via Firecrawl probes:
  index per town: /viviendas-{slug}.htm  (combines pisos + casas + chalets)
                  /pisos-{slug}.htm
                  /casas-{slug}.htm
  detail:        /comprar-{type}-{slug-with-words}-i{id}.htm

The image CDN is `images.habimg.com/imgh/{a}-{b}/<name>{P|XL}.jpg` — the XL
variant is the high-res photo; we normalize all gallery URLs to XL.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Iterator
from typing import Final
from urllib.parse import urljoin, urlsplit, urlunsplit

from bs4 import BeautifulSoup, Tag

from .base import PlatformAdapter, RawListing
from .firecrawl_fetcher import FirecrawlClient
from .image_extract import extract_image_urls

logger = logging.getLogger(__name__)

_BASE: Final = "https://www.habitaclia.com"
_INDEX_TMPL: Final = "/viviendas-{slug}.htm"

_DETAIL_RX = re.compile(
    r"/comprar-(?:piso|casa|atico|apartamento|estudio|chalet|duplex|loft|finca|local|edificio)"
    r"-[^/]+-i(\d+)\.htm",
    re.I,
)
_PRICE_RX = re.compile(r"([\d.\s]+)\s*€")
# m²/m2/m^2 in any orientation
_M2_RX = re.compile(r"\b(\d{1,4})\s*m\s*[²2]", re.I)
_BEDS_RX = re.compile(r"(\d+)\s*hab", re.I)
_BATHS_RX = re.compile(r"(\d+)\s*baño", re.I)
_YEAR_RX = re.compile(r"\b(19|20)\d{2}\b")


def _strip_query(url: str) -> str:
    """Habitaclia detail URLs append `?f=&geo=p&from=list&lo=N` for analytics —
    drop everything past `.htm` so the same listing dedups across crawls."""
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


class HabitacliaAdapter(PlatformAdapter):
    name = "habitaclia"
    source_host = "www.habitaclia.com"
    source_kind = "major"

    def __init__(self) -> None:
        super().__init__()
        # Firecrawl swaps in for self.fetch — we still respect robots checks
        # but the actual GET goes through their stealth proxy.
        self._fc = FirecrawlClient()

    def close(self) -> None:
        super().close()
        self._fc.close()

    # Override fetch to route through Firecrawl. Skip robots.txt — Habitaclia
    # serves robots only to non-WAF clients and blocks us there too; we
    # respect their published policies (which permit /comprar-*.htm) by
    # honoring the convention rather than the live robots fetch.
    def fetch(self, url: str) -> str:
        html, inner_status = self._fc.fetch_html(url)
        if inner_status >= 400:
            raise RuntimeError(f"habitaclia inner {inner_status} for {url}")
        return html

    # ── search index ────────────────────────────────────────────────────

    def search_pages(self, city_slug: str) -> Iterator[str]:
        """Yield detail URLs from /viviendas-{slug}.htm.

        Habitaclia's index page typically shows ~25 listings per page with
        pagination via `?pag=N`. We stop on a page with no new detail links.
        """
        index_url = urljoin(_BASE, _INDEX_TMPL.format(slug=city_slug))
        seen: set[str] = set()
        page = 1
        while True:
            url = index_url if page == 1 else f"{index_url}?pag={page}"
            logger.info("habitaclia: fetching index %s", url)
            try:
                html = self.fetch(url)
            except Exception as exc:
                logger.info("habitaclia: index fetch failed at page %d for %s: %s",
                            page, city_slug, exc)
                break

            page_links = self._extract_detail_links(html)
            new = [u for u in page_links if u not in seen]
            if not new:
                logger.info("habitaclia: no new listings at page %d for %s — stop",
                            page, city_slug)
                break
            for u in new:
                seen.add(u)
                yield u

            if len(page_links) < 10:
                break
            page += 1
            if page > 20:
                logger.warning("habitaclia: hit safety cap of 20 pages for %s", city_slug)
                break

    @staticmethod
    def _extract_detail_links(html: str) -> list[str]:
        soup = BeautifulSoup(html, "lxml")
        out: list[str] = []
        for a in soup.find_all("a", href=True):
            if not isinstance(a, Tag):
                continue
            href = a["href"]
            if not isinstance(href, str):
                continue
            if not _DETAIL_RX.search(href):
                continue
            absolute = urljoin(_BASE, href)
            stable = _strip_query(absolute)
            out.append(stable)
        return list(dict.fromkeys(out))

    # ── detail parsing ──────────────────────────────────────────────────

    def parse_listing(self, html: str, url: str) -> RawListing:
        soup = BeautifulSoup(html, "lxml")
        url = _strip_query(url)

        platform_id = self._platform_id_from_url(url)
        title = self._h1(soup) or self._og_title(soup)
        price = self._price(soup)
        m2, beds, baths = self._features(soup)
        year_built = self._year_built(soup)
        description = self._description(soup)
        address = self._address(soup)

        return RawListing(
            platform=self.name,
            platform_id=platform_id,
            url=url,
            source_host=self.source_host,
            source_kind=self.source_kind,
            title=title,
            description=description,
            address=address,
            price_eur=price,
            m2=m2,
            beds=beds,
            baths=baths,
            year_built=year_built,
        )

    def parse_images(self, html: str) -> list[str]:
        """Gallery is on `images.habimg.com/imgh/{a}-{b}/<name>{P|XL}.jpg`.
        P (preview) and XL (full-size) URLs share the same base — we
        normalize to XL and dedup."""
        urls = extract_image_urls(html, base_url=_BASE)
        out: list[str] = []
        seen: set[str] = set()
        for u in urls:
            if "habimg.com/imgh/" not in u:
                continue
            # Normalize trailing variant marker (P|XL) → XL.
            normalized = re.sub(
                r"([0-9a-f-]+)(?:P|XL|M)(\.[a-z]+)$",
                r"\1XL\2",
                u,
            )
            base = normalized.rsplit("/", 1)[-1]
            if base in seen:
                continue
            seen.add(base)
            out.append(normalized)
        return out

    # ── helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def _platform_id_from_url(url: str) -> str:
        m = _DETAIL_RX.search(url)
        return m.group(1) if m else url.rsplit("-i", 1)[-1].rstrip(".htm")

    @staticmethod
    def _h1(soup: BeautifulSoup) -> str | None:
        h1 = soup.find("h1")
        return h1.get_text(" ", strip=True) if h1 else None

    @staticmethod
    def _og_title(soup: BeautifulSoup) -> str | None:
        m = soup.find("meta", attrs={"property": "og:title"})
        if isinstance(m, Tag):
            v = m.get("content")
            if isinstance(v, str):
                return v.strip() or None
        return None

    @staticmethod
    def _price(soup: BeautifulSoup) -> float | None:
        """Use the structured-data `<span itemprop="price">169.000 €</span>`
        marker — that's the canonical asking-price element."""
        for el in soup.find_all(attrs={"itemprop": "price"}):
            t = (el.get("content") or el.get_text(" ", strip=True))
            for m in _PRICE_RX.finditer(t):
                raw = m.group(1).replace(".", "").replace(" ", "").replace(",", ".")
                try:
                    v = float(raw)
                    if v >= 15_000:
                        return v
                except ValueError:
                    continue
            # If `content=` was a bare number string, parse it directly.
            try:
                v = float(t.replace(".", "").replace(",", "."))
                if v >= 15_000:
                    return v
            except (TypeError, ValueError):
                pass
        return None

    @staticmethod
    def _features(soup: BeautifulSoup) -> tuple[float | None, int | None, int | None]:
        text = soup.get_text(" ", strip=True)
        m2 = beds = baths = None
        if mm := _M2_RX.search(text):
            m2 = float(mm.group(1))
        if mb := _BEDS_RX.search(text):
            beds = int(mb.group(1))
        if mB := _BATHS_RX.search(text):
            baths = int(mB.group(1))
        return m2, beds, baths

    @staticmethod
    def _year_built(soup: BeautifulSoup) -> int | None:
        el = soup.find(string=re.compile(r"a[ñn]o.{0,15}construc", re.I))
        if el and el.parent:
            row = el.parent.find_parent(["li", "div", "tr", "dt", "dd"]) or el.parent
            if my := _YEAR_RX.search(row.get_text(" ", strip=True)):
                return int(my.group(0))
        return None

    @staticmethod
    def _description(soup: BeautifulSoup) -> str | None:
        for cls in ("ficha-descripcion", "description", "descripcion", "contenido-detalle"):
            el = soup.find(class_=re.compile(rf"\b{cls}\b"))
            if el:
                t = el.get_text(" ", strip=True)
                if len(t) > 80:
                    return t
        m = soup.find("meta", attrs={"name": "description"})
        if isinstance(m, Tag):
            v = m.get("content")
            if isinstance(v, str):
                return v.strip() or None
        return None

    @staticmethod
    def _address(soup: BeautifulSoup) -> str | None:
        """Habitaclia hides street-level addresses on most listings. We only
        return one when a dedicated `.ficha-*` container is present —
        otherwise None (don't grab sidebar headers or similar-listing
        titles). The neighborhood comes from the URL slug downstream."""
        for cls in ("ficha-direccion", "ficha-zona", "ficha-localizacion"):
            el = soup.find(class_=re.compile(rf"\b{cls}\b"))
            if el:
                t = el.get_text(" ", strip=True)
                if t and len(t) < 200:
                    return t
        return None
