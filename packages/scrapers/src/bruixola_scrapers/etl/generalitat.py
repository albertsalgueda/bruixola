"""etl.generalitat — load Generalitat de Catalunya open-data feeds.

Datasets:
  - fftm-v9b6 → "Àrees de referència en matèria de política d'habitatge"
    Updates public.cities with codi_ine, zmrt_level, ambit_funcional,
    area_ptsh, in_zona_tensionada (true when zmrt_level is set).
    Also fixes lat/lng for cities seeded with approximate coords.

  - qww9-bvhh → "Preu mitjà del lloguer d'habitatges per municipi"
    Loads historical rent prices into public.municipal_rent_index.

Run via:  uv run bruixola-etl-generalitat
"""

from __future__ import annotations

import logging
import sys
from typing import Any

import httpx
import typer
from rich.console import Console

from ..storage.supabase import SupabaseStore

logger = logging.getLogger("bruixola.etl.generalitat")
console = Console()
app = typer.Typer(help="Generalitat open-data ETL.")

_BASE = "https://analisi.transparenciacatalunya.cat/resource"
_UA = "BruixolaBot/0.1 (+https://bruixola.cat/bot)"


def _fetch_all(resource_id: str, *, page_size: int = 5000) -> list[dict[str, Any]]:
    """Page through Socrata's /resource/<id>.json endpoint until exhausted."""
    out: list[dict[str, Any]] = []
    offset = 0
    with httpx.Client(headers={"User-Agent": _UA}, timeout=30.0) as client:
        while True:
            r = client.get(
                f"{_BASE}/{resource_id}.json",
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


def _to_int(v: Any) -> int | None:
    if v is None or v == "":
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _to_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ── fftm-v9b6: zona tensionada + reference area ─────────────────────────


@app.command("zones")
def load_zones() -> None:
    """Load fftm-v9b6 → update cities with zmrt_level, codi_ine, etc.

    Matches our cities by name (lowercased, trimmed) since codi_ine is empty
    on the first run. After this loads, codi_ine is populated and future runs
    can join on it cleanly.
    """
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    rows = _fetch_all("fftm-v9b6")
    console.print(f"[bold]fetched[/bold] {len(rows)} municipality records from fftm-v9b6")

    store = SupabaseStore.from_env()  # Direct PG required for cross-table updates.
    updated = 0
    skipped: list[str] = []

    with store._conn.cursor() as cur:
        for row in rows:
            municipi = row.get("municipi")
            codmuni = row.get("codmuni")
            if not municipi or not codmuni:
                continue

            zmrt_raw = row.get("zona_de_mercat_residencial_tensat") or "NA"
            zmrt_level = zmrt_raw if zmrt_raw in ("ZMRT 1", "ZMRT 2") else None
            in_zt = zmrt_level is not None

            cur.execute(
                """
                update public.cities
                   set codi_ine        = coalesce(codi_ine, %s),
                       zmrt_level      = %s,
                       ambit_funcional = %s,
                       area_ptsh       = %s,
                       in_zona_tensionada = %s
                 where lower(name) = lower(%s)
                    or codi_ine = %s
                """,
                (
                    codmuni,
                    zmrt_level,
                    row.get("ambit_funcional"),
                    row.get("area_ptsh"),
                    in_zt,
                    municipi,
                    codmuni,
                ),
            )
            if cur.rowcount > 0:
                updated += 1
            else:
                skipped.append(municipi)

    console.print(
        f"[green]✓[/green] updated {updated} cities  "
        f"[yellow]·[/yellow] {len(skipped)} not found in our cities table"
    )
    if skipped[:5]:
        console.print(f"  examples skipped: {', '.join(skipped[:5])} …")


# ── qww9-bvhh: rent prices per municipality + period ───────────────────


@app.command("rent")
def load_rent(
    since_year: int = typer.Option(2023, "--since", help="Min year to import."),
) -> None:
    """Load qww9-bvhh → upsert into municipal_rent_index.

    Filters to ambit_territorial = 'Municipi' (skips comarca/provincia rolls).
    Upserts on (codi_ine, any, periode).
    """
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    rows = _fetch_all("qww9-bvhh")
    console.print(f"[bold]fetched[/bold] {len(rows)} rent records from qww9-bvhh")

    store = SupabaseStore.from_env()
    inserted = 0

    with store._conn.cursor() as cur:
        for row in rows:
            if row.get("ambit_territorial") != "Municipi":
                continue
            year = _to_int(row.get("any"))
            if year is None or year < since_year:
                continue
            codi_ine = row.get("codi_territorial")
            periode = row.get("periode")
            if not codi_ine or not periode:
                continue

            cur.execute(
                """
                insert into public.municipal_rent_index (
                  codi_ine, any_, periode, habitatges, renda_eur_mo, tram_preus
                ) values (%s, %s, %s, %s, %s, %s)
                on conflict (codi_ine, any_, periode) do update set
                  habitatges    = excluded.habitatges,
                  renda_eur_mo  = excluded.renda_eur_mo,
                  tram_preus    = excluded.tram_preus,
                  loaded_at     = now()
                """,
                (
                    codi_ine,
                    year,
                    periode,
                    _to_int(row.get("habitatges")),
                    _to_float(row.get("renda")),
                    row.get("tram_preus"),
                ),
            )
            inserted += 1

    console.print(f"[green]✓[/green] upserted {inserted} rent rows")


@app.command("all")
def load_all(since_year: int = typer.Option(2023, "--since")) -> None:
    """Run zones + rent in sequence."""
    load_zones()
    load_rent(since_year=since_year)


if __name__ == "__main__":
    app()
