# Scrapers — pisos.com pipeline + delisting

This is the source-of-truth for how Brúixola ingests listing data.

## What ships in v1

- **Active platform**: `pisos.com` — server-rendered listings, friendly to our `BruixolaBot/0.1` UA, no anti-bot challenge.
- **Stubbed platforms** (raise `NotImplementedError` with the activation reason):
  - `habitaclia` — Imperva-blocked at HTTP layer regardless of `robots.txt`. Activation requires a paid residential-IP proxy (Bright Data ~€50–200/mo, *flagged cost*) or an alternate feed.
  - `fotocasa` — same Imperva block.
  - `solvia` — Angular SPA; static HTML returns no listings. Needs Playwright (already a project dep) or JSON API discovery.
  - `api_cat` — Generalitat open-data integration (Wave 2).

CLAUDE.md rule 8 disallows UA rotation, so we don't try to defeat the Imperva blocks.

## Architecture

```
packages/scrapers/src/bruixola_scrapers/
  pipeline.py                 — typer CLI; orchestrator (streaming write loop)
  platforms/
    __init__.py               — REGISTRY, ACTIVE, get_adapter()
    base.py                   — PlatformAdapter ABC; rate limit (1 req/s/host),
                                robots.txt check, retry, single UA
    image_extract.py          — JSON-LD/og:image/srcset image-URL extractor
    pisos.py                  — full implementation
    habitaclia.py             — stub
    fotocasa.py               — stub
    solvia.py                 — stub
    api_cat.py                — stub
  storage/
    supabase.py               — psycopg writer (DATABASE_URL)
    rest.py                   — PostgREST writer (publishable key, IPv4-friendly)
  scripts/
    scrape_ripolles_emit_sql.py — one-shot SQL emit (used during bootstrap)
```

### Adapter contract (`platforms/base.py`)

```python
class PlatformAdapter(ABC):
    name: str               # "pisos"
    source_host: str        # "www.pisos.com"
    source_kind = "major"   # or "local" for town-specific outlets
    user_agent = DEFAULT_USER_AGENT  # "BruixolaBot/0.1 (+https://bruixola.cat/bot)"
    rate_limit_per_sec = 1.0

    def search_pages(self, city_slug: str) -> Iterator[str]: ...
    def parse_listing(self, html: str, url: str) -> RawListing: ...
    def parse_images(self, html: str) -> list[str]: ...     # default uses image_extract
```

Per CLAUDE.md rule 8: one UA per scraper, respect `robots.txt` where present, 1 req/sec/domain, **no UA rotation**, no detection-evasion.

### pisos.com specifics

- Index URL: `https://www.pisos.com/venta/pisos-{slug}/` (NOT `/viviendas/{slug}/`, which is a navigation subhome that only some small towns serve listings on).
- Detail URL: `https://www.pisos.com/comprar/{type}-{location}-{idA}_{idB}/` — `{idA}_{idB}` is the platform_id.
- Image CDN: `https://fotos.imghs.net/{size}/...` where `{size}` ∈ `xl-wp` (largest), `apps-wp`, `fch-wp`, `fchm-wp`. The cover photo is server-rendered at `xl-wp`; the rest of the gallery is lazy-loaded at `fchm-wp`. The adapter normalizes every URL to `xl-wp`.
- Adaptive slug filter: when an index page returns ≥20 ad-previews, we trust everything (big cities). Below that, we apply a strict filter (URL must contain the searched city slug) — pisos.com mixes nearby-town fallback rows on sparse small-town pages.
- Address: pisos.com hides street-level addresses (`La ubicación es aproximada` banner). The adapter pulls the **neighborhood** from the URL slug instead (e.g. `casa-ripoll_centro_urbano-...` → `Centro Urbano`).

## Streaming-write model

Each parsed listing is upserted to `public.listings` immediately (one INSERT per listing). A crashed run never loses already-persisted rows:

