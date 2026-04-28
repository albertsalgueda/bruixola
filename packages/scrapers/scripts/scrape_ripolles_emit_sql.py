"""One-shot Ripollès scrape that emits SQL upserts to stdout.

Used to seed the database from a network where the direct Supabase Postgres
host is IPv6-only and unroutable; the SQL output is then executed via the
Supabase MCP. Once the production scraper has DATABASE_URL pointed at the
pooler (or SUPABASE_SERVICE_ROLE_KEY set), this shim is unnecessary — the
normal `bruixola-scrape --comarca ripolles` flow writes directly.

Usage:
    uv run python packages/scrapers/scripts/scrape_ripolles_emit_sql.py \
        --max 3 --crawl-id <uuid> > /tmp/ripolles.sql

Each listing becomes one INSERT … ON CONFLICT DO UPDATE statement that
preserves the streaming-write semantics of the production pipeline.
"""

from __future__ import annotations

import argparse
import sys
import uuid as uuidlib
from typing import Any

from bruixola_scrapers.platforms import get_adapter
from bruixola_scrapers.platforms.base import RawListing


# 18 Ripollès municipalities (slugs match public.cities.slug post-013).
RIPOLLES_SLUGS = [
    "ripoll",
    "sant-joan-de-les-abadesses",
    "campdevanol",
    "camprodon",
    "ribes-de-freser",
    "sant-pau-de-seguries",
    "llanars",
    "vilallonga-de-ter",
    "mollo",
    "planoles",
    "ogassa",
    "les-llosses",
    "vallfogona-de-ripolles",
    "setcases",
    "gombren",
    "queralbs",
    "toses",
    "pardines",
]


def _sql_str(value: str | None) -> str:
    """Quote a string for SQL with $$ to avoid quote-escape headaches."""
    if value is None:
        return "null"
    # Postgres $$-quoted strings — use a tag rare in real text.
    tag = "bx0"
    while f"${tag}$" in value:
        tag += "x"
    return f"$_{tag}_${value}$_{tag}_$"


def _sql_num(value: float | int | None) -> str:
    return "null" if value is None else str(value)


def _sql_text_array(values: list[str] | None) -> str:
    if not values:
        return "array[]::text[]"
    parts = []
    for v in values:
        # photos are URLs from imghs.net — no embedded quotes expected, but be safe.
        parts.append(_sql_str(v))
    return f"array[{','.join(parts)}]"


def emit_upsert(listing: RawListing, *, crawl_id: uuidlib.UUID, photos: list[str]) -> str:
    """Build a single INSERT … ON CONFLICT statement for one listing."""
    return (
        "insert into public.listings (\n"
        "  id, platform, platform_id, url, title, description,\n"
        "  city_slug, address,\n"
        "  price_eur, m2, beds, baths,\n"
        "  source_kind, source_host, crawl_id,\n"
        "  photos, scraped_at, removed_at\n"
        ") values (\n"
        f"  {_sql_str(listing.bruixola_id)}, {_sql_str(listing.platform)}, {_sql_str(listing.platform_id)},\n"
        f"  {_sql_str(listing.url)}, {_sql_str(listing.title)}, {_sql_str(listing.description)},\n"
        f"  {_sql_str(listing.city_slug)}, {_sql_str(listing.address)},\n"
        f"  {_sql_num(listing.price_eur)}, {_sql_num(listing.m2)}, {_sql_num(listing.beds)}, {_sql_num(listing.baths)},\n"
        f"  {_sql_str(listing.source_kind)}, {_sql_str(listing.source_host)}, {_sql_str(str(crawl_id))},\n"
        f"  {_sql_text_array(photos)}, now(), null\n"
        ")\n"
        "on conflict (id) do update set\n"
        "  url = excluded.url, title = excluded.title, description = excluded.description,\n"
        "  city_slug = excluded.city_slug, address = excluded.address,\n"
        "  price_eur = excluded.price_eur, m2 = excluded.m2, beds = excluded.beds, baths = excluded.baths,\n"
        "  source_kind = excluded.source_kind, source_host = excluded.source_host, crawl_id = excluded.crawl_id,\n"
        "  photos = excluded.photos, scraped_at = now(), removed_at = null;\n"
    )


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--max", type=int, default=3, help="Max listings per city.")
    p.add_argument("--crawl-id", required=True, help="UUID of an open crawl_runs row.")
    p.add_argument("--output", default="-", help="Output file or - for stdout.")
    p.add_argument(
        "--cities",
        nargs="*",
        default=RIPOLLES_SLUGS,
        help="City slugs to crawl (default = all Ripollès).",
    )
    args = p.parse_args()

    adapter = get_adapter("pisos")
    crawl_id = uuidlib.UUID(args.crawl_id)

    sink = sys.stdout if args.output == "-" else open(args.output, "w")  # noqa: SIM115
    total = 0
    per_city: dict[str, int] = {}
    try:
        for slug in args.cities:
            n = 0
            print(f"-- ── {slug} ──────────────────────────────", file=sys.stderr)
            try:
                for url in adapter.search_pages(slug):
                    if n >= args.max:
                        break
                    try:
                        html = adapter.fetch(url)
                        listing = adapter.parse_listing(html, url)
                        listing.city_slug = slug
                        photos = adapter.parse_images(html)
                    except Exception as exc:
                        print(f"-- ! parse failed {url}: {exc}", file=sys.stderr)
                        continue

                    sink.write(emit_upsert(listing, crawl_id=crawl_id, photos=photos))
                    sink.write("\n")
                    n += 1
                    total += 1
                    print(
                        f"   {listing.bruixola_id}  €{int(listing.price_eur or 0):>9,}  "
                        f"{listing.m2 or '-'} m²  {len(photos)} photos  {listing.title[:60] if listing.title else ''}",
                        file=sys.stderr,
                    )
            except Exception as exc:
                print(f"-- ! city {slug} failed: {exc}", file=sys.stderr)
            per_city[slug] = n
    finally:
        adapter.close()
        if sink is not sys.stdout:
            sink.close()

    print(file=sys.stderr)
    print(f"DONE · total={total} · {per_city}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
