"""Bulk-load Generalitat fftm-v9b6 + qww9-bvhh via PostgREST.

Used when the direct Postgres host is IPv6-only and unroutable.

  uv run python packages/scrapers/scripts/etl_generalitat_rest.py --since 2024
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

_DATA_BASE = "https://analisi.transparenciacatalunya.cat/resource"
_UA = "BruixolaBot/0.1 (+https://bruixola.cat/bot)"


def _load_env() -> tuple[str, str]:
    here = Path(__file__).resolve()
    for parent in [here.parent, *here.parents]:
        if (parent / ".env").is_file():
            load_dotenv(parent / ".env")
            break
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_PUBLISHABLE_KEY"]
    return url, key


def _fetch_all(rid: str, page: int = 5000) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    offset = 0
    with httpx.Client(headers={"User-Agent": _UA}, timeout=30.0) as c:
        while True:
            r = c.get(
                f"{_DATA_BASE}/{rid}.json",
                params={"$limit": page, "$offset": offset, "$order": ":id"},
            )
            r.raise_for_status()
            chunk = r.json()
            out.extend(chunk)
            if len(chunk) < page:
                break
            offset += page
    return out


def _to_int(v: Any) -> int | None:
    if v in (None, ""):
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _to_float(v: Any) -> float | None:
    if v in (None, ""):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ── zones: PATCH cities by name (case-insensitive) ──────────────────────


def load_zones(client: httpx.Client) -> tuple[int, list[str]]:
    rows = _fetch_all("fftm-v9b6")
    print(f"fftm-v9b6: {len(rows)} municipality records", file=sys.stderr)

    updated = 0
    skipped: list[str] = []

    for row in rows:
        name = row.get("municipi")
        codmuni = row.get("codmuni")
        if not name or not codmuni:
            continue
        zmrt = row.get("zona_de_mercat_residencial_tensat") or "NA"
        level = zmrt if zmrt in ("ZMRT 1", "ZMRT 2") else None

        body = {
            "codi_ine": codmuni,
            "zmrt_level": level,
            "ambit_funcional": row.get("ambit_funcional"),
            "area_ptsh": row.get("area_ptsh"),
            "in_zona_tensionada": level is not None,
        }

        # PostgREST: PATCH ?name=eq.<name>  (exact match — Catalan canonical
        # names should align between Generalitat and our cities).
        r = client.patch(
            "/rest/v1/cities",
            params={"name": f"eq.{name}"},
            headers={"Prefer": "return=representation"},
            json=body,
        )
        if r.status_code >= 400:
            print(f"  ✗ {name}: {r.status_code} {r.text[:120]}", file=sys.stderr)
            skipped.append(name)
            continue
        affected = len(r.json())
        if affected == 0:
            skipped.append(name)
        else:
            updated += affected

    print(f"  updated={updated}  not-matched={len(skipped)}", file=sys.stderr)
    return updated, skipped


# ── rent: bulk POST upserts in batches ──────────────────────────────────


def load_rent(client: httpx.Client, *, since_year: int, batch: int = 500) -> int:
    rows = _fetch_all("qww9-bvhh")
    print(f"qww9-bvhh: {len(rows)} total records", file=sys.stderr)

    payload: list[dict[str, Any]] = []
    for row in rows:
        if row.get("ambit_territorial") != "Municipi":
            continue
        year = _to_int(row.get("any"))
        codi = row.get("codi_territorial")
        periode = row.get("periode")
        if not year or year < since_year or not codi or not periode:
            continue
        payload.append(
            {
                "codi_ine": codi,
                "any_": year,
                "periode": periode,
                "habitatges": _to_int(row.get("habitatges")),
                "renda_eur_mo": _to_float(row.get("renda")),
                "tram_preus": row.get("tram_preus"),
            }
        )

    print(f"  filtered to {len(payload)} rows since {since_year}", file=sys.stderr)
    inserted = 0
    for i in range(0, len(payload), batch):
        chunk = payload[i : i + batch]
        r = client.post(
            "/rest/v1/municipal_rent_index",
            params={"on_conflict": "codi_ine,any_,periode"},
            headers={
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            json=chunk,
        )
        if r.status_code >= 400:
            print(f"  ✗ batch {i}: {r.status_code} {r.text[:200]}", file=sys.stderr)
            r.raise_for_status()
        inserted += len(chunk)
        print(f"  · {inserted}/{len(payload)}", file=sys.stderr)
    return inserted


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--since", type=int, default=2024)
    p.add_argument("--zones-only", action="store_true")
    p.add_argument("--rent-only", action="store_true")
    args = p.parse_args()

    url, key = _load_env()
    with httpx.Client(
        base_url=url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        timeout=60.0,
    ) as client:
        t0 = time.time()
        if not args.rent_only:
            load_zones(client)
        if not args.zones_only:
            load_rent(client, since_year=args.since)
        print(f"done in {time.time() - t0:.1f}s", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
