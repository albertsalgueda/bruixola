"""Shared HTML → image URL extractor.

Strategy (in order of preference):
  1. JSON-LD `image[]` array on the page (Schema.org RealEstateListing).
  2. `<meta property="og:image">` and `og:image:secure_url`.
  3. Largest URL from any `<img>`/`<source>` `srcset`.
  4. Plain `<img src>` whose URL hosts an obvious photo path.

Returns deduped, ordered list. position 0 = primary.
"""

from __future__ import annotations

import json
import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

_SRCSET_DESC = re.compile(r"\s+(\d+)(w|x)\s*$")


def _largest_from_srcset(srcset: str) -> str | None:
    """Pick the highest-density / highest-width URL from a srcset string."""
    candidates: list[tuple[int, str]] = []
    for part in srcset.split(","):
        part = part.strip()
        if not part:
            continue
        bits = part.rsplit(" ", 1)
        if len(bits) == 2:
            url, descriptor = bits
            m = _SRCSET_DESC.search(" " + descriptor)
            weight = int(m.group(1)) if m else 0
            candidates.append((weight, url.strip()))
        else:
            candidates.append((0, bits[0].strip()))
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1]


def _from_jsonld(soup: BeautifulSoup) -> list[str]:
    out: list[str] = []
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        try:
            payload = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        # JSON-LD can be a single object, a list, or have @graph.
        items = payload if isinstance(payload, list) else [payload]
        for item in items:
            if not isinstance(item, dict):
                continue
            for sub in item.get("@graph", [item]):
                if not isinstance(sub, dict):
                    continue
                img = sub.get("image")
                if isinstance(img, str):
                    out.append(img)
                elif isinstance(img, list):
                    for entry in img:
                        if isinstance(entry, str):
                            out.append(entry)
                        elif isinstance(entry, dict) and "url" in entry:
                            out.append(entry["url"])
                elif isinstance(img, dict) and "url" in img:
                    out.append(img["url"])
    return out


def _from_og(soup: BeautifulSoup) -> list[str]:
    out: list[str] = []
    for meta in soup.find_all("meta"):
        if not isinstance(meta, Tag):
            continue
        prop = (meta.get("property") or meta.get("name") or "").lower()
        if prop in ("og:image", "og:image:secure_url", "twitter:image"):
            url = meta.get("content")
            if isinstance(url, str):
                out.append(url)
    return out


def _from_imgs(soup: BeautifulSoup) -> list[str]:
    out: list[str] = []
    for tag in soup.find_all(["img", "source"]):
        if not isinstance(tag, Tag):
            continue
        srcset = tag.get("srcset") or tag.get("data-srcset")
        if isinstance(srcset, str):
            best = _largest_from_srcset(srcset)
            if best:
                out.append(best)
                continue
        for attr in ("data-src", "data-original", "src"):
            val = tag.get(attr)
            if isinstance(val, str) and val.strip():
                out.append(val.strip())
                break
    return out


def extract_image_urls(html: str, base_url: str | None = None) -> list[str]:
    """Return ordered, deduped, absolute image URLs from a listing detail page."""
    soup = BeautifulSoup(html, "lxml")
    raw = _from_jsonld(soup) + _from_og(soup) + _from_imgs(soup)
    seen: set[str] = set()
    out: list[str] = []
    for url in raw:
        if not url or url.startswith("data:"):
            continue
        # Strip srcset noise that sometimes leaks through.
        url = url.split(" ")[0].strip()
        if not url:
            continue
        absolute = urljoin(base_url, url) if base_url else url
        if absolute in seen:
            continue
        # Filter obvious non-photo assets.
        lowered = absolute.lower()
        if any(token in lowered for token in ("/icon", "/logo", "/sprite", ".svg")):
            continue
        seen.add(absolute)
        out.append(absolute)
    return out