```python
crawl_id = store.open_crawl(platform="pisos")
try:
    for url in adapter.search_pages(city_slug):
        html    = adapter.fetch(url)         # rate-limited, robots-respecting
        listing = adapter.parse_listing(html, url)
        photos  = adapter.parse_images(html)
        listing.city_slug = city_slug
        listing.photos    = photos
        store.upsert_listing(listing, crawl_id=crawl_id)   # writes NOW
    store.close_crawl(crawl_id, status="ok")
except Exception:
    store.close_crawl(crawl_id, status="partial")
    raise
```

The `INSERT … ON CONFLICT (id) DO UPDATE` resets `removed_at = NULL`, so a re-appeared listing auto-un-delists.

## Delisting (30-day grace)

`db/migrations/013_scrapers.sql`:

```sql
create or replace function public.mark_stale_listings()
returns integer language plpgsql security definer as $$
declare n integer;
begin
  update public.listings
     set removed_at = now()
   where removed_at is null
     and scraped_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end$$;

select cron.schedule(
  'bruixola-mark-stale-listings',
  '30 3 * * *',
  $$select public.mark_stale_listings()$$
);
```

Runs nightly at 03:30 server time. 30-day grace = the scraper has ~30 chances to re-confirm a listing before we mark it removed. If a listing reappears in a later crawl, the upsert's `removed_at = null` un-delists it.

The web app's read path filters `removed_at IS NULL` (RLS policy `listings_public_read_live`).

## Storage paths

The pipeline picks a writer based on what's reachable from the host:

1. **Direct Postgres (`SupabaseStore`, `psycopg`)** — preferred. Connects via `DATABASE_URL` to the Supabase Postgres host. Bypasses RLS as the DB owner.
2. **PostgREST (`RestStore`, `httpx`)** — fallback. Connects via HTTPS to `{project}.supabase.co/rest/v1/*` with the publishable key. IPv4-friendly. Requires write RLS policies (currently bootstrap policies are in place — see "Operations").

`pipeline._make_writer()` probes direct PG with a 3s timeout and falls back to REST if unreachable. Useful when the Supabase direct host (`db.{project}.supabase.co:5432`) resolves to IPv6-only and the local network can't route to it.

### Production-ready setup

For a production scraper deployed to Fly.io, set **either**:

- `DATABASE_URL=postgresql://postgres.{project}:{password}@aws-0-{region}.pooler.supabase.com:6543/postgres` (Supabase pooler URL, IPv4) — the `psycopg` writer will use this.
- Or set `SUPABASE_SERVICE_ROLE_KEY` — production code can swap in `supabase-py` REST writer using service role for unrestricted write access.

The bootstrap RLS policies (`listings_anon_write_BOOTSTRAP`, etc.) created during the initial Ripollès import **must be dropped** before the project is exposed to anonymous writes:

```sql
drop policy if exists listings_anon_write_BOOTSTRAP    on public.listings;
drop policy if exists listings_anon_update_BOOTSTRAP   on public.listings;
drop policy if exists crawl_runs_anon_write_BOOTSTRAP  on public.crawl_runs;
drop policy if exists crawl_runs_anon_update_BOOTSTRAP on public.crawl_runs;
```

## Operations

```bash
# Single-listing smoke test (doesn't write to DB)
uv run bruixola-scrape --platform pisos --city ripoll --max 1 --dry-run

# All Ripollès municipalities, max 5 listings/city
uv run bruixola-scrape --platform pisos --comarca ripolles --max 5

# Top-50 Catalan cities by population
uv run bruixola-scrape --platform pisos --top 50 --max 5

# Full Catalonia (every row in public.cities)
uv run bruixola-scrape --platform pisos
```

## Image handling

