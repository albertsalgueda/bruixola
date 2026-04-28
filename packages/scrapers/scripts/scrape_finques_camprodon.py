"""Scrape Finques Camprodon and write to Supabase via REST.

Source-kind 'local' adapter — fills the Ripollès gap left by pisos.com
(Camprodon, Molló, Vilallonga de Ter, Llanars, Sant Pau de Segúries,
Espinavell→Molló, Tregurà→Vilallonga de Ter).

  uv run python packages/scrapers/scripts/scrape_finques_camprodon.py
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

from bruixola_scrapers.platforms import get_adapter
from bruixola_scrapers.platforms.finques_camprodon import FinquesCamprodonAdapter


def _load_env() -> tuple[str, str]:
    here = Path(__file__).resolve()
    for parent in [here.parent, *here.parents]:
        if (parent / ".env").is_file():
            load_dotenv(parent / ".env")
            break
    return os.environ["SUPABASE_URL"], os.environ["SUPABASE_PUBLISHABLE_KEY"]


def main() -> int:
    url, key = _load_env()
    rest = httpx.Client(
        base_url=url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        timeout=60.0,
    )

    # Pull current city slugs to validate town_for_url resolutions.
    r = rest.get("/rest/v1/cities", params={"select": "slug"})
    r.raise_for_status()
    valid_slugs = {c["slug"] for c in r.json()}

    # Open a crawl_run.
    r = rest.post(
        "/rest/v1/crawl_runs",
        params={"select": "id"},
        headers={"Prefer": "return=representation"},
        json={
            "platform": "local",
            "source_host": "finquescamprodon.com",
            "status": "running",
            "notes": "v1 finques_camprodon adapter (Ripollès gap closer)",
        },
    )
    r.raise_for_status()
    crawl_id = r.json()[0]["id"]
    print(f"opened crawl {crawl_id}", file=sys.stderr)

    adapter = get_adapter("finques_camprodon")
    urls = list(adapter.search_pages())
    print(f"index returned {len(urls)} listing URLs", file=sys.stderr)

    written = 0
    skipped_no_city = 0
    failed = 0
    t0 = time.time()
    try:
        for u in urls:
            try:
                html = adapter.fetch(u)
                listing = adapter.parse_listing(html, u)
                photos = adapter.parse_images(html)
                listing.photos = photos
            except Exception as exc:
                print(f"  ! parse failed {u}: {exc}", file=sys.stderr)
                failed += 1
                continue

            slug = FinquesCamprodonAdapter.town_for_url(u)
            if not slug or slug not in valid_slugs:
                skipped_no_city += 1
                print(f"  - skip {listing.bruixola_id} (city '{slug}' not in cities table)", file=sys.stderr)
                continue
            listing.city_slug = slug

            payload = {
                "id": listing.bruixola_id,
                "platform": listing.platform,
                "platform_id": listing.platform_id,
                "url": listing.url,
                "title": listing.title,
                "description": listing.description,
                "city_slug": listing.city_slug,
                "address": listing.address,
                "price_eur": listing.price_eur,
                "m2": listing.m2,
                "beds": listing.beds,
                "baths": listing.baths,
                "year_built": listing.year_built,
                "photos": listing.photos or [],
                "source_kind": listing.source_kind,
                "source_host": listing.source_host,
                "crawl_id": crawl_id,
                "removed_at": None,
            }
            r2 = rest.post(
                "/rest/v1/listings",
                params={"on_conflict": "id"},
                headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
                json=payload,
            )
            if r2.status_code >= 400:
                print(f"  ! upsert {listing.bruixola_id} failed: {r2.status_code} {r2.text[:200]}", file=sys.stderr)
                failed += 1
                continue
            written += 1
            print(f"  ✓ {listing.bruixola_id}  {slug:25s}  €{int(listing.price_eur or 0):>9,}  "
                  f"m²={listing.m2 or '-'}  photos={len(listing.photos)}", file=sys.stderr)
    finally:
        adapter.close()
        rest.patch(
            "/rest/v1/crawl_runs",
            params={"id": f"eq.{crawl_id}"},
            json={
                "status": "ok" if failed == 0 else "partial",
                "listings_seen": written,
                "pages_fetched": len(urls),
                "error_count": failed,
            },
        )
        rest.close()

    print(f"\nDONE · written={written} skipped_no_city={skipped_no_city} failed={failed} "
          f"time={time.time() - t0:.1f}s", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
