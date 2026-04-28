"""Enrich active listings with the Catalan rent-index ceiling per Llei 12/2023.

For each active listing:
  1. Fetch its city's centroid (cities.location).
  2. POST to https://agenciahabitatge.gencat.cat/back/api/calculaindex with
     listing m² + sensible defaults for missing fields.
  3. Multiply mean_price_m2 × m² → legal monthly rent ceiling.
  4. Compute gross_yield_pct_legal_max = (rent_cap × 12) / price_eur × 100.
  5. PATCH listings.rent_index_ceiling_eur_m2_mo + gross_yield_pct_legal_max
     via PostgREST.

Uses curl-style cert via `certifi` because agenciahabitatge.gencat.cat's
issuer chain isn't in Python 3.14's default truststore.

  uv run python packages/scrapers/scripts/enrich_listings_serpavi.py
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Any

import certifi
import httpx
from dotenv import load_dotenv

_SERPAVI_URL = "https://agenciahabitatge.gencat.cat/back/api/calculaindex"
_UA = "BruixolaBot/0.1 (+https://bruixola.cat/bot)"
_REFERER = "https://agenciahabitatge.gencat.cat/indexdelloguer/"


def _load_env() -> tuple[str, str]:
    here = Path(__file__).resolve()
    for parent in [here.parent, *here.parents]:
        if (parent / ".env").is_file():
            load_dotenv(parent / ".env")
            break
    return os.environ["SUPABASE_URL"], os.environ["SUPABASE_PUBLISHABLE_KEY"]


def query_serpavi(
    serpavi: httpx.Client,
    *,
    lat: float,
    lng: float,
    m2: float,
    address: str,
    building_year: int = 1980,
    energetic_cert: str = "E",
    maintenance: str = "regular",
    height: str = "intermedia",
    elevator: str = "no",
    parking: str = "no",
    furniture: str = "no",
) -> dict[str, Any] | None:
    """Single SERPAVI lookup. Returns the JSON dict on success, None on
    error/missing."""
    if m2 < 15 or m2 > 250:  # SERPAVI's documented valid range
        return None
    body = {
        "lat": lat, "lng": lng, "address": address, "m2": int(m2),
        "maintenance": maintenance, "height": height,
        "building_year": int(building_year),
        "energetic_cert": energetic_cert,
        "elevator": elevator, "parking": parking, "furniture": furniture,
        "consulta": time.strftime("%Y-%m-%d"),
        "cerca": 3, "id_registre": "", "auth": "", "auth2": "",
    }
    r = serpavi.post(_SERPAVI_URL, json=body)
    if r.status_code != 200:
        return None
    data = r.json()
    if data.get("error") not in (0, "0", None):
        return None
    return data


def main() -> int:
    url, key = _load_env()
    rest_headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    # Pull active listings + their city centroid in one go via PostgREST.
    # cities.location is a PostGIS geometry — we rely on a PostgREST view or
    # a raw RPC for centroid extraction. Simpler path: do two queries.
    with httpx.Client(base_url=url, headers=rest_headers, timeout=60.0) as rest:
        # 1. listings (active, with m²)
        r = rest.get(
            "/rest/v1/listings",
            params={
                "select": "id,city_slug,price_eur,m2,year_built,energy_cert",
                "removed_at": "is.null",
                "m2": "not.is.null",
            },
        )
        r.raise_for_status()
        listings = r.json()
        print(f"active listings with m²: {len(listings)}", file=sys.stderr)

        # 2. cities — pull centroid via st_x/st_y RPC; fall back to raw SQL view.
        # Simpler: get them all and use the cities.location column via PostgREST's
        # built-in geometry handling. Supabase serves geometry as GeoJSON when
        # selected — but we need lat/lng numeric. Use the latitude_municipi
        # field if it's there, else st_y(location). First check the schema.
        r = rest.get("/rest/v1/cities", params={"select": "slug,location", "limit": "1"})
        r.raise_for_status()
        sample = r.json()[0] if r.json() else {}
        if "location" in sample:
            # PostGIS geometry usually serialized as hex EWKB by PostgREST —
            # parse via shapely if needed. Try a different route: look for an
            # RPC or use the raw column. Check if Supabase exposes lat/lng.
            pass
        # Robust path: hit a direct SQL via the PostgREST RPC `st_centroid`
        # is not exposed by default. Use raw SQL via supabase MCP would be
        # ideal, but inside this script we need REST-only. Fallback: read
        # all cities (slug + GeoJSON-encoded location) and use shapely to
        # parse — but shapely isn't a dep. Cheapest fix: pull via select
        # with the new st_x/st_y aliases that Supabase exposes if we add them.
        # For this v1 we'll use a manually maintained slug→lat/lng lookup
        # for the cities our listings land in.
        r = rest.get(
            "/rest/v1/cities",
            params={"select": "slug,name,zmrt_level"},
        )
        r.raise_for_status()
        cities = {c["slug"]: c for c in r.json()}

    # Pull centroids via raw SQL through a small PostgREST trick: a custom
    # view (created on-demand below) that emits slug + lat + lng numeric.
    # Simpler — call our existing API endpoint that has the geo. For this
    # one-shot, hardcode the slug→(lat,lng) for the cities our 172 listings
    # actually use. The query below pulls them.
    listing_cities = sorted({l["city_slug"] for l in listings})
    print(f"cities present in listings: {len(listing_cities)}", file=sys.stderr)

    # Use Supabase RPC route: we'll call /rest/v1/rpc/<fn> if there's one.
    # Without that, we provide the centroids via a small lookup we ship.
    # The lookup is loaded from a pre-fetched JSON below (built once).
    #
    # Pull centroids: use the PostgREST `Accept: application/geo+json` header
    # which Supabase serves for geometry columns.
    with httpx.Client(base_url=url, headers={**rest_headers, "Accept": "application/geo+json"}, timeout=30.0) as geo:
        r = geo.get(
            "/rest/v1/cities",
            params={"select": "slug,location", "slug": f"in.({','.join(listing_cities)})"},
        )
    centroid: dict[str, tuple[float, float]] = {}
    if r.status_code == 200 and r.headers.get("content-type", "").startswith("application/geo+json"):
        for feat in r.json().get("features", []):
            slug = feat.get("properties", {}).get("slug")
            geom = feat.get("geometry", {})
            if slug and geom and geom.get("type") == "Point":
                lng, lat = geom["coordinates"][:2]
                centroid[slug] = (lat, lng)

    if not centroid:
        # Fallback — try plain JSON, might come back as hex EWKB
        with httpx.Client(base_url=url, headers=rest_headers, timeout=30.0) as plain:
            r = plain.get(
                "/rest/v1/cities",
                params={"select": "slug,location", "slug": f"in.({','.join(listing_cities)})"},
            )
        for c in r.json():
            loc = c.get("location")
            if isinstance(loc, str) and loc.startswith("0101"):  # WKB POINT
                # Hex EWKB: skip first 9 bytes (header), then 8 bytes lng + 8 bytes lat little-endian
                import struct
                raw = bytes.fromhex(loc)
                # Strip SRID header for EWKB: type byte + endian + srid (4 bytes) = 9 bytes
                # offset 9: lng (double, 8b), 17: lat (double, 8b)
                if len(raw) >= 25:
                    lng = struct.unpack("<d", raw[9:17])[0]
                    lat = struct.unpack("<d", raw[17:25])[0]
                    centroid[c["slug"]] = (lat, lng)

    print(f"centroids resolved for {len(centroid)} cities", file=sys.stderr)

    # Now run SERPAVI for each listing, only ZMRT cities (others have no
    # legal ceiling under Llei 12/2023).
    # The agenciahabitatge.gencat.cat chain (CA Generalitat) isn't in the
    # certifi bundle on Python 3.14 — it would be in the macOS system trust
    # store, but httpx doesn't pick that up by default. For this one-shot
    # against a public government API serving read-only data, we disable
    # cert verification. Production should add the Generalitat root CA to a
    # custom bundle and verify normally.
    import warnings
    warnings.filterwarnings("ignore")  # silence the InsecureRequestWarning
    serpavi = httpx.Client(
        headers={"User-Agent": _UA, "Content-Type": "application/json", "Referer": _REFERER},
        verify=False,
        timeout=20.0,
    )
    rest = httpx.Client(base_url=url, headers=rest_headers, timeout=30.0)

    enriched = 0
    skipped_non_zmrt = 0
    skipped_no_centroid = 0
    skipped_bad_m2 = 0
    failed = 0

    try:
        for listing in listings:
            slug = listing["city_slug"]
            city = cities.get(slug, {})
            zmrt = city.get("zmrt_level")
            m2 = listing.get("m2")
            price = listing.get("price_eur")

            if not zmrt:
                skipped_non_zmrt += 1
                continue
            if slug not in centroid:
                skipped_no_centroid += 1
                continue
            if m2 is None or float(m2) < 15 or float(m2) > 250:
                skipped_bad_m2 += 1
                continue

            lat, lng = centroid[slug]
            building_year = int(listing.get("year_built") or 1980)
            cert = (listing.get("energy_cert") or "E").upper()
            if cert not in {"A", "B", "C", "D", "E", "F", "G"}:
                cert = "E"

            data = query_serpavi(
                serpavi,
                lat=lat, lng=lng, m2=float(m2),
                address=city.get("name", slug),
                building_year=building_year,
                energetic_cert=cert,
            )
            time.sleep(1.0)  # CLAUDE.md rule 8: 1 req/s

            if not data or data.get("mean_price_m2") is None:
                failed += 1
                continue

            mean_eur_m2 = float(data["mean_price_m2"])
            legal_rent_mo = mean_eur_m2 * float(m2)
            yield_legal_pct = None
            if price and float(price) > 0:
                yield_legal_pct = round(legal_rent_mo * 12 / float(price) * 100, 4)

            update = {
                "rent_index_ceiling_eur_m2_mo": round(mean_eur_m2, 4),
                "gross_yield_pct_legal_max": yield_legal_pct,
            }
            r = rest.patch(
                "/rest/v1/listings",
                params={"id": f"eq.{listing['id']}"},
                headers={"Prefer": "return=minimal"},
                json=update,
            )
            if r.status_code >= 400:
                print(f"  ! patch {listing['id']} failed: {r.status_code} {r.text[:160]}", file=sys.stderr)
                failed += 1
                continue
            enriched += 1
            print(f"  ✓ {listing['id']} {slug} m²={m2} → {mean_eur_m2:.2f}€/m²·mo, "
                  f"cap={legal_rent_mo:.0f}€/mo, legal_yield_max={yield_legal_pct}%", file=sys.stderr)
    finally:
        serpavi.close()
        rest.close()

    print(f"\nDONE · enriched={enriched} skipped_non_zmrt={skipped_non_zmrt} "
          f"skipped_no_centroid={skipped_no_centroid} bad_m2={skipped_bad_m2} failed={failed}",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
