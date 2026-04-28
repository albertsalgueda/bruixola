"""One-shot dump: fetch Generalitat fftm-v9b6 + qww9-bvhh and emit SQL upserts.

Used when the direct Postgres host is IPv6-only and unreachable; the SQL
output is then executed via the Supabase MCP. Once production scraper has
DATABASE_URL on the pooler or SUPABASE_SERVICE_ROLE_KEY set, the proper
`bruixola_scrapers.etl.generalitat` CLI does the same thing in one step.

Usage:
    uv run python packages/scrapers/scripts/etl_generalitat_emit_sql.py \
        --since 2024 \
        > /tmp/generalitat.sql
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

import httpx

_BASE = "https://analisi.transparenciacatalunya.cat/resource"
_UA = "BruixolaBot/0.1 (+https://bruixola.cat/bot)"


def _fetch_all(rid: str, page_size: int = 5000) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    offset = 0
    with httpx.Client(headers={"User-Agent": _UA}, timeout=30.0) as c:
        while True:
            r = c.get(
                f"{_BASE}/{rid}.json",
                params={"$limit": page_size, "$offset": offset, "$order": ":id"},
            )
            r.raise_for_status()
            page = r.json()
            if not page:
                break
            out.extend(page)
            if len(page) < page_size:
                break
            offset += page_size
    return out


def _q(s: str | None) -> str:
    if s is None:
        return "null"
    tag = "gx0"
    while f"${tag}$" in s:
        tag += "x"
    return f"$_{tag}_${s}$_{tag}_$"


def _i(v: Any) -> str:
    if v is None or v == "":
        return "null"
    try:
        return str(int(float(v)))
    except (TypeError, ValueError):
        return "null"


def _f(v: Any) -> str:
    if v is None or v == "":
        return "null"
    try:
        return str(float(v))
    except (TypeError, ValueError):
        return "null"


def emit_zones() -> int:
    rows = _fetch_all("fftm-v9b6")
    print(f"-- ── fftm-v9b6: {len(rows)} municipalities ──", file=sys.stderr)
    n = 0
    for row in rows:
        municipi = row.get("municipi")
        codmuni = row.get("codmuni")
        if not municipi or not codmuni:
            continue
        zmrt = row.get("zona_de_mercat_residencial_tensat") or "NA"
        level = zmrt if zmrt in ("ZMRT 1", "ZMRT 2") else None
        in_zt = "true" if level else "false"
        print(
            f"update public.cities set "
            f"codi_ine = coalesce(codi_ine, {_q(codmuni)}), "
            f"zmrt_level = {_q(level)}, "
            f"ambit_funcional = {_q(row.get('ambit_funcional'))}, "
            f"area_ptsh = {_q(row.get('area_ptsh'))}, "
            f"in_zona_tensionada = {in_zt} "
            f"where lower(name) = lower({_q(municipi)}) or codi_ine = {_q(codmuni)};"
        )
        n += 1
    return n


def emit_rent(since_year: int) -> int:
    rows = _fetch_all("qww9-bvhh")
    print(f"-- ── qww9-bvhh: {len(rows)} total rows ──", file=sys.stderr)
    n = 0
    for row in rows:
        if row.get("ambit_territorial") != "Municipi":
            continue
        any_raw = row.get("any")
        try:
            year = int(float(any_raw)) if any_raw not in (None, "") else None
        except (TypeError, ValueError):
            year = None
        if year is None or year < since_year:
            continue
        codi = row.get("codi_territorial")
        periode = row.get("periode")
        if not codi or not periode:
            continue
        print(
            f"insert into public.municipal_rent_index "
            f"(codi_ine, any_, periode, habitatges, renda_eur_mo, tram_preus) "
            f"values ({_q(codi)}, {year}, {_q(periode)}, {_i(row.get('habitatges'))}, "
            f"{_f(row.get('renda'))}, {_q(row.get('tram_preus'))}) "
            f"on conflict (codi_ine, any_, periode) do update set "
            f"habitatges=excluded.habitatges, "
            f"renda_eur_mo=excluded.renda_eur_mo, "
            f"tram_preus=excluded.tram_preus, "
            f"loaded_at=now();"
        )
        n += 1
    return n


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--since", type=int, default=2024, help="Min year for rent rows.")
    p.add_argument("--zones", action="store_true", help="Only emit zones updates.")
    p.add_argument("--rent", action="store_true", help="Only emit rent upserts.")
    args = p.parse_args()

    do_zones = args.zones or not args.rent
    do_rent = args.rent or not args.zones

    nz = emit_zones() if do_zones else 0
    nr = emit_rent(args.since) if do_rent else 0
    print(f"DONE · zones={nz} rent={nr}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