- Stored as `text[]` in `public.listings.photos` (existing column).
- Order = display order. Position 0 = primary.
- v1 stores **URLs only**. No mirror to Supabase Storage. Tradeoff: link rot is possible but rare on pisos.com (their CDN is durable). Mirror is a follow-up if we hit rot.
- `apps/web/next.config.ts` allowlists `fotos.imghs.net` so Next.js's `<Image>` proxy can serve them.

## Known issues / follow-ups

- **Some small Ripollès villages return 0 results on pisos.com**: `sant-joan-de-les-abadesses`, `ribes-de-freser`, `sant-pau-de-seguries`, `llanars`, `vilallonga-de-ter`, `mollo`, `les-llosses`, `vallfogona-de-ripolles`, `queralbs`, `pardines`. Either the listings genuinely don't exist or our slug needs a `_SLUG_OVERRIDES` entry. Worth checking each manually.
- **`year_built` is rarely populated** — pisos.com doesn't expose it on most listings. Adapter falls back to `None`.
- **Detail-page fetches for fields missing from the index** — currently always fetched. If we ever scale to 30k listings, evaluate skipping detail pages when the index card already has price + m² + beds + baths.
- **HUT license / energy_cert / lift / `condition_label`** — derived columns are not parsed yet; left at table defaults (`unknown`/`null`). Wave 2 `derive.py`.

## Activating the stubbed platforms

| Platform | Blocker | Activation path |
|---|---|---|
| habitaclia | Imperva WAF blocks any non-real-browser client | **ACTIVE via Firecrawl stealth proxy** (user-approved 2026-04-28). See "Firecrawl-backed adapters" below. |
| fotocasa | same | Same path as habitaclia — Firecrawl works. Adapter still a stub; flip when needed. |
| solvia | Angular SPA — static HTML empty | (a) Playwright fetcher (dep already in pyproject) sending the same UA; (b) reverse-engineer their listing JSON API; (c) Firecrawl with `formats: ['html']` (renders JS). |
| api_cat | **Active for reference data**; live listings TBD | See "Generalitat reference data" below. The `platforms/api_cat.py` adapter (PlatformAdapter contract) remains a stub since Generalitat doesn't publish live listings; reference-data ETL lives in `bruixola_scrapers.etl.generalitat`. |

## Firecrawl-backed adapters

`platforms/firecrawl_fetcher.py` wraps Firecrawl's `/v1/scrape` endpoint. Adapters that subclass `PlatformAdapter` and override `fetch()` to call `FirecrawlClient.fetch_html()` get rendered HTML through a stealth-proxy + headless-browser pipeline that defeats Imperva / DataDome / Akamai WAFs. The rest of the contract (parser, image extraction, registry) is unchanged.

**Cost.** Free 500 credits/mo, $16/mo for 3,000 credits, $83/mo for 25,000. Each `/scrape` with `proxy: 'stealth'` consumes ~5 credits. Budget per crawl carefully:
- 1 city pilot (1 index + 5 details) ≈ 6 calls ≈ 30 credits ≈ 6% of free tier.
- 18 Ripollès municipalities at max 5 each ≈ 18 + 90 = 108 calls ≈ 540 credits — **above free tier**.

**Rule-8 framing.** Firecrawl exists specifically to defeat WAFs. CLAUDE.md rule 8 forbids in-house detection-evasion (UA rotation, stealth plugins). Outsourcing the bypass to a third-party paid service is the user's explicit decision (granted 2026-04-28); the rule-8 grey area is that the WAF policy of the source site is the same regardless of who runs the proxy. Document ToS exposure per source.

**Setup.** Add to `.env`:
```
FIRECRAWL_API_KEY=fc-...
```

Then the adapter auto-routes through Firecrawl when `FIRECRAWL_API_KEY` is set. No code change needed.

### platforms/habitaclia.py

