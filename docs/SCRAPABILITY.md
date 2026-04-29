# Scrapability matrix · what's accessible, what's not

**Last verified:** 2026-04-28
**Identifying UA used in all probes:** `BruixolaBot/0.1 (+https://bruixola.cat/bot)`
**Per CLAUDE.md rule 8:** no UA rotation, no in-house stealth plugins, no residential-proxy farms run by us. Where Firecrawl is listed, it's the user-approved third-party fetch path (paid, opt-in via `FIRECRAWL_API_KEY` in `.env`).

## Headline

| portal | direct UA | Firecrawl `proxy:stealth` | Adapter status | Notes |
|---|---|---|---|---|
| **pisos.com** | ✅ 200 | not needed | **active** | First active platform. 30 listings/page, server-rendered. Index URL: `/venta/pisos-{slug}/` (NOT `/viviendas/{slug}/`). |
| **finquescamprodon.com** | ✅ 200 | not needed | **active** (`source_kind='local'`) | WordPress / Houzez. ~50 listings. Closes most of the Ripollès gap. |
| **habitaclia.com** | ❌ 403 (Imperva) | ✅ works | **active** | Real URL: `/viviendas-{slug}.htm` or `/pisos-{slug}.htm`. `<span itemprop="price">` is the canonical price marker. Hides street-level addresses on most listings. |
| **idealista.com** | ❌ 403 (DataDome) | ✅ works | **active** | URL: `/venta-viviendas/{town}-{provincia}/`. Comarca-level index at `/venta-viviendas/{provincia}/{comarca}/`. Detail: `/inmueble/{id}/`. **Title contains street address** — unblocks Catastro enrichment. |
| **fotocasa.es** | ❌ 403 (Imperva) | ❌ 405 ("SENTIMOS LA INTERRUPCIÓN") | **stub** | Tier-2 WAF: homepage works (200, 25KB) but every `/comprar/...` URL 405s even with Firecrawl stealth + `waitFor: 8s` + `actions: scroll`. Their search routes need browser-session cookies that Firecrawl can't establish in one call. |
| **solvia.es** | ✅ 200 (HTML shell) | ✅ works | **stub** | Angular SPA — static HTML returns no listings. Firecrawl's headless render handles it but adapter not yet built. |
| **yaencontre.com** | ❌ 403 (DataDome) | not yet tested | **stub** (out of scope) | Same WAF posture as Idealista — likely Firecrawl-bypassable; not yet adapter-built. |
| **milanuncios.com** | ❌ 403 (PerimeterX/HUMAN) | not yet tested | not in scope | Different WAF; Firecrawl docs claim support but unverified. |
| **kasaz.com** | n/a | n/a | not in scope | `Disallow: /` — rule-8 disqualified regardless of WAF. |
| **indomio.es** | ❌ 403 (DataDome) | not yet tested | not in scope | |
| **vibbo.com** | ❌ 403 (Imperva) | not yet tested | not in scope | |
| **donpiso.com** | ✅ 200 (shell) | ✅ would work | not in scope | Listings are JS-injected — would need Firecrawl render or Playwright. Robots permissive on `/listado?*`. |
| **enalquiler.com** | ✅ 200 | not needed | not built (rentals only) | Rentals only (no `/comprar/` section). Real index URL is `/pisos-alquiler-{city}.html`, NOT the pretty `/alquiler-pisos-...` URL. Surfaces the official `priceReferenceIndex` per listing — useful for SERPAVI cross-validation. |
| **AIC Cadaqués** (`inmobiliariacadaques.com`) | n/a | n/a | not in scope | `Disallow: /` — rule-8 disqualified. |
| **Grup Inicia** | n/a | n/a | not in scope | `Disallow: /` — rule-8 disqualified. |
| **Finques Frígola** | ✅ 200 | not needed | candidate | Server-rendered PHP, sitemap_all_lodgings.xml enumerates HUT-licensed inventory. Costa Brava STR-thesis hit. |
| **Granvall** (Cerdanya) | ✅ 200 | not needed | candidate | WordPress + Yoast, fully open robots. Pirineus STR. |

## Government / open-data sources (all FREE, ToS-friendly, no UA challenge)

