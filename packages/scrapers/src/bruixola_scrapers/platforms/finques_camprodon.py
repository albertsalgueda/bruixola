"""platforms.finques_camprodon — local immobiliària covering Vall de Camprodon.

`source_kind='local'` adapter. Fills the gap left by pisos.com in Ripollès
(specifically Camprodon, Molló, Vilallonga de Ter, Llanars, Sant Pau de
Segúries, Espinavell, Tregurà, Setcases, Font-Rúbia).

WordPress site running the Houzez real-estate theme. No JS needed: title,
amenities (beds/baths/m²), price, and gallery images are all server-rendered.

Detail URL pattern: https://finquescamprodon.com/property/ref-<id>-<slug>/
The ref-<id> portion is the platform_id.
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

_BASE: Final = "https://finquescamprodon.com"
_INDEX: Final = "/advanced-search/?status=venda"

_PLATFORM_ID_RX = re.compile(r"/property/(ref-\d+(?:-[a-z0-9-]+)?)/?$", re.I)
_PRICE_RX = re.compile(r"([\d.\s]+)\s*€")
_M2_RX = re.compile(r"(\d+)\s*m\s*(?:²|2|<sup>2</sup>)", re.I)
_BEDS_RX = re.compile(r"(\d+)\s*habitaci", re.I)
_BATHS_RX = re.compile(r"(\d+)\s*bany", re.I)
_YEAR_RX = re.compile(r"\b(19|20)\d{2}\b")

# Listings the agency posts on this domain whose URL town slug maps onto an
# existing public.cities.slug. Keep a small lookup; agency lists the slug in
# the URL as plain accent-stripped lowercase.
_TOWN_OVERRIDES: Final[dict[str, str]] = {
    "espinavell": "mollo",            # Espinavell is a hamlet of Molló
    "tregura": "vilallonga-de-ter",   # Tregurà belongs to Vilallonga de Ter
    "fontrubia": "vilallonga-de-ter",
    "font-rubia": "vilallonga-de-ter",
}


def _parse_price_eur(text: str) -> float | None:
    m = _PRICE_RX.search(text)
    if not m:
        return None
    raw = m.group(1).replace(".", "").replace(" ", "").replace(",", ".")
    try:
        v = float(raw)
        return v if v > 1000 else None  # filter rents (e.g. "700 €/mes")
    except ValueError:
        return None


def _slug_from_url(url: str) -> tuple[str, str]:
    """Returns (platform_id, town_hint). E.g.
    https://.../property/ref-1364-espinavell/ → ('ref-1364-espinavell', 'espinavell')
    """
    m = _PLATFORM_ID_RX.search(url.rstrip("/"))
    if not m:
        return url.rsplit("/", 1)[-1], ""
    pid = m.group(1)
    parts = pid.split("-", 2)
    town_hint = parts[2] if len(parts) >= 3 else ""
    return pid, town_hint


class FinquesCamprodonAdapter(PlatformAdapter):
    name = "local"
    source_host = "finquescamprodon.com"
    source_kind = "local"

    def search_pages(self, city_slug: str | None = None) -> Iterator[str]:
        """Yield all sale-listing detail URLs from the agency's index.

        The agency publishes ~50 sale listings on a single index page with no
        pagination — small inventory, single fetch is enough.
        """
        url = urljoin(_BASE, _INDEX)
        logger.info("finques_camprodon: fetching index %s", url)
        try:
            html = self.fetch(url)
        except Exception as exc:
            logger.warning("finques_camprodon: index fetch failed: %s", exc)
            return
        soup = BeautifulSoup(html, "lxml")
        seen: set[str] = set()
        for a in soup.find_all("a", href=re.compile(r"/property/ref-\d+")):
            if not isinstance(a, Tag):
                continue
            href = a["href"]
            if not isinstance(href, str):
                continue
            absolute = urljoin(_BASE, href)
            if absolute in seen:
                continue
            seen.add(absolute)
            # If a city_slug filter was passed, skip URLs whose hint doesn't
            # match. (city_slug arg kept for API parity with pisos.py.)
            if city_slug:
                _, hint = _slug_from_url(absolute)
                resolved = _TOWN_OVERRIDES.get(hint, hint)
                if city_slug != resolved:
                    continue
            yield absolute

    def parse_listing(self, html: str, url: str) -> RawListing:
        soup = BeautifulSoup(html, "lxml")

        platform_id, town_hint = _slug_from_url(url)

        # Title: <h1>
        h1 = soup.find("h1")
        title = h1.get_text(" ", strip=True) if h1 else None

        # Price: .item-price (Houzez canonical)
        price = None
        ip = soup.find(class_=re.compile(r"\bitem-price\b"))
        if ip:
            txt = ip.get_text(" ", strip=True)
            if "consultar" not in txt.lower():
                price = _parse_price_eur(txt)

        # Amenities: ".amenities" → "X Habitacions • Y Banys • Type, Subtype"
        beds = baths = None
        m2 = None
        for el in soup.find_all(class_=re.compile(r"\bamenities\b")):
            txt = el.get_text(" ", strip=True)
            if mb := _BEDS_RX.search(txt):
                beds = int(mb.group(1))
            if mB := _BATHS_RX.search(txt):
                baths = int(mB.group(1))

        # m²: search the whole detail-features block
        feats = soup.find(class_=re.compile(r"property-attributes|detail-info|property-detail"))
        text_blob = feats.get_text(" ", strip=True) if feats else soup.get_text(" ", strip=True)
        if mm := _M2_RX.search(text_blob):
            m2 = float(mm.group(1))

        # Year built: appears under "Construcció" or "Any" labels
        year_built = None
        for label_re in (re.compile(r"construcci[óo]", re.I), re.compile(r"\bany\b", re.I)):
            label_el = soup.find(string=label_re)
            if label_el and label_el.parent:
                row = label_el.parent.find_parent(["li", "div", "tr", "dt", "dd"]) or label_el.parent
                row_txt = row.get_text(" ", strip=True)
                if my := _YEAR_RX.search(row_txt):
                    year_built = int(my.group(0))
                    break

        # Description: look for content area
        description = None
        desc_el = soup.find(class_=re.compile(r"property-content|description__content|property-description"))
        if desc_el:
            description = desc_el.get_text(" ", strip=True)
        else:
            mdesc = soup.find("meta", attrs={"name": "description"})
            if isinstance(mdesc, Tag):
                v = mdesc.get("content")
                if isinstance(v, str):
                    description = v.strip() or None

        # Address: town hint from URL slug, prettified
        address = town_hint.replace("-", " ").title() if town_hint else None

        return RawListing(
            platform=self.name,                   # 'local'
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
        urls = extract_image_urls(html, base_url=_BASE)
        # Filter to only finquescamprodon.com WP-content images, dedup by basename.
        out: list[str] = []
        seen: set[str] = set()
        for u in urls:
            if "finquescamprodon.com/wp-content/uploads/" not in u:
                continue
            # Strip thumbnail size suffix like "-1024x771" to get original
            base = re.sub(r"-\d+x\d+(\.[a-z]+)$", r"\1", u)
            key = base.rsplit("/", 1)[-1]
            if key in seen:
                continue
            seen.add(key)
            out.append(base)
        return out

    @staticmethod
    def town_for_url(url: str) -> str | None:
        """Map a detail URL → public.cities.slug. Returns None if the hint
        doesn't resolve."""
        _, hint = _slug_from_url(url)
        if not hint:
            return None
        return _TOWN_OVERRIDES.get(hint, hint)