URL conventions discovered via Firecrawl probes:
- Index: `/viviendas-{slug}.htm` (combines pisos + casas + chalets), or `/pisos-{slug}.htm` / `/casas-{slug}.htm` for type-filtered.
- Detail: `/comprar-{type}-<slug-with-words>-i{id}.htm`. Append-only; the `?f=&geo=p&from=list&lo=N` query params are analytics — strip for stable IDs.
- Image CDN: `images.habimg.com/imgh/{a}-{b}/<name>{P|XL|M}.jpg`. `XL` = full-size; the adapter normalizes all variants to `XL`.

**Parser specifics.** Asking price comes from `<span itemprop="price">169.000 €</span>` (the structured-data marker — avoids the `Oportunidad` valuation-range banner that sometimes shows €3M). Habitaclia hides street-level addresses on most listings; we leave `address` null when no `.ficha-*` container is present.

```bash
# Smoke test (uses ~30 Firecrawl credits)
uv run bruixola-scrape --platform habitaclia --city ripoll --max 5 --dry-run

# Pilot crawl + DB write
uv run bruixola-scrape --platform habitaclia --city ripoll --max 5
```

## Generalitat reference data (`bruixola_scrapers.etl.generalitat` + scripts)

Three open datasets from `analisi.transparenciacatalunya.cat`:

- **`fftm-v9b6`** — *"Àrees de referència en matèria de política d'habitatge"*. 947 Catalan municipalities, with the official `zona_de_mercat_residencial_tensat` flag (ZMRT 1 / ZMRT 2 / NA), comarca, ambit funcional, lat/lng. **Updates `cities.codi_ine`, `cities.zmrt_level`, `cities.ambit_funcional`, `cities.area_ptsh`, `cities.in_zona_tensionada`.** Replaces the placeholder `in_zona_tensionada = false` everywhere.
- **`qww9-bvhh`** — *"Preu mitjà del lloguer d'habitatges per municipi"*. ~10k rows since 2024 (45k all-time): per-municipality, per-period (quarter/year), `renda_eur_mo` (avg total monthly rent per dwelling), `habitatges` (sample size), `tram_preus` (price band). **Loaded into `public.municipal_rent_index`** (PK: codi_ine + any + periode).
- **`t2h3-cgys`** — *Establiments d'allotjament turístic inscrits al Registre de Turisme de Catalunya*. 113k tourist licenses including 105,457 HUT (Habitatge d'Ús Turístic) per-flat licenses. Monthly refresh. Has `referencia_cadastral` on ~14% of HUT rows for clean Catastro joins. **Loaded into `public.hut_licenses`.** Migration `016_hut_registry.sql`.

```bash
# Production mode (direct Postgres via DATABASE_URL):
uv run python -m bruixola_scrapers.etl.generalitat all --since 2024

# Bootstrap mode (REST + temp policies; only used when DB host is unreachable):
uv run python packages/scrapers/scripts/etl_generalitat_rest.py --since 2024
uv run python packages/scrapers/scripts/etl_hut_rest.py
```

Migrations: `015_generalitat_rent.sql` (cities reference fields + `municipal_rent_index`), `016_hut_registry.sql` (`hut_licenses`).

## Rent-ceiling oracle (SERPAVI Catalan API)

The Catalan housing agency exposes an **undocumented but live JSON endpoint**
that returns the per-m²/month legal rent ceiling per Llei 12/2023:

```
POST https://agenciahabitatge.gencat.cat/back/api/calculaindex
GET  https://agenciahabitatge.gencat.cat/back/api/municipis
```

No auth, no captcha (the *national* SERPAVI tool at `serpavi.mivau.gob.es` IS
captcha-locked). Required params: `lat, lng, address, m2 (15–250),
maintenance, height, building_year, energetic_cert, elevator, parking,
furniture, consulta, cerca=3`. Returns `mean_price_m2`, `renta`,
`residences_count`, `radius`, plus a `grafica` histogram for P25/P75 derivation.

Per-listing enrichment script (uses city centroid for lat/lng, sensible
defaults for missing fields):

