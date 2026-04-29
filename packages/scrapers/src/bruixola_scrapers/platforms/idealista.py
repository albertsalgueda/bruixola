"""platforms.idealista — Idealista adapter via Firecrawl stealth proxy.

Idealista uses DataDome WAF; like Habitaclia, our identifying UA is blocked
at the HTTP layer. Per CLAUDE.md rule 8 we don't bypass in-house — we route
HTTP through Firecrawl (paid, user-approved 2026-04-28).

URL conventions (verified via Firecrawl probes, 2026-04-28):
  comarca:    /venta-viviendas/{provincia}/{comarca-slug}/
              e.g. /venta-viviendas/girona/ripolles/
  town:       /venta-viviendas/{slug}-{provincia-stem}/
              e.g. /venta-viviendas/camprodon-girona/
              (provincia-stem drops "-provincia" — "barcelona-provincia"
              becomes just "barcelona" in town slugs)
  detail:     /inmueble/{id}/    — clean numeric ID, easy platform_id

Image CDN: img{1-9}.idealista.com/blur/{variant}/0/{id_path}/{name}.jpg.
The "blur" segment is CDN routing, not an actual blur — images render
normally. Variants we see: WEB_DETAIL-M-L, WEB_DETAIL-L-L, WEB_DETAIL_TOP-L-L.
We normalize to WEB_DETAIL_TOP-L-L for full size.
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

_BASE: Final = "https://www.idealista.com"
_INDEX_TMPL: Final = "/venta-viviendas/{slug}-{provincia}/"
_DETAIL_RX = re.compile(r"/inmueble/(\d+)/?")
_PRICE_RX = re.compile(r"([\d.\s]+)\s*€")
_M2_RX = re.compile(r"\b(\d{1,4})\s*m\s*[²2]", re.I)
_BEDS_RX = re.compile(r"(\d+)\s*hab", re.I)
_BATHS_RX = re.compile(r"(\d+)\s*baño", re.I)

# Map our cities.slug to the Idealista town-slug stem when they diverge,
# AND the provincia stem they pin to. Most towns just use {slug}-{provincia}.
# When our slug differs from Idealista's, set a tuple (idealista_slug, provincia).
_TOWN_OVERRIDES: Final[dict[str, tuple[str, str]]] = {
    # Article-prefixed towns: Idealista strips the article in the URL.
    "l-hospitalet-de-llobregat": ("hospitalet-de-llobregat", "barcelona"),
    "el-prat-de-llobregat":      ("prat-de-llobregat",       "barcelona"),
    "el-vendrell":               ("vendrell",                "tarragona"),
}

# Cities pinned to a specific provincia stem (no slug change).
_PROVINCIA_OF: Final[dict[str, str]] = {
    # Ripollès comarca — all in Girona.
    "ripoll": "girona",
    "campdevanol": "girona",
    "camprodon": "girona",
    "gombren": "girona",
    "les-llosses": "girona",
    "llanars": "girona",
    "mollo": "girona",
    "ogassa": "girona",
    "pardines": "girona",
    "planoles": "girona",
    "queralbs": "girona",
    "ribes-de-freser": "girona",
    "sant-joan-de-les-abadesses": "girona",
    "sant-pau-de-seguries": "girona",
    "setcases": "girona",
    "toses": "girona",
    "vallfogona-de-ripolles": "girona",
    "vilallonga-de-ter": "girona",
    # Major Catalan cities by population.
    "barcelona": "barcelona",
    "terrassa": "barcelona",
    "badalona": "barcelona",
    "sabadell": "barcelona",
    "lleida": "lleida",
    "tarragona": "tarragona",
    "mataro": "barcelona",
    "santa-coloma-de-gramenet": "barcelona",
    "reus": "tarragona",
    "girona": "girona",
    "sant-cugat-del-valles": "barcelona",
    "cornella-de-llobregat": "barcelona",
    "sant-boi-de-llobregat": "barcelona",
    "manresa": "barcelona",
    "rubi": "barcelona",
    "viladecans": "barcelona",
    "vilanova-i-la-geltru": "barcelona",
    "castelldefels": "barcelona",
    "granollers": "barcelona",
    "cerdanyola-del-valles": "barcelona",
    "mollet-del-valles": "barcelona",
    "vic": "barcelona",
    "figueres": "girona",
    "gava": "barcelona",
    "esplugues-de-llobregat": "barcelona",
    "sant-feliu-de-llobregat": "barcelona",
    "igualada": "barcelona",
    "lloret-de-mar": "girona",
    "vilafranca-del-penedes": "barcelona",
    "blanes": "girona",
    "ripollet": "barcelona",
    "sant-adria-de-besos": "barcelona",
    "olot": "girona",
    "montcada-i-reixac": "barcelona",
    "tortosa": "tarragona",
    "sant-joan-despi": "barcelona",
    "cambrils": "tarragona",
    "salt": "girona",
    "barbera-del-valles": "barcelona",
    "sant-pere-de-ribes": "barcelona",
    "sitges": "barcelona",
    "salou": "tarragona",
    "premia-de-mar": "barcelona",
    "sant-vicenc-dels-horts": "barcelona",
    "martorell": "barcelona",
    "pineda-de-mar": "barcelona",
    "sant-andreu-de-la-barca": "barcelona",
}


def _resolve_url_parts(city_slug: str) -> tuple[str, str] | None:
    """Returns (idealista_slug, provincia_stem) for our city_slug, or None."""
    if city_slug in _TOWN_OVERRIDES:
        return _TOWN_OVERRIDES[city_slug]
    provincia = _PROVINCIA_OF.get(city_slug)
    if provincia:
        return city_slug, provincia
    return None


def _strip_query(url: str) -> str:
    p = urlsplit(url)
    return urlunsplit((p.scheme, p.netloc, p.path.rstrip("/") + "/", "", ""))


class IdealistaAdapter(PlatformAdapter):
    name = "idealista"
    source_host = "www.idealista.com"
    source_kind = "major"

    def __init__(self) -> None:
        super().__init__()
        self._fc = FirecrawlClient()

    def close(self) -> None:
        super().close()
        self._fc.close()

    def fetch(self, url: str) -> str:
        html, inner_status = self._fc.fetch_html(url)
        if inner_status >= 400:
            raise RuntimeError(f"idealista inner {inner_status} for {url}")
        return html

    # ── search index ────────────────────────────────────────────────────

    def search_pages(self, city_slug: str) -> Iterator[str]:
        parts = _resolve_url_parts(city_slug)
        if not parts:
            logger.warning("idealista: no provincia mapping for city '%s'", city_slug)
            return
        idealista_slug, provincia = parts
        index_url = urljoin(_BASE, _INDEX_TMPL.format(slug=idealista_slug, provincia=provincia))
        seen: set[str] = set()
        page = 1
        while True:
            url = index_url if page == 1 else f"{index_url}pagina-{page}.htm"
            logger.info("idealista: fetching index %s", url)
            try:
                html = self.fetch(url)
            except Exception as exc:
                logger.info("idealista: index fetch failed at page %d for %s: %s",
                            page, city_slug, exc)
                break
            page_links = self._extract_detail_links(html)
            new = [u for u in page_links if u not in seen]
            if not new:
                logger.info("idealista: no new listings at page %d for %s — stop",
                            page, city_slug)
                break
            for u in new:
                seen.add(u)
                yield u
            if len(page_links) < 10:
                break
            page += 1
            if page > 20:
                logger.warning("idealista: hit safety cap of 20 pages for %s", city_slug)
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

        m = _DETAIL_RX.search(url)
        platform_id = m.group(1) if m else url.rstrip("/").rsplit("/", 1)[-1]

        # Title (`<h1 class="main-info__title-main">`) often includes street address
        title_el = soup.find(class_=re.compile(r"\bmain-info__title-main\b"))
        title = title_el.get_text(" ", strip=True) if title_el else (
            (soup.find("h1") or {"get_text": lambda *a, **k: None}).get_text(" ", strip=True)
            if soup.find("h1") else None
        )

        # Address: extract street from title. Idealista titles follow
        # "{Tipus} en venta en {STREET}[, {NUMBER}]". Anchor to "en venta en"
        # so we don't pick up the leading "en venta".
        address = None
        if title:
            m = re.search(r"\ben\s+venta\s+en\s+(.+?)\s*$", title)
            if m:
                cand = m.group(1).strip()
                if len(cand) > 3:
                    address = cand

        # Price (`.info-data-price`)
        price = None
        price_el = soup.find(class_=re.compile(r"\binfo-data-price\b"))
        if price_el:
            for pm in _PRICE_RX.finditer(price_el.get_text(" ", strip=True)):
                raw = pm.group(1).replace(".", "").replace(" ", "").replace(",", ".")
                try:
                    v = float(raw)
                    if v >= 15_000:
                        price = v
                        break
                except ValueError:
                    continue

        # Features (`.info-features`, `.info-data` block)
        text = soup.get_text(" ", strip=True)
        m2 = beds = baths = None
        if mm := _M2_RX.search(text):
            m2 = float(mm.group(1))
        if mb := _BEDS_RX.search(text):
            beds = int(mb.group(1))
        if mB := _BATHS_RX.search(text):
            baths = int(mB.group(1))

        # Description: `.expandable-content` or meta description
        description = None
        desc_el = soup.find(class_=re.compile(r"comment|description|expandable-content"))
        if desc_el:
            t = desc_el.get_text(" ", strip=True)
            if len(t) > 80:
                description = t
        if description is None:
            meta = soup.find("meta", attrs={"name": "description"})
            if isinstance(meta, Tag):
                v = meta.get("content")
                if isinstance(v, str):
                    description = v.strip() or None

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
        )

    def parse_images(self, html: str) -> list[str]:
        urls = extract_image_urls(html, base_url=_BASE)
        out: list[str] = []
        seen: set[str] = set()
        for u in urls:
            if not re.search(r"img\d?\.idealista\.com/blur/", u):
                continue
            # Normalize size variant to WEB_DETAIL_TOP-L-L (large).
            normalized = re.sub(
                r"/blur/[^/]+/",
                "/blur/WEB_DETAIL_TOP-L-L/",
                u,
            )
            base = normalized.rsplit("/", 1)[-1]
            if base in seen:
                continue
            seen.add(base)
            out.append(normalized)
        return out
