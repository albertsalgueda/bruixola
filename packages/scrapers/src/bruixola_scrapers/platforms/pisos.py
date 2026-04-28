"""platforms.pisos — adapter for pisos.com (sale listings).

Why pisos.com is the v1 target instead of Habitaclia / Fotocasa:
  - Habitaclia + Fotocasa actively block BruixolaBot/0.1 at Imperva regardless
    of robots.txt content. CLAUDE.md rule 8 disallows UA rotation, so we ship
    pisos.com and stub the others.
  - Solvia is an Angular SPA — listing data loads via XHR after JS, so static
    HTML scraping returns nothing. Wave 2 will need either Playwright or API
    discovery.

Index URL pattern:
    https://www.pisos.com/viviendas/{slug}/?pagina={n}

Detail URL pattern (whatever the index links to), e.g.:
    https://www.pisos.com/comprar/casa-ripoll_centro_urbano-62598064804_101300/

platform_id = the trailing "{idA}_{idB}" group from the detail URL — stable
per listing and used as the dedup key.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Iterator
from typing import Final
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from .base import PlatformAdapter, RawListing
from .image_extract import extract_image_urls

logger = logging.getLogger(__name__)

_BASE: Final = "https://www.pisos.com"
# Sale-listings index. /viviendas/{slug}/ is a subhome navigation page on
# pisos.com — only some small towns happen to show listings there. The
# canonical "all sale listings in this city" URL is /venta/pisos-{slug}/.
_INDEX_PATH_TMPL: Final = "/venta/pisos-{slug}/"

# pisos.com URL slugs use ASCII town names with underscores for multi-word
# towns. Most map cleanly from our city.slug — we just swap '-' for '_'.
_SLUG_OVERRIDES: Final[dict[str, str]] = {
    # Our slug → pisos.com slug if they diverge.
    # Examples (filled as we hit edge cases during the dry run):
    "les-llosses": "llosses",
    "vallfogona-de-ripolles": "vallfogona-de-ripolles",
}

_PRICE_RX = re.compile(r"([\d.\s]+)\s*€")
_NUMBER_RX = re.compile(r"\d+(?:[.,]\d+)?")
_PLATFORM_ID_RX = re.compile(r"-(\d+_\d+)/?$")
_M2_RX = re.compile(r"(\d+)\s*m\s*(?:²|2|<sup>2</sup>)", re.I)
_BEDS_RX = re.compile(r"(\d+)\s*hab", re.I)
_BATHS_RX = re.compile(r"(\d+)\s*baño", re.I)
_YEAR_RX = re.compile(r"\b(19|20)\d{2}\b")
# URL pattern: /comprar/{type}-{neighborhood-or-zone}-{idA}_{idB}/
_URL_NHOOD_RX = re.compile(r"/comprar/[a-z]+-([^/]+)-\d+_\d+/?$")


def _to_pisos_slug(city_slug: str) -> str:
    return _SLUG_OVERRIDES.get(city_slug, city_slug)


def _parse_int(text: str) -> int | None:
    m = _NUMBER_RX.search(text)
    if not m:
        return None
    try:
        return int(m.group(0).replace(".", "").replace(",", ""))
    except ValueError:
        return None


def _parse_price_eur(text: str) -> float | None:
    m = _PRICE_RX.search(text)
    if not m:
        return None
    raw = m.group(1).strip()
    # Spanish formatting: 380.000 €  or  1.250.000 €  ("." = thousands)
    raw = raw.replace(".", "").replace(" ", "").replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


class PisosComAdapter(PlatformAdapter):
    name = "pisos"
    source_host = "www.pisos.com"
    source_kind = "major"

    # ── search index ────────────────────────────────────────────────────

    # Threshold for "this is a real city index page, trust everything on it".
    # Below this, pisos.com is mostly serving fallback rows from nearby towns
    # so we apply the strict slug filter.
    _DENSE_PAGE_THRESHOLD = 20

    def search_pages(self, city_slug: str) -> Iterator[str]:
        """Yield detail URLs for sale listings in this city.

        Walks paginated index pages until one returns no listings or the next
        page link is missing. At 1 req/s and 30 listings/page that's ~30 listings
        per second of crawl time per city, which is fine.

        Pisos.com mixes in "nearby town" suggestions when the searched town
        has zero or few in-town listings — and big cities use neighborhood
        slugs in URLs (e.g. Barcelona's `eixample_dreta`) that don't contain
        the city name. So:

          - Dense page (>= _DENSE_PAGE_THRESHOLD ad-previews): trust the page,
            accept all anchors. Big cities go this path.
          - Sparse page: apply the strict slug filter. Small Ripollès villages
            go this path; misattribution drops sharply.
        """
        pisos_slug = _to_pisos_slug(city_slug)
        url_token = pisos_slug.replace("-", "_")
        page = 1
        seen: set[str] = set()
        while True:
            url = urljoin(_BASE, _INDEX_PATH_TMPL.format(slug=pisos_slug))
            if page > 1:
                url = f"{url}?pagina={page}"
            logger.info("pisos: fetching index %s", url)
            try:
                html = self.fetch(url)
            except Exception:
                logger.info("pisos: index fetch failed at page %d for %s", page, city_slug)
                break

            page_links = self._index_links(html)
            if len(page_links) >= self._DENSE_PAGE_THRESHOLD:
                # Dense page — trust everything. (Major Catalan cities.)
                accepted = page_links
            else:
                # Sparse page — apply the slug filter. (Small towns; pisos.com
                # injects nearby-town fallbacks when the searched town is empty.)
                accepted = [
                    u for u in page_links
                    if f"-{url_token}-" in u or f"-{url_token}_" in u
                ]
                if len(page_links) and not accepted:
                    logger.info(
                        "pisos: %d ad-previews on %s sparse page were all "
                        "nearby-fallbacks — skipping",
                        len(page_links),
                        city_slug,
                    )

            new = [u for u in accepted if u not in seen]
            if not new:
                logger.info("pisos: no new listings at page %d for %s — stop", page, city_slug)
                break
            for u in new:
                seen.add(u)
                yield u

            if len(page_links) < 20:
                break
            page += 1
            if page > 50:
                logger.warning("pisos: hit safety cap of 50 pages for %s", city_slug)
                break

    @staticmethod
    def _index_links(html: str) -> list[str]:
        soup = BeautifulSoup(html, "lxml")
        out: list[str] = []
        for a in soup.find_all("a", href=True):
            if not isinstance(a, Tag):
                continue
            cls = a.get("class") or []
            cls_str = " ".join(cls) if isinstance(cls, list) else str(cls)
            if "ad-preview" not in cls_str:
                continue
            href = a["href"]
            if isinstance(href, str) and href.startswith("/comprar/"):
                out.append(urljoin(_BASE, href))
        # Dedup preserving order.
        return list(dict.fromkeys(out))

    # ── detail page parsing ─────────────────────────────────────────────

    def parse_listing(self, html: str, url: str) -> RawListing:
        soup = BeautifulSoup(html, "lxml")

        platform_id = self._platform_id_from_url(url)
        title = self._h1_text(soup) or self._og_title(soup)
        price = self._price(soup)
        description = self._description(soup)
        m2, beds, baths = self._features(soup)
        year_built = self._year_built(soup)
        address = self._address_from_url(url)

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
        """Pisos.com hosts photos at fotos.imghs.net with size variants in the
        URL path: xl-wp (largest), apps-wp, fch-wp, fchm-wp.

        Cover photo is server-rendered at xl-wp; the rest of the gallery is
        usually lazy-loaded at fchm-wp (medium). Their CDN serves the same
        photo at any size segment, so we normalize every URL to xl-wp.
        """
        urls = extract_image_urls(html, base_url=_BASE)

        # Dedup by trailing filename, keep first-seen order, normalize size.
        seen: set[str] = set()
        out: list[str] = []
        size_segments = ("/xl-wp/", "/apps-wp/", "/fch-wp/", "/fchm-wp/")
        for u in urls:
            if "fotos.imghs.net" not in u:
                continue
            key = u.rsplit("/", 1)[-1]
            if key in seen:
                continue
            seen.add(key)
            normalized = u
            for seg in size_segments:
                if seg in normalized:
                    normalized = normalized.replace(seg, "/xl-wp/")
                    break
            out.append(normalized)
        return out

    # ── helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def _platform_id_from_url(url: str) -> str:
        m = _PLATFORM_ID_RX.search(url.rstrip("/"))
        if not m:
            # Fallback: hash the path.
            return url.rstrip("/").rsplit("/", 1)[-1]
        return m.group(1)

    @staticmethod
    def _h1_text(soup: BeautifulSoup) -> str | None:
        h1 = soup.find("h1")
        if h1:
            return h1.get_text(" ", strip=True) or None
        return None

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
        # Most reliable: .price__value.
        for cls in ("price__value", "price--big", "jsx-price"):
            el = soup.find(class_=re.compile(cls))
            if el:
                p = _parse_price_eur(el.get_text(" ", strip=True))
                if p is not None:
                    return p
        # Fallback: og:title sometimes embeds the price ("... por 380.000 €").
        og = soup.find("meta", attrs={"property": "og:title"})
        if isinstance(og, Tag):
            v = og.get("content")
            if isinstance(v, str):
                p = _parse_price_eur(v)
                if p is not None:
                    return p
        return None

    @staticmethod
    def _description(soup: BeautifulSoup) -> str | None:
        el = soup.find(class_=re.compile(r"description__content"))
        if el:
            return el.get_text(" ", strip=True) or None
        # Fallback: meta description.
        m = soup.find("meta", attrs={"name": "description"})
        if isinstance(m, Tag):
            v = m.get("content")
            if isinstance(v, str):
                return v.strip() or None
        return None

    @staticmethod
    def _features(soup: BeautifulSoup) -> tuple[float | None, int | None, int | None]:
        """Pull m2, beds, baths from the features block. The block layout is a
        list of tile-like elements with a label + value, e.g. '120 m²' / '4 hab.'
        / '2 baños'. We grep the whole block as text — robust to class drift."""
        m2: float | None = None
        beds: int | None = None
        baths: int | None = None

        feats = soup.find(class_=re.compile(r"features|details|jsx-feat"))
        text = feats.get_text(" ", strip=True) if feats else soup.get_text(" ", strip=True)

        m = _M2_RX.search(text)
        if m:
            try:
                m2 = float(m.group(1))
            except ValueError:
                pass
        m = _BEDS_RX.search(text)
        if m:
            beds = int(m.group(1))
        m = _BATHS_RX.search(text)
        if m:
            baths = int(m.group(1))
        return m2, beds, baths

    @staticmethod
    def _year_built(soup: BeautifulSoup) -> int | None:
        # Look for "año de construcción" / "construido en"
        el = soup.find(string=re.compile(r"a[ñn]o.{0,8}construc", re.I))
        if el:
            sibling_text = (
                el.parent.get_text(" ", strip=True) if el.parent is not None else str(el)
            )
            m = _YEAR_RX.search(sibling_text)
            if m:
                return int(m.group(0))
        return None

    @staticmethod
    def _address_from_url(url: str) -> str | None:
        """Pisos.com hides street-level address ('La ubicación es aproximada').
        The most reliable location signal is the neighborhood/zone segment in
        the URL slug — e.g. 'casa-ripoll_centro_urbano-...' → 'Centro Urbano'.
        Returns a human-formatted neighborhood name, or None if the URL doesn't
        encode one."""
        m = _URL_NHOOD_RX.search(url.rstrip("/"))
        if not m:
            return None
        slug = m.group(1)
        # Common slug pattern is "{city}_{neighborhood}" or just "{city}".
        parts = slug.split("_")
        if len(parts) < 2:
            return None  # only city in the slug, no neighborhood
        nhood = " ".join(p.capitalize() for p in parts[1:])
        return nhood
