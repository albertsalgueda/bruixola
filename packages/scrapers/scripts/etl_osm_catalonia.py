"""Pull OSM amenity layers for Catalonia via Overpass and upsert to Supabase.

Five queries (verified by research agent):
  - Hospitals (amenity=hospital, ~11 features)
  - Universities (amenity=university, ~401)
  - Transit stops (railway=station|halt|tram_stop + subway, ~3,029)
  - Schools (amenity=school, ~3,027)
  - Beaches (natural=beach, ~718, with full polygon geometry)

ODbL — attribution required wherever rendered: "© OpenStreetMap contributors".

  uv run python packages/scrapers/scripts/etl_osm_catalonia.py
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

_OVERPASS = "https://overpass-api.de/api/interpreter"
_UA = "BruixolaBot/0.1 (+https://bruixola.cat/bot)"

QUERIES = {
    "hospital": ("""
[out:json][timeout:60];
area["ISO3166-2"="ES-CT"]->.cat;
( node["amenity"="hospital"](area.cat);
  way["amenity"="hospital"](area.cat);
  relation["amenity"="hospital"](area.cat); );
out center tags;
""", "out center tags"),
    "university": ("""
[out:json][timeout:60];
area["ISO3166-2"="ES-CT"]->.cat;
( node["amenity"="university"](area.cat);
  way["amenity"="university"](area.cat);
  relation["amenity"="university"](area.cat); );
out center tags;
""", "out center tags"),
    "transit": ("""
[out:json][timeout:60];
area["ISO3166-2"="ES-CT"]->.cat;
( node["railway"~"^(station|halt|tram_stop)$"](area.cat);
  node["station"="subway"](area.cat); );
out;
""", "out"),
    "school": ("""
[out:json][timeout:90];
area["ISO3166-2"="ES-CT"]->.cat;
( node["amenity"="school"](area.cat);
  way["amenity"="school"](area.cat); );
out center tags;
""", "out center tags"),
    "beach": ("""
[out:json][timeout:120];
area["ISO3166-2"="ES-CT"]->.cat;
( way["natural"="beach"](area.cat);
  relation["natural"="beach"](area.cat); );
out center tags;
""", "out center tags"),
}


def _load_env() -> tuple[str, str]:
    here = Path(__file__).resolve()
    for parent in [here.parent, *here.parents]:
        if (parent / ".env").is_file():
            load_dotenv(parent / ".env")
            break
    return os.environ["SUPABASE_URL"], os.environ["SUPABASE_PUBLISHABLE_KEY"]


def _normalize_kind(layer: str, tags: dict[str, Any]) -> str | None:
    """Map a feature's tags to our `osm_amenities.kind` enum value."""
    if layer in ("hospital", "university", "school", "beach"):
        return layer
    if layer == "transit":
        rw = tags.get("railway")
        if tags.get("station") == "subway":
            return "metro_station"
        if rw == "tram_stop":
            return "tram_stop"
        if rw in ("station", "halt"):
            return "train_station"
        return "train_station"  # safe default
    return None


def fetch(layer: str, max_retries: int = 3) -> list[dict[str, Any]]:
    q, _ = QUERIES[layer]
    print(f"  → overpass {layer} …", file=sys.stderr)
    backoff = 30
    for attempt in range(max_retries):
        r = httpx.post(_OVERPASS, headers={"User-Agent": _UA}, data={"data": q.strip()}, timeout=180)
        if r.status_code == 429:
            print(f"  · 429, sleeping {backoff}s (attempt {attempt + 1}/{max_retries})", file=sys.stderr)
            time.sleep(backoff)
            backoff *= 2
            continue
        if r.status_code != 200:
            print(f"  ! status {r.status_code}: {r.text[:200]}", file=sys.stderr)
            r.raise_for_status()
        elements = r.json().get("elements", [])
        print(f"  · {layer}: {len(elements)} features", file=sys.stderr)
        return elements
    raise RuntimeError(f"overpass {layer}: hit 429 retry cap")


def to_payload(layer: str, elements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for el in elements:
        osm_type = el.get("type")  # 'node'/'way'/'relation'
        osm_id = el.get("id")
        tags = el.get("tags") or {}
        if osm_type == "node":
            lat = el.get("lat"); lng = el.get("lon")
        else:
            center = el.get("center") or {}
            lat = center.get("lat"); lng = center.get("lon")
        if lat is None or lng is None:
            continue
        kind = _normalize_kind(layer, tags)
        if kind is None:
            continue
        out.append({
            "osm_id": osm_id,
            "osm_type": osm_type,
            "kind": kind,
            "name": tags.get("name") or tags.get("name:ca") or tags.get("name:es"),
            "lat": float(lat),
            "lng": float(lng),
            "tags": tags,
        })
    return out


def upsert(rest: httpx.Client, payload: list[dict[str, Any]], batch: int = 500) -> int:
    n = 0
    for i in range(0, len(payload), batch):
        chunk = payload[i : i + batch]
        r = rest.post(
            "/rest/v1/osm_amenities",
            params={"on_conflict": "osm_id,osm_type"},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            json=chunk,
        )
        if r.status_code >= 400:
            print(f"    ! batch {i}: {r.status_code} {r.text[:200]}", file=sys.stderr)
            r.raise_for_status()
        n += len(chunk)
    return n


def main() -> int:
    url, key = _load_env()
    rest = httpx.Client(
        base_url=url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        timeout=120.0,
    )
    t0 = time.time()
    totals: dict[str, int] = {}
    layers_to_run = sys.argv[1:] if len(sys.argv) > 1 else list(QUERIES.keys())
    try:
        for layer in layers_to_run:
            if layer not in QUERIES:
                print(f"  ! unknown layer '{layer}', skip", file=sys.stderr)
                continue
            t1 = time.time()
            elements = fetch(layer)
            payload = to_payload(layer, elements)
            n = upsert(rest, payload)
            totals[layer] = n
            print(f"  ✓ {layer}: upserted {n} in {time.time() - t1:.1f}s", file=sys.stderr)
            time.sleep(20.0)  # polite gap to avoid Overpass 429
    finally:
        rest.close()
    print(f"\nDONE · {totals} · {time.time() - t0:.1f}s total", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
