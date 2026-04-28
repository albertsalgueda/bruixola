"""Bulk-load Generalitat HUT registry (t2h3-cgys) into public.hut_licenses
via PostgREST. Same pattern as the rent-index loader.

  uv run python packages/scrapers/scripts/etl_hut_rest.py
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

_DATA_BASE = "https://analisi.transparenciacatalunya.cat/resource"
_UA = "BruixolaBot/0.1 (+https://bruixola.cat/bot)"
_RID = "t2h3-cgys"
_RELEVANT_TYPES = {
    "Habitatges d'ús turístic",
    "Apartaments Turístics",
    "Llars compartides",
}


def _load_env() -> tuple[str, str]:
    here = Path(__file__).resolve()
    for parent in [here.parent, *here.parents]:
        if (parent / ".env").is_file():
            load_dotenv(parent / ".env")
            break
    return os.environ["SUPABASE_URL"], os.environ["SUPABASE_PUBLISHABLE_KEY"]


def _fetch_all(rid: str, where: str | None = None, page: int = 5000) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    offset = 0
    params: dict[str, Any] = {"$limit": page, "$order": ":id"}
    if where:
        params["$where"] = where
    with httpx.Client(headers={"User-Agent": _UA}, timeout=60.0) as c:
        while True:
            r = c.get(f"{_DATA_BASE}/{rid}.json", params={**params, "$offset": offset})
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


def _idescat_to_ine(codi_idescat: str | None) -> str | None:
    """6-digit IDESCAT codes drop the trailing check digit to get the 5-digit
    INE municipal code we use elsewhere (cities.codi_ine).
    Examples: '080193' (Barcelona) -> '08019'."""
    if not codi_idescat or len(codi_idescat) != 6:
        return None
    return codi_idescat[:5]


def main() -> int:
    url, key = _load_env()
    rows = _fetch_all(_RID)
    print(f"fetched {len(rows)} total HUT registry rows", file=sys.stderr)

    payload: list[dict[str, Any]] = []
    type_count: dict[str, int] = {}
    for r in rows:
        t = r.get("tipus_establiment")
        if t not in _RELEVANT_TYPES:
            continue
        type_count[t] = type_count.get(t, 0) + 1

        license_id = r.get("n_mero_inscripci")
        if not license_id:
            continue

        codi_idescat = r.get("codi_municipi_idescat")
        payload.append({
            "license_id": license_id,
            "digit_control": r.get("d_git_de_control"),
            "establishment_type": t,
            "trade_name": r.get("r_tol"),
            "estat": r.get("estat") or "Alta",
            "referencia_cadastral": r.get("referencia_cadastral"),
            "tipus_de_via": r.get("tipus_de_via"),
            "nom_de_la_via": r.get("nom_de_la_via"),
            "numero": r.get("numero"),
            "pis": r.get("pis"),
            "porta": r.get("porta"),
            "escala": r.get("escala"),
            "bloc": r.get("bloc"),
            "postal_code": r.get("codi_postal"),
            "codi_municipi_idescat": codi_idescat,
            "codi_ine": _idescat_to_ine(codi_idescat),
            "municipi": r.get("municipi"),
            "comarca": r.get("comarca"),
            "comarca_codi": r.get("codi_comarca_idescat"),
            "provincia": r.get("prov_ncia"),
            "total_places": _to_int(r.get("total_places")),
            "total_estances": _to_int(r.get("total_estances")),
            "titular_cif": r.get("cif"),
            "titular_nom": r.get("ra_social_del_titular") or r.get("nom_del_titular"),
        })

    print(f"filtered to {len(payload)} HUT-relevant rows: {type_count}", file=sys.stderr)

    with httpx.Client(
        base_url=url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        timeout=120.0,
    ) as client:
        t0 = time.time()
        batch_size = 1000
        for i in range(0, len(payload), batch_size):
            chunk = payload[i : i + batch_size]
            r = client.post(
                "/rest/v1/hut_licenses",
                params={"on_conflict": "license_id"},
                headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
                json=chunk,
            )
            if r.status_code >= 400:
                print(f"batch {i} failed: {r.status_code} {r.text[:300]}", file=sys.stderr)
                r.raise_for_status()
            print(f"  · {min(i + batch_size, len(payload))}/{len(payload)}", file=sys.stderr)
        print(f"done in {time.time() - t0:.1f}s", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