| source | dataset / endpoint | What we get | Status |
|---|---|---|---|
| `analisi.transparenciacatalunya.cat` | Socrata `fftm-v9b6` | Zonas tensionadas (ZMRT 1/2) for all 947 Catalan munis, with lat/lng + comarca | **loaded** (`cities.zmrt_level` etc.) |
| same | Socrata `qww9-bvhh` | Per-muni rent prices since 2024 | **loaded** (`municipal_rent_index`) |
| same | Socrata `t2h3-cgys` | 107k tourist licenses (HUT, Apt. Turístics, Llars compartides) | **loaded** (`hut_licenses`) |
| `agenciahabitatge.gencat.cat/back/api` | `/calculaindex` (POST), `/municipis` (GET) | Per-address legal rent ceiling under Llei 12/2023 | **loaded** (`listings.rent_index_ceiling_eur_m2_mo`) |
| `serpavi.mivau.gob.es` | `/api/Core/*` | National per-address rent index | reCAPTCHA-locked — not viable headless |
| `ovc.catastro.meh.es` | `/OVCWcfCallejero.svc/json/Consulta_DNPLOC`, `Consulta_DNPRC` | Year built, catastral m², building use, parcel m² | **deferred** — needs upstream street-address extraction first |
| `subastas.boe.es` | HTML scraping w/ stable query params | Bank-foreclosure auctions (Cat-ref join to Catastro) | not built — ~10–14 h, ToS friction documented |
| `analisi.transparenciacatalunya.cat` | misc housing datasets | EE certs, comarca-level rolls, building registry | partial |

## Free / OSM

| source | endpoint | use |
|---|---|---|
| `overpass-api.de` | Overpass QL queries scoped to `area["ISO3166-2"="ES-CT"]` | Hospitals, universities, transit, schools, beaches | **loaded** (`osm_amenities`, 4,525 features) |
| `r.jina.ai` (Jina Reader) | Free GET, no key | Markdown extraction. Doesn't bypass commercial WAFs (gets 404/403 same as us). Useful for lightweight sites only. |

## Partner / paid options (NOT engaged)

| service | claimed scope | pricing | rule-8 verdict |
|---|---|---|---|
| **Idealista Pro Search API** | Idealista official | not public; weeks to months; competitors typically rejected | If granted, lawful + within rule 5 |
| **Apify Idealista actor(s)** (e.g. `epctex/idealista-scraper`) | Idealista listings via their proxy | ~$1–5 per 1k results + $20/GB residential proxy | Commodified evasion (rule-8 grey, user-decision) |
| **Bright Data residential proxies** | Any site, DIY stack | $3–15/GB residential | Commodified evasion (rule-8 grey, user-decision) |
| **ScrapingBee / ZenRows** | Any site, premium proxies | $49–69/mo for 100k–250k requests | Same posture as Apify/Firecrawl |

## Working Firecrawl integration (`platforms/firecrawl_fetcher.py`)

- Cost: **free 500 credits/mo, $16/mo Hobby (3k credits), $83/mo Pro (25k)**.
- Each `/v1/scrape` with `proxy: 'stealth'` ≈ 5 credits.
- Adapters that swap their `fetch()` to `FirecrawlClient.fetch_html()` get rendered HTML through stealth-proxy + headless-browser.
- Active in: `platforms/habitaclia.py`, `platforms/idealista.py`.

## Recommended next portals to flip (effort estimates)

| portal | adapter effort | Firecrawl viability | listings unlock |
|---|---|---|---|
| Solvia.es | ~½ day | confirmed (SPA renders fine) | mid-volume Spain-wide bank inventory |
| yaencontre.com | ~½ day | likely (DataDome bypassable) | Catalonia-friendly volume |
| Apify Fotocasa actor | ~½ day setup + budget | n/a (Apify handles WAF) | tier-1 Spanish portal |
| BOE auctions | ~10–14 h | n/a (uses our own scraper) | foreclosure thesis |

## Out-of-scope

- **Mass scraping behind WAFs without paid proxies** — rule-8 disqualified.
- **Captcha-solving services** for SERPAVI national or any portal — rule-8 disqualified.
- **Idealista mass scraping at our identifying UA** — rule 8 + their ToS.

## Key constraints documented

1. **`SUPABASE_SERVICE_ROLE_KEY` blank in `.env`** — bootstrap policies + REST-via-publishable-key path used today. Production deploy needs the service role key OR a pooler `DATABASE_URL`.
2. **`agenciahabitatge.gencat.cat` cert chain isn't in `certifi`** on Python 3.14 — SERPAVI script falls back to `verify=False`. Add Generalitat root CA to a custom bundle for production.
3. **Detection-evasion (rule 8)** — interpretation grey on Firecrawl/Apify/etc. User explicitly authorized Firecrawl 2026-04-28; other commercial proxies need separate go-aheads.
