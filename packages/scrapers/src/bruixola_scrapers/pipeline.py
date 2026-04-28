"""bruixola_scrapers.pipeline — scrape orchestrator.

Streaming model: each parsed listing is upserted to public.listings
immediately. A crashed run never loses already-persisted rows; the
crawl_runs row records status='partial' on exception.

Modes:
    bruixola-scrape --dry-run              # parse one listing, don't write
    bruixola-scrape --city ripoll --max 1  # write 1 row to Supabase from one city
    bruixola-scrape --comarca ripolles     # all Ripollès municipalities
    bruixola-scrape                        # all Catalonia (top-50 + Ripollès)

The --dry-run flag is the audit path before going wide.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import uuid
from typing import Any

import typer
from rich.console import Console
from rich.table import Table

from .platforms import ACTIVE, RawListing, get_adapter
from .storage.rest import RestStore
from .storage.supabase import SupabaseStore

logger = logging.getLogger("bruixola.pipeline")

console = Console()
app = typer.Typer(help="Brúixola scraper pipeline.", no_args_is_help=False)


# ── helpers ────────────────────────────────────────────────────────────


def _setup_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )
    # Quiet down httpx/httpcore noise unless --verbose
    if not verbose:
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("httpcore").setLevel(logging.WARNING)


def _resolve_cities(
    *,
    city: str | None,
    comarca: str | None,
    only_top_n: int | None,
    dry_run: bool = False,
) -> list[str]:
    """Pick which city slugs to crawl. Reads from public.cities unless --city
    is given (single-city dry runs skip the DB roundtrip entirely).

    Tries direct Postgres first; falls back to PostgREST if the DB host is
    unreachable (IPv6-only behind a firewall, etc.).
    """
    if city and (dry_run or comarca is None and only_top_n is None):
        return [city]
    if SupabaseStore.supports_direct_pg():
        return SupabaseStore.from_env().fetch_cities(
            city=city, comarca=comarca, only_top_n=only_top_n
        )
    rest = RestStore.from_env()
    try:
        return rest.fetch_cities(city=city, comarca=comarca, only_top_n=only_top_n)
    finally:
        rest.close()


def _make_writer() -> SupabaseStore | RestStore:
    """Pick a writer: psycopg if reachable, else PostgREST."""
    if SupabaseStore.supports_direct_pg():
        return SupabaseStore.from_env()
    logger.warning(
        "DB host unreachable from this network — falling back to PostgREST writer."
    )
    return RestStore.from_env()


def _render_summary_table(listing: RawListing, photos: list[str]) -> Table:
    t = Table(title=f"Parsed listing — {listing.bruixola_id}", show_lines=False)
    t.add_column("field", style="cyan", no_wrap=True)
    t.add_column("value")

    for k, v in [
        ("platform", listing.platform),
        ("source_host", listing.source_host),
        ("source_kind", listing.source_kind),
        ("platform_id", listing.platform_id),
        ("url", listing.url),
        ("title", listing.title),
        ("city_slug", listing.city_slug),
        ("address", listing.address),
        ("price_eur", f"{listing.price_eur:,.0f}" if listing.price_eur else "—"),
        ("m2", listing.m2),
        ("beds", listing.beds),
        ("baths", listing.baths),
        ("year_built", listing.year_built),
        ("description", (listing.description or "")[:120] + ("…" if listing.description and len(listing.description) > 120 else "")),
        ("photos", f"{len(photos)} URLs"),
    ]:
        t.add_row(str(k), str(v) if v is not None else "—")
    return t


# ── commands ───────────────────────────────────────────────────────────


@app.command()
def main(
    platform: str = typer.Option(
        "pisos",
        "--platform",
        help=f"Source platform. Active in v1: {','.join(ACTIVE)}.",
    ),
    city: str | None = typer.Option(None, "--city", help="Single city slug (e.g. 'ripoll')."),
    comarca: str | None = typer.Option(
        None, "--comarca", help="Comarca slug (e.g. 'ripolles')."
    ),
    top_n: int | None = typer.Option(
        None, "--top", help="Top-N cities by population (when no --city/--comarca)."
    ),
    max_per_city: int | None = typer.Option(
        None, "--max", help="Cap listings scraped per city (smoke-test mode)."
    ),
    dry_run: bool = typer.Option(
        False, "--dry-run", help="Parse listings but do NOT write to Supabase."
    ),
    emit_sql: str | None = typer.Option(
        None,
        "--emit-sql",
        help=(
            "Parse listings and write SQL upserts to this file (one statement per "
            "line) instead of touching the DB. Useful when the local network can't "
            "reach the direct Postgres host (IPv6-only)."
        ),
    ),
    verbose: bool = typer.Option(False, "-v", "--verbose"),
) -> None:
    """Run the scrape pipeline."""
    _setup_logging(verbose)

    if platform not in ACTIVE:
        console.print(
            f"[yellow]platform '{platform}' is not active in v1. "
            f"Active: {ACTIVE}. See docs/SCRAPERS.md.[/yellow]"
        )
        raise typer.Exit(2)

    cities = _resolve_cities(
        city=city, comarca=comarca, only_top_n=top_n, dry_run=dry_run or bool(emit_sql)
    )
    if not cities:
        console.print("[red]no cities matched the filter[/red]")
        raise typer.Exit(2)

    console.print(
        f"[bold]platform[/bold]={platform}  "
        f"[bold]cities[/bold]={len(cities)}  "
        f"[bold]dry_run[/bold]={dry_run}  "
        f"[bold]max_per_city[/bold]={max_per_city or '—'}"
    )

    adapter = get_adapter(platform)
    store: SupabaseStore | RestStore | None = None
    if not dry_run:
        store = _make_writer()
    crawl_id: uuid.UUID = (
        store.open_crawl(platform=platform, source_host=adapter.source_host)
        if store
        else uuid.UUID(int=0)
    )

    listings_seen = 0
    pages_fetched = 0
    error_count = 0
    status = "ok"

    try:
        for city_slug in cities:
            console.print(f"\n[bold blue]→ {city_slug}[/bold blue]")
            count_for_city = 0
            for detail_url in adapter.search_pages(city_slug):
                if max_per_city is not None and count_for_city >= max_per_city:
                    break
                try:
                    html = adapter.fetch(detail_url)
                    pages_fetched += 1
                    parsed = adapter.parse_listing(html, detail_url)
                    parsed.city_slug = city_slug
                    photos = adapter.parse_images(html)
                    parsed.photos = photos
                except Exception as exc:
                    error_count += 1
                    logger.exception("parse failed for %s: %s", detail_url, exc)
                    continue

                listings_seen += 1
                count_for_city += 1

                console.print(_render_summary_table(parsed, photos))

                if store and crawl_id is not None:
                    try:
                        bid = store.upsert_listing(parsed, crawl_id=crawl_id)
                        console.print(f"  [green]✓ wrote listings.{bid}[/green]")
                    except Exception as exc:
                        error_count += 1
                        logger.exception(
                            "upsert failed for %s (%s): %s", detail_url, parsed.bruixola_id, exc
                        )

    except KeyboardInterrupt:
        status = "partial"
        console.print("[yellow]interrupted by user[/yellow]")
    except Exception:
        status = "partial"
        logger.exception("pipeline aborted")
    finally:
        adapter.close()
        if store:
            store.close_crawl(
                crawl_id,
                status=status,
                listings_seen=listings_seen,
                pages_fetched=pages_fetched,
                error_count=error_count,
            )

    console.print(
        f"\n[bold]done[/bold] · listings_seen={listings_seen} "
        f"pages_fetched={pages_fetched} errors={error_count} status={status}"
    )

    if dry_run and listings_seen == 0:
        sys.exit(1)


if __name__ == "__main__":
    app()