```bash
uv run python packages/scrapers/scripts/enrich_listings_serpavi.py
```

Populates `listings.rent_index_ceiling_eur_m2_mo` and `listings.gross_yield_pct_legal_max`
for active ZMRT-zone listings only. Skips listings with m² outside SERPAVI's
documented 15–250 valid range.

**Cert verification quirk** — `agenciahabitatge.gencat.cat` uses the Generalitat
CA chain which isn't in `certifi`'s default bundle on Python 3.14. The script
falls back to `verify=False` for SERPAVI requests only (HTTPS is still in use,
just the cert chain isn't validated). Production deploys should add the
Generalitat root CA to a custom bundle and verify normally.

## OSM Catalonia (`osm_amenities`)

Five Overpass QL queries for Catalonia, scoped via `area["ISO3166-2"="ES-CT"]`.
Loads into `public.osm_amenities` (PK: osm_id + osm_type). ODbL — attribution
required wherever data surfaces: `© OpenStreetMap contributors`.

| layer | features | use |
|---|---|---|
| hospital | ~11 | `walk_to_hospital_min` |
| university | ~401 | `cities.has_university`, hospital-staff long-let thesis |
| transit (train/halt/tram/metro) | ~3,029 | `walk_to_metro_min`, `cities.transit_score` |
| school | ~3,027 | proximity score |
| beach | ~718 | `distance_to_beach_m` |

```bash
uv run python packages/scrapers/scripts/etl_osm_catalonia.py
```

Migration: `017_osm_amenities.sql`. Refresh cadence: monthly (or yearly for beaches).

## Local adapters (`source_kind='local'`)

### Finques Camprodon (`finquescamprodon.com`)

Local immobiliària covering Vall de Camprodon (Camprodon, Molló, Vilallonga
de Ter, Llanars, Sant Pau de Segúries, Espinavell, Tregurà, Setcases,
Font-Rúbia). Closes the bulk of the Ripollès gap left by pisos.com.

WordPress + Houzez theme. Index:
`https://finquescamprodon.com/advanced-search/?status=venda` (~50 listings,
no pagination). Detail URLs: `/property/ref-<id>-<slug>/` — the `ref-<id>`
chunk is `platform_id`.

```bash
uv run python packages/scrapers/scripts/scrape_finques_camprodon.py
```

Adapter: `bruixola_scrapers.platforms.finques_camprodon.FinquesCamprodonAdapter`.

**Known data-quality caveats (v1):**
- ~10% of listings hide price (`a consultar`) — these are skipped (NOT NULL on `price_eur`).
- Some URL slugs aren't towns (e.g. `local-camprodon` is the listing title) — those skip.
- Houzez global blocks sometimes leak into the parser, so beds/baths/m² occasionally pick up sidebar defaults rather than the listing's own. Acceptable for v1; revisit when adding a second local adapter and refactoring shared selectors.

Per CLAUDE.md rule 8, any "active evasion" path (UA rotation, fingerprint spoofing, residential proxy farms tuned to defeat WAFs) is **not** an option. Paid proxies are acceptable if the user explicitly approves the cost.

## Adding a small-town outlet (`source_kind='local'`)

Local immobiliàries (WordPress/Wix sites, e.g. `finquesripoll.com`) don't need a slot in the `platform` enum. Use:

```python
class FinquesRipollAdapter(PlatformAdapter):
    name = "local"
    source_host = "www.finquesripoll.com"
    source_kind = "local"
    ...
```

Then store rows with `platform = 'local'` and `source_host = 'www.finquesripoll.com'`. The web app's listing reads can filter by `source_host` to scope to a specific outlet.

## Testing

```bash
# Unit: parse a fixture HTML page (TBD)
cd packages/scrapers && uv run pytest

# E2E smoke: 1 listing, no DB write, prints parse table
uv run bruixola-scrape --platform pisos --city ripoll --max 1 --dry-run
```
