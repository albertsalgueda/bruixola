# Bruixola — Real-Estate Intelligence · Catalonia
> N · 41.39° · E · 2.16°
>
> *Working titles: Bruixola (plan prose) / Atlas (design chrome). Locked product name: **Bruixola** (Catalan: compass).*

## Context

Albert (Krea AI, Barcelona) is hunting buy-to-rent flats across Catalonia under €250k. Prior research returned tabular shortlists across 14 zones — useful but slow to consume, no map, no price-history context, no agency directory, no way to drill in or re-filter without re-running agents. Wants a Palantir-style local intelligence platform: map-first, dense data, computed yields, scraped photos, a directory of local *gestores* / *inmobiliarias* per city, and a conversational interface accessible from anywhere via OpenClaw.

**Target outcome:** a single dark-themed web app deployable to Fly.io that ingests scraped Catalan listings, presents them on a tactical map UI with filters, deterministic yield math, price-history sparklines, comparable rentals, and a per-city agency directory. **OpenClaw runs alongside on the same cloud machine** as the conversational front-door — Albert texts iMessage / WhatsApp / Telegram from his phone and OpenClaw's Claude-backed agent answers by querying Bruixola's data API. Catalonia in v1; architecture region-pluggable so v2 can add Madrid/Valencia by dropping in a config.

**Decisions locked from clarifying questions + iteration:**
- **Hosting:** local-first, deployable to Fly.io (cloud) + Vercel (static web)
- **Geography:** Catalonia v1, Spain-ready schema
- **Scrape sources:** Habitaclia + Fotocasa + Solvia + api.cat (skip Idealista — actively blocks, ToS hostile)
- **Conversational AI:** OpenClaw daemon, period. No Anthropic SDK in app code.
- **Batch AI enrichment:** dropped entirely. No Claude calls during scraping. No vision condition scoring, no okupa NLP, no AI yield commentary, no AI strategy distillation. All derived fields computed by deterministic rules from scraped HTML/text. (User: "batch enrichment no, only the conversational part.")
- **Email:** dropped. (User: "forget about email, I'll write to OpenClaw.")

> **Important architectural clarifications:**
> 1. Claude Code CLI subagents are *build-time only* (the ~55 agents that construct the project).
> 2. The runtime AI surface is **OpenClaw alone**. Bruixola's backend exposes a typed query API; OpenClaw registers Bruixola as a tool/skill so its agent can call `bruixola.search(...)` etc. when Albert texts it from any messaging channel.
> 3. OpenClaw uses Claude under the hood — that's fine and expected; the rule is no `import anthropic` in our app code. All AI flows through OpenClaw.

---

## Architecture

```
┌──────── User surfaces ─────────────────────────────────────────────┐
│  Web UI (apps/web)              OpenClaw daemon (sidecar)           │
│  ─ Map / filters / detail        ─ iMessage / WhatsApp / Telegram   │
│  ─ Strategy + agency panels      ─ Slack / Signal / Discord / etc.  │
│  ─ Price history charts          ─ Voice wake (macOS) on dev box    │
└───────────────┬───────────────────────────────┬────────────────────┘
                │ HTTP                          │ HTTP (localhost on cloud VM)
                ▼                               ▼
┌───────────────────────────────────────────────────────────────────┐
│  apps/api (Bun + Hono + DuckDB)                                    │
│  ─ /listings  /cities  /regions  /price-history  /agencies        │
│  ─ /strategies  /comps                                            │
│  ─ /tools/* (typed tool surface OpenClaw calls — see below)       │
└──────────────────────────────┬────────────────────────────────────┘
                               │ SQL over CSV
┌──────────────────────────────▼────────────────────────────────────┐
│  data/db/intel.duckdb  +  data/csv/*.csv  +  data/images/{id}/     │
└───────────────────────────────────────────────────────────────────┘
                               ▲
                               │ batch writes (cron)
┌──────────────────────────────┴────────────────────────────────────┐
│  packages/scrapers (Python + uv + httpx + bs4 + Playwright)        │
│  Pure rules-based: extract → dedupe → geocode → derive fields →    │
│  compute yields → load CSV / DuckDB. NO Anthropic SDK calls.       │
│  Run via `bun refresh` cron (Fly Machines scheduled task)          │
└───────────────────────────────────────────────────────────────────┘
```

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | **Bun 1.3** | Fast, single binary, workspaces |
| Frontend | **Vite + React 19 + TypeScript** | Standard, fast HMR |
| Styling | **Tailwind 4 + shadcn/ui + custom Palantir tokens** | Dense data UI |
| Map | **Mapbox GL JS** + Mapbox dark style + custom hex/heatmap layers | Best-in-class dark cartography, real comarca/cadastre data, vector tiles. Free tier (50k loads/mo) covers personal + early-platform use; monitor as users grow |
| Charts | **Recharts** (sparklines, time series, distribution histograms) | Matches dense aesthetic |
| Backend | **Hono on Bun** | Tiny, fast, perfect for DuckDB-over-HTTP |
| Storage | **DuckDB** (queries CSV natively) + **CSV** as source-of-truth | User-readable, version-controllable |
| Scrapers | **Python 3.14 + uv + httpx + BeautifulSoup + Playwright fallback** | Async, mature |
| Conversational AI | **OpenClaw** (`npm i -g openclaw@latest`) — runs on same Fly machine, exposes channel bridges to iMessage/WhatsApp/Telegram/etc. | Single AI surface, no SDK code, paste-and-go install |
| Bruixola-as-skill | Tool definition (JSON schema) registered with OpenClaw so its agent can call `/tools/*` endpoints | Standard MCP-style tool surface |
| Geocoding | **Nominatim** (OSM, free) with local cache | No fees |
| Deploy | **Fly.io** single machine (Catalonia/Madrid edge) running both `apps/api` AND `openclaw` daemon, persistent volume for DuckDB + images + OpenClaw config | One machine, one deploy, cheap |

---

## Project layout

```
real-estate-intel/
├── apps/
│   ├── web/                    # React frontend
│   │   ├── src/
│   │   │   ├── components/{Map,Sidebar,Table,Detail,Strategy,Agency,PriceHistory,HUD}/
│   │   │   ├── lib/{api,filters,yield,format}.ts
│   │   │   └── styles/palantir.css
│   │   └── vite.config.ts
│   └── api/                    # Hono backend
│       ├── src/routes/{listings,cities,regions,priceHistory,agencies,strategies,comps}.ts
│       ├── src/tools/          # OpenClaw-callable tool surface
│       │   ├── search.ts       # POST /tools/search
│       │   ├── compare.ts      # POST /tools/compare
│       │   ├── yield_for.ts    # POST /tools/yield-for
│       │   ├── neighborhood.ts # POST /tools/neighborhood
│       │   └── agency_for.ts   # POST /tools/agency-for
│       └── src/server.ts
├── packages/
│   ├── scrapers/               # Python — rules-based, no AI
│   │   ├── src/platforms/{habitaclia,fotocasa,solvia,api_cat,base}.py
│   │   ├── src/{geocode,images,derive,yield_calc,pipeline}.py
│   │   └── jobs/{refresh_all,backfill_history}.py
│   └── shared/                 # Pydantic + Zod schemas
├── openclaw/                   # OpenClaw config (committed to repo)
│   ├── config.yaml             # daemon settings, channel auth
│   ├── skills/bruixola.json   # tool schema registration
│   └── prompts/system.md       # system prompt: "you are Albert's investment scout..."
├── data/
│   ├── csv/{regions,cities,neighborhoods,listings,price_history,rentals,agencies,hut_licenses,strategies}.csv
│   ├── images/{listing_id}/{original,thumb}/
│   └── db/intel.duckdb
├── scripts/{bootstrap,refresh,deploy}.sh
├── fly.toml                    # single machine, two processes (api + openclaw)
├── vercel.json
├── docker-compose.yml          # local dev: api + openclaw + nominatim cache
├── .env.example  package.json  README.md
```

**Schema highlights** (Pydantic + Zod in `packages/shared`):

- `Listing`: id, platform, url, town, neighborhood, lat, lng, price, m2, beds, baths, lift, energy_cert, condition_label (rules-based: "reformado" / "buen estado" / "para reformar" / "wreck" — derived from listing description regex), photos[], scraped_at
- `City`: name, comarca, region, pop, avg_sale_eur_m2, avg_rent_eur_m2_mo, gross_yield_pct, has_hospital, has_university, transit_score, hut_moratorium_status
- `Neighborhood`: city, name, lat, lng, polygon, avg_sale_eur_m2, avg_rent_eur_m2_mo
- `PriceHistory`: neighborhood_id, month, sale_eur_m2, rent_eur_m2_mo (5y from Fotocasa price index)
- `Agency`: city, name, address, phone, web, email, specialty[], gestoria_y_n
- `Strategy`: id, title, thesis, filter_query (json), example_listings[], avg_yield, risk_score — **statically curated** in `data/csv/strategies.csv` (8-12 strategies hand-written from the prior research, no AI)

---

## Derived fields (rules-based, no AI)

To preserve the value of the old AI enrichment without the SDK dependency, scrapers compute these deterministically:

| Field | Rule |
|---|---|
| `condition_label` | regex on description: matches `/reform[ai]/` → "reform_needed"; `/totalmente reformado|reformat integral|nuevo|a estrenar/` → "reformado"; `/buen estado|listo para entrar/` → "good"; else "unknown" |
| `okupa_risk` | text contains `/ocupad[oa]|sin posesi[óo]n|pendiente posesi[óo]n|nuda propiedad/` → "high"; if Solvia/Haya without "libre de ocupantes" → "medium"; else "low" |
| `gross_yield_pct` | `(neighborhood_avg_rent_per_m2 × m2 × 12) / price × 100`. Neighborhood rent from `neighborhoods.csv` (refreshed monthly from Fotocasa price index) |
| `walk_to_hospital_min` | OSRM routing engine (containerized locally) from listing lat/lng to nearest hospital from `cities.csv` |
| `walk_to_metro_min` | same, against GTFS feed for Barcelona/Sant Andreu/Hospitalet/Badalona/SCG |
| `distance_to_beach_m` | haversine from lat/lng to nearest coastline polygon |
| `hut_license_held` | join on `hut_licenses.csv` (Generalitat registry) by full address; null if no match |

---

## Build waves (subagent allocation)

**Honest framing:** "100 subagents" was hyperbolic; with batch AI dropped this scopes to ~55 subagents in 9 waves.

| Wave | Purpose | Agents | Parallel? |
|---|---|---|---|
| **0. Scaffold** | Bun workspace, .env, configs, base dirs | 1 | — |
| **1. Schemas + DB** | Pydantic + Zod schemas, DuckDB init, CSV templates, seed `regions.csv` + `cities.csv` (50 Catalan cities w/ pop, comarca, hospital/uni/transit flags) | 1 | — |
| **2. Platform scrapers** | One agent per source: Habitaclia, Fotocasa, Solvia, api.cat. Each: rate-limited fetcher + extractor + image downloader | **4** | ✅ |
| **3. Geo + price history + derived fields** | (a) Nominatim batch geocoder (b) Fotocasa price index 5y scraper (c) OSRM container + walk-time computer (d) HUT license registry scraper from Generalitat | **4** | ✅ |
| **4. Backend API** | (a) Hono + DuckDB scaffold (b) Listings/cities/regions endpoints w/ filter combinators (c) `/tools/*` typed surface for OpenClaw | **3** | ✅ |
| **5. Frontend foundation** | (a) Vite + React + Tailwind scaffold (b) Palantir theme tokens (dark, hex grid, mono, scan lines) (c) URL-synced filter state | **3** | ✅ |
| **6. Frontend modules** | One agent per module, all parallel: Map (Maplibre + hex layer), Sidebar filters, Table (TanStack virtual), Detail pane, Strategy panel, Agency directory, Price History charts, HUD chrome | **8** | ✅ |
| **7. Per-city agency scrapers** | One agent per Catalan city. Finds local inmobiliarias + gestores via Google + Páginas Amarillas + chamber-of-commerce. Verifies each by HTTP-200 on website before adding to `agencies.csv`. Outputs name/address/phone/web/specialty | **30** | ✅ — biggest wave |
| **8. OpenClaw integration + cloud deploy** | (a) `openclaw/skills/bruixola.json` tool schema registration (b) `openclaw/prompts/system.md` — "You are Albert's Catalan real-estate scout. You answer in Catalan/Spanish/English depending on the user's message. You always cite listing URLs. You compute yields using the formula in the Bruixola data, never invent." (c) `fly.toml` w/ two-process group (api + openclaw daemon, shared persistent volume) (d) Channel auth setup (iMessage requires macOS dev box bridge; WhatsApp/Telegram/Slack work on Linux Fly machine) (e) GH Actions cron for scrape refresh | **3** | ✅ |
| **9. Polish** | (a) Framer Motion animations (hex reveal, scan-line sweeps, listing fly-to on map) (b) README + screenshots (c) Static strategy authoring — write 8-12 strategy memos by hand into `strategies.csv` based on prior research | **2** | ✅ |
| **Total** | | **~55 subagents** | |

---

## Critical files

- `packages/scrapers/src/platforms/base.py` — rate limit, UA rotation, retry, robots.txt respect
- `packages/scrapers/src/derive.py` — the rules table above; central source of truth for derived fields
- `packages/scrapers/src/yield_calc.py` — gross_yield_pct + net_yield_pct (default 25% opex haircut), with explanation strings the UI can render
- `packages/scrapers/src/pipeline.py` — orchestrator: scrape → dedupe → geocode → derive → yield → load
- `apps/api/src/routes/listings.ts` — filtered query (DuckDB SQL with cursor pagination)
- `apps/api/src/tools/*.ts` — the OpenClaw tool surface; each endpoint takes typed JSON input, returns minimal JSON output suitable for the agent to format into chat
- `apps/web/src/components/Map/MapView.tsx` — Mapbox GL JS + H3 hex layer + heatmap + listing pins + fly-to
- `apps/web/src/components/Sidebar/FilterRail.tsx` — URL-synced filters: price, m², beds, lift, energy, condition_label, okupa_risk, yield_min, walk_to_hospital_max, walk_to_metro_max, distance_to_beach_max, hut_license_held
- `apps/web/src/styles/palantir.css` — design tokens: bg `#0a0e14`, text `#c5d1de`, accent-cyan `#00d4ff`, accent-orange `#ff8c42`, alert-red `#ff3b3b`, JetBrains Mono, hex grid SVG bg
- `data/csv/cities.csv` — seed file, 50 Catalan cities with pop/comarca/has_hospital/has_university/transit_score/hut_moratorium
- `data/csv/strategies.csv` — hand-curated strategy memos (e.g. "Reus 4-bed family rental", "Bellvitge hospital staff stack", "Camprodon HUT-bearing STR")
- `openclaw/skills/bruixola.json` — tool registration; defines tool names, parameter schemas, descriptions
- `openclaw/prompts/system.md` — agent persona + behavior rules
- `fly.toml` — single Fly machine, two processes (`api` + `openclaw`), 1GB persistent volume

---

## OpenClaw integration details

**Install + run on Fly machine:**
```dockerfile
# In Dockerfile
RUN npm install -g openclaw@latest
COPY openclaw/ /app/openclaw/
```

**fly.toml process group:**
```toml
[processes]
  api = "bun run apps/api/src/server.ts"
  agent = "openclaw daemon --config /app/openclaw/config.yaml"
```

**Tool schema** (`openclaw/skills/bruixola.json`):
```json
{
  "name": "bruixola",
  "description": "Catalan real estate intelligence database. Use to answer questions about listings, prices, yields, neighborhoods, and local agencies.",
  "tools": [
    {
      "name": "search_listings",
      "description": "Search for listings with filters",
      "url": "http://localhost:3001/tools/search",
      "method": "POST",
      "schema": {
        "city": "string?", "max_price": "number?", "min_beds": "number?",
        "lift": "boolean?", "min_yield": "number?", "condition": "string?",
        "limit": "number?"
      }
    },
    { "name": "yield_for", "url": "http://localhost:3001/tools/yield-for", ... },
    { "name": "compare_listings", "url": "http://localhost:3001/tools/compare", ... },
    { "name": "neighborhood_brief", "url": "http://localhost:3001/tools/neighborhood", ... },
    { "name": "agencies_in_city", "url": "http://localhost:3001/tools/agency-for", ... }
  ]
}
```

**Channel setup** (`openclaw/config.yaml`):
- iMessage: requires macOS bridge — only works on Albert's local Mac during dev. Skipped in cloud deploy.
- WhatsApp Business API: requires Meta verification (~1 week) OR use unofficial bridge if Albert is OK with that
- Telegram: paste bot token from @BotFather — instant, free, recommended primary channel
- Slack: paste bot token from his workspace
- Signal: use signal-cli bridge

**Recommended day-1 channel: Telegram.** Zero friction, free, works in cloud, supports rich messages (photos, inline buttons → can render listing cards).

---

## Cloud deployment

**Single Fly.io machine, two processes:**
- Region: `mad` (Madrid) for low latency to Catalonia
- Size: shared-cpu-2x, 2GB RAM (~$5-10/mo)
- Volume: 10GB persistent (DuckDB + images + OpenClaw state)
- Health check: HTTP `/health` on `:3001`
- Cron: GH Actions runs `fly machines run --command "bun run scripts/refresh.sh"` weekly

**Vercel for web:** static React build, auto-deploys on push to main. Calls Fly machine via `https://bruixola-api.fly.dev`.

**Telegram bot URL** (the only thing Albert types into his phone): `t.me/bruixola_bot` (or whatever name he picks). One tap, conversation starts.

---

## Verification (end-to-end)

After Wave 9:

1. `./scripts/bootstrap.sh` — installs uv + bun deps, inits DuckDB, seeds cities.csv, installs OpenClaw locally
2. `bun refresh` — runs scrape → geocode → derive → yield → load. Expect ~5,000 listings in `listings.csv`, 20+ photos per listing in `data/images/`
3. `bun dev` — starts Hono on `:3001` + Vite on `:5173` + OpenClaw daemon
4. **Web checks** at `http://localhost:5173`:
   - Map renders dark, centered on Catalonia, hex layer overlays €/m² heatmap
   - Sidebar filters work, URL updates, sub-200ms re-render
   - Click a hex → table filters to that neighborhood
   - Click a listing → detail pane: photos carousel, deterministic yield calc with formula shown, comparable rentals, neighborhood metrics, 3 nearest agencies
   - Strategy panel shows hand-curated strategies, click one → applies its filter query
   - Price History tab → 5y sparkline for focused neighborhood
5. **OpenClaw chat checks** (locally, then via Telegram on cloud):
   - "What's the cheapest 3-bed with lift in Reus?" → agent calls `search_listings`, replies with top 3 + URLs
   - "Compute the yield for [listing URL]" → agent calls `yield_for`, replies with gross + net + formula
   - "Which agencies should I call about Reus?" → agent calls `agencies_in_city`, returns 3-5 with phone/web
   - "Compare the top Bellvitge and Bufalà picks" → agent calls `compare_listings`, returns side-by-side
6. `bun deploy` — pushes web to Vercel + machine to Fly. Open Telegram, message bot, verify same answers.

---

## Open risks

1. **Habitaclia/Fotocasa rate limiting** — even friendly sources will block aggressive scrapers. Wave-2 agents must implement: 1 req/sec/domain, 5-30s jitter, daily quota ~3k req/source, Playwright fallback on 403/CF.
2. **OpenClaw API surface uncertainty** — I've confirmed it's a multi-channel daemon with skill registration but haven't run it locally. Wave-8 agent must first `npm i -g openclaw && openclaw --help` and read the actual docs before writing the skill JSON. If the schema differs from what's sketched here, Wave-8 adapts.
3. **iMessage in cloud is impossible** — Apple's bridge requires a macOS host. Telegram is the cloud-friendly recommendation; iMessage is a local-dev-only nicety.
4. **WhatsApp official API friction** — Meta verification takes ~1 week and requires a business entity. Day-1 ship without WhatsApp; add later if Albert wants it.
5. **HUT license registry scraping** — Generalitat publishes the official list at <https://registreturisme.gencat.cat/>. Wave-3 should snapshot this once, store as `hut_licenses.csv`, join to listings on address. License-bearing listings are the gold for coastal STR.
6. **Per-city agency-finder agent quality (Wave 7)** — risk of fabricated agencies. Each agent must verify each agency by HTTP-200 on its website before writing to CSV. Quality bar > row count.
7. **Photo storage at scale** — 20 photos × 5,000 listings × 200KB ≈ 20GB. Local during dev. Move to Tigris S3 (Fly's object store, $0.01/GB) before prod ship.
8. **No AI-derived neighborhood briefs** — without batch AI, the "neighborhood brief" surface is just the deterministic metrics (avg €/m², yield, transit, hospital flags). If user later wants prose summaries, OpenClaw can generate them on-demand when asked via chat ("describe Bellvitge for me") — same answer, different timing.

---

## Architecture v2 — Multi-tenant + MCP (2026-04-28)

### The pivot

Brúixola is now designed as a multi-tenant intelligence platform with two surfaces:
- **Public market intelligence** — anyone (no login) can see Catalan municipalities,
  comarca polygons, price/rent time-series, SERPAVI ceilings, zonas tensionadas.
  This is the "open the dashboard, look at the market" surface.
- **Tenant-private workspace** — login required. Each tenant has their own
  properties (saved listings), deals (active pipeline with stages + notes),
  pipeline stages, opportunities (agent-flagged follow-ups), and audit log.

For now there is exactly one tenant: Albert + his agent. The schema, RLS, and
API surface are designed for N tenants from row zero so onboarding the second
one (or opening to the public) is a config flip, not a rewrite.

### The agent surface — Remote MCP, not in-app chat

The agent is no longer assumed to be Anthropic-via-Next.js-route-handler. It's
a separate process that talks to the platform via the **Model Context Protocol
(MCP) over HTTP**. The platform hosts an MCP server at e.g.
`https://bruixola.fly.dev/mcp` (production) or `http://localhost:3001/mcp` (dev).
Any MCP-aware client — OpenClaw, Claude Desktop, Cursor, a homemade agent —
configures the URL + a tenant token and gets the full Brúixola tool surface.

The in-app chat (`/api/chat`) stays as a "platform-hosted agent" for users who
don't run their own MCP client. Same tool surface, different transport.

### Public vs tenant-scoped tools

Public tools (no auth or anon-key only):
- `list_cities()` — slug, name, comarca, population
- `get_city_brief(slug)` — population, transit, hospital/uni flags, SERPAVI
- `list_neighborhoods(city)` — barris within a city
- `get_neighborhood_brief(city, neighborhood)` — same as city but barri scope
- `get_price_history(scope_kind, scope_id, kind?)` — monthly time series of
  €/m² sale + €/m²/mo rent for a municipality or neighborhood, last N years
- `get_zona_tensionada_status(municipality)` — is it declared, what's the index
- `list_market_signals()` — public market events (new SERPAVI index releases,
  zona tensionada declarations, etc)

Tenant-scoped tools (require tenant token):
- `list_properties(filter?)`, `get_property(id)`, `add_property(payload)`,
  `update_property(id, patch)`
- `list_deals(stage?)`, `get_deal(id)`, `add_deal(...)`, `move_deal_stage(id, stage)`
- `add_note_to_deal(id, body)`, `attach_doc_to_deal(id, url)`
- `list_pipeline_stages()` (read-only, hand-curated)
- `list_opportunities(status?)`, `flag_opportunity(payload)`, `resolve_opportunity(id, status)`
- `add_viewing_log(deal_id, payload)` — visit notes, photos, decisions

The Brúixola Agent calls public tools when the user logs out, both surfaces
when logged in. Tools that mutate state always require tenant auth.

### Data model

#### Public (read-only, anon-readable, RLS=permissive-select)

| Table | What it is | Source |
|---|---|---|
| `cities` | Catalan municipalities. Population, comarca, transit/hospital/uni flags, hut moratorium status, SERPAVI ceiling. | Generalitat IDESCAT, BOE zona tensionada declarations |
| `comarques` | Comarca admin units, with multipolygon geometry for choropleth | Generalitat ICC GeoJSON |
| `neighborhoods` | Barris within cities, with point + polygon geometry | Generalitat / municipal sources |
| `price_history` | Monthly €/m² sale + €/m²/mo rent per scope (city or neighborhood), last 5 years | Idealista price index, Fotocasa price index, INE, IDESCAT |
| `rent_index_serpavi` | Monthly SERPAVI índex de referència per municipality (the legal ceiling for zonas tensionadas) | Mivau SERPAVI dataset, Generalitat updates |
| `market_signals` | Public events: zona tensionada declared/lifted, SERPAVI revision, new HUT moratorium | Manual curation + scraped news/BOE |

#### Tenant-scoped (login required, RLS=tenant_id-scoped)

| Table | What it is |
|---|---|
| `tenants` | Top-level tenant records. Albert = tenant 1. |
| `tenant_users` | join: which auth.users belong to which tenant + role (owner/member/agent) |
| `tenant_api_keys` | service tokens for agents (e.g. `brx_<random>` issued per agent) |
| `properties` | Each tenant's imported/saved listings. Subset of public listings if scraper was run, OR direct manual entry. |
| `deals` | Active deal pipeline: which property, current stage, last action, agent assigned |
| `pipeline_stages` | Hand-curated: discovered, reviewing, visiting, offered, closed, dropped |
| `deal_notes` | Append-only notes per deal (text, author=user_id or agent_token_id, timestamp) |
| `viewing_logs` | Per visit: deal_id, date, photos, decision, attachments |
| `opportunities` | Agent-surfaced follow-ups: "Pis Reus 142 just dropped 8% — review?" with status (new/seen/acted/dismissed) |
| `agent_actions` | Audit log: every tool call by tenant_api_key, with input/output snippets |

The 30 fake listings are dropped. The `listings` table is repurposed (or
deleted; the public market view doesn't need it). Public market data lives in
`price_history` + `cities.avg_*` aggregates.

### Auth model

- **Supabase Auth** (magic link by default) for human users.
- `auth.users.id` joined to `tenant_users.user_id` to determine which tenant(s)
  a logged-in user belongs to.
- **Tenant API keys** for agents — issued from a logged-in user's settings page,
  stored hashed in `tenant_api_keys`. Agent presents `Authorization: Bearer brx_<token>`,
  API resolves to tenant_id, downstream RLS scoped accordingly.
- **Single-tenant mode** (today): one user = Albert, one tenant = "Albert", all
  tenant-scoped tables seeded with `tenant_id = 1`. Login is optional locally
  (development bypass) but required in production.

### MCP server design

Live at `/mcp` on the API (Hono). Implements the MCP HTTP transport (per
modelcontextprotocol.io spec). Tools are the same primitives backing
`/tools/*` (REST) but published as MCP tool definitions with input schemas
(Zod → JSON Schema). Auth via header.

Two endpoints:
- `GET /mcp/manifest` — public tool catalog (read-only tools listed)
- `POST /mcp/invoke` — JSON-RPC-shaped invoke; auth-gated tools require Bearer
- `GET /mcp/sse` — Server-Sent-Events for streaming tool output (for long
  scrape jobs, etc)

### What to build first (Wave 2.5 plan)

1. ✅ Drop fake listings, repurpose `listings` table or replace with `properties` (tenant-scoped)
2. ✅ Real Catalan municipality data: ~50-100 cities with population + flags, sourced from IDESCAT
3. ✅ Comarca polygon geometry (PostGIS multipolygons) for choropleth
4. ✅ SERPAVI rent index data: monthly ceilings for declared zonas tensionadas
5. ✅ Price history time series: 5y monthly €/m² sale + rent, top 30 municipalities
6. → Multi-tenant schema migration (tenants, tenant_users, tenant_api_keys, properties, deals, opportunities)
7. → Frontend: comarca choropleth on /cop; click municipality → drill-in chart panel
8. → Auth wiring: Supabase Auth + login page + tenant resolution middleware
9. → MCP server endpoint at /mcp
10. → Tenant-private routes: /properties, /deals, /opportunities

### Real data sources (citations)

- **IDESCAT** — Generalitat de Catalunya statistics institute. Municipality
  population: https://www.idescat.cat/emex/. Comarca data:
  https://www.idescat.cat/codis/?id=50&n=9
- **Generalitat Habitatge** — rent prices, zona tensionada declarations:
  https://habitatge.gencat.cat/ca/dades/
- **SERPAVI** (Mivau) — national rent reference index:
  https://serpavi.mivau.gob.es/
- **BOE-A-2024-5214** — original zona tensionada regime (15-03-2024)
- **BOE-A-2025-7279** — 2025 SERPAVI methodology update (10-04-2025)
- **Idescat ICC GeoJSON** (open data) — comarca polygons:
  https://analisi.transparenciacatalunya.cat/
- **Idealista price index** — public quarterly reports per municipality
- **Fotocasa price index** — same, free monthly reports

### Open questions deferred

- How does the agent enroll an MCP key? (UI: settings page; for v1: hand-issue
  one in the DB and paste into agent config)
- Multi-region: do we ever go beyond Catalonia? Plan stays YAGNI until tenant 2.
- Deal-stage state machine: are stages user-configurable or fixed? V1: fixed.
- Pricing/billing for non-Albert tenants: out of scope until first paying user.

---

# /autoplan Review — Phase 1 (CEO)

Generated: 2026-04-28 | Branch: main | Mode override: SELECTIVE EXPANSION (auto-decided per autoplan principles)

## Step 0A. Premise Challenge

The plan rests on five premises. Three are wrong or unverified:

| # | Premise | Verdict | Why |
|---|---------|---------|-----|
| P1 | "Find a flat under €250k that pencils as a rental" is the JTBD | ✅ valid | Stated in opening paragraph, consistent throughout |
| P2 | A Palantir-style map dashboard is the most direct path to that JTBD | ❌ ASSUMED | The actual decision bottleneck is finding underpriced listings fast + verifying they aren't wrecks/occupied/illegal. Map UX doesn't solve either |
| P3 | `gross_yield = neighborhood_avg_rent × m² × 12 / price` is meaningful | ❌ WRONG | Per-unit rent depends on floor, light, condition, lift, parking, building. Neighborhood avg can be off by 30-40% per unit. Worse, in Catalonia's *zonas tensionadas* (Llei 12/2023, BOE 15-03-2024 + 10-04-2025), the legal rent ceiling is set by the **índex de referència de preus de lloguer** at unit-level granularity — not neighborhood averages. **Not mentioned anywhere in the plan** |
| P4 | Habitaclia + Fotocasa + Solvia are friendlier scrape targets than Idealista | ❌ INCOHERENT | Fotocasa and Habitaclia are both **Adevinta Spain** subsidiaries (same corporate parent as Idealista's competitor InfoJobs et al). Fotocasa robots.txt disallows /property/ and /search/. Habitaclia's legal terms forbid automated reproduction. The "Idealista is hostile, others are fine" distinction is wrong |
| P5 | OpenClaw is a stable bet for the chat surface | ❌ UNVALIDATED | Plan admits Wave 8 hasn't even run `openclaw --help`. Telegram is the day-1 channel anyway. `node-telegram-bot-api` is 10 years stable, ~50 LOC for the bot |

**Two derived premises also fail:**
- "30 per-city agency-finder agents will produce real data" — verifying HTTP-200 ≠ verifying agency exists, is open, specializes in sales, or is investor-relevant. Will fabricate at meaningful rate.
- "5,000 listings is the right corpus" — Albert needs the ~50 that match his filter, refreshed. 5k is vanity scope.

## Step 0B. Existing Code Leverage

There is no existing code (empty repo, no commits). But there ARE existing TOOLS the plan reinvents:

| Sub-problem | Plan's solution | What already exists |
|-------------|-----------------|---------------------|
| Listings data | 4 custom scrapers (Habitaclia, Fotocasa, Solvia, api.cat) | **DataVenues** sells licensed Fotocasa+Habitaclia+Milanuncios daily feeds with API. **Idealista pro** API. **Apify/Bright Data** managed scraping |
| Yield math | Custom rules engine | **Catalonia índex de referència** is the binding number for *zonas tensionadas* (free Generalitat API), and it's per-unit, not per-neighborhood |
| Chat surface | OpenClaw daemon | `node-telegram-bot-api` (50 LOC), or just the Telegram Bot API directly |
| Map UI | Maplibre + custom hex layer + 8 frontend modules | **Idealista's own map**, **Habitaclia's own map**, plus 50-line `folium` notebook for one-shot exploration |
| Agency directory | 30 city-by-city subagents | Manual: 20 min per shortlist town, when you actually need it |
| Per-listing condition/yield commentary | Rules engine (was AI batch) | Just a checklist field "verified yes/no" + manual notes — only matters for the ~50 that pass filters |

## Step 0C. Dream State Mapping

```
  CURRENT STATE              THIS PLAN              12-MONTH IDEAL
  ─────────────              ─────────              ──────────────
  Spreadsheets +     ──▶    Bruixola:    ──▶      Albert OWNS the flat.
  prior research            55 subagents,           Closing the loop:
  shortlists across         hex map UI,             flat → tenant → P&L.
  14 zones, no map,         Telegram bot,           The intelligence
  no yield math,            agency CSV,             work is OVER.
  staleness                 OpenClaw daemon
                            
                            ⚠ Delta does not       The 12-month ideal is
                            point at the ideal —    NOT "more dashboard."
                            it points at a tool     It is a closed deal +
                            that simulates          a maintenance habit.
                            progress.
```

## Step 0C-bis. Implementation Alternatives (MANDATORY)

Three approaches considered. The plan's approach is **Approach C (the cathedral)**.

```
APPROACH A: Spreadsheet + Saved Searches (the actually-minimal viable)
  Summary: Use Idealista/Habitaclia/Fotocasa saved-search alerts (RSS or email)
           into a Google Sheet with formula columns for yield range and rent-cap
           ceiling. Manually curate 10-20 agencies per shortlist town when needed.
  Effort:  S (human: 1 weekend / CC: 4 hours)
  Risk:    Low — no scrapers, no infra, no ToS exposure
  Pros:    Ships in days, zero maintenance drag, rent-cap aware via manual lookup,
           no fabrication risk, no dependency on OpenClaw
  Cons:    Manual yield input per listing, no map (unimportant for one buyer),
           filter UX is sheet-tier
  Reuses:  Existing portal alerting, existing rent index lookups

APPROACH B: Notebook + Telegram Bot (the pragmatic v0)
  Summary: One licensed data source (DataVenues feed OR one careful scraper with
           proper rate limits and rotated UA). DuckDB + Polars notebook for
           filtering & yield. node-telegram-bot-api 50-line bot polls daily for
           NEW matches against a saved filter and DMs Albert. Yield shown as a
           RANGE (P25-P75) gated against the índex de referència ceiling.
  Effort:  M (human: 1 week / CC: 1 day)
  Risk:    Medium — single scraper or paid feed cost, but recoverable
  Pros:    Real automation where it pays (new-match notifications), rent-cap
           aware (legally correct yields), no agency wave (manual when needed),
           no OpenClaw, no Vercel, no 8-module frontend, no 30 agency agents
  Cons:    No dashboard for browsing. Filter changes require notebook edit.
           Trades visual polish for correctness
  Reuses:  DuckDB+Polars idiom, Telegram Bot API, índex de referència API

APPROACH C: Bruixola as planned (the cathedral)
  Summary: 55 subagents, 4 scrapers, 8 frontend modules, OpenClaw daemon,
           agency-finder wave, hex map, price-history tab, dual deploy.
  Effort:  XL (human: 200+ hours / CC: ~30-40 hours)
  Risk:    HIGH — ToS exposure on Adevinta-owned scrapes, OpenClaw unproven,
           agency fabrication, yield math wrong without rent-cap integration,
           maintenance drag will kill it before it pays back
  Pros:    Genuinely impressive build, design reusable as portfolio piece,
           map UI is satisfying, the chat surface is a fun surface
  Cons:    Solves a job ("browse intelligence") that isn't the actual
           bottleneck ("which 5 flats should I view this weekend"). Yield
           presented as single number = false confidence. Agency directory
           rots fast. By month 3, dashboard is opened weekly, then never
  Reuses:  Mostly net-new. Plan deliberately avoids LLM/Claude SDK (good).
           Maplibre + DuckDB + Hono are all sound primitives
```

**RECOMMENDATION (auto-decided per autoplan principle: but flagged as User Challenge):**

Codex says: **Approach B**. Subagent says: **Approach A → only graduate to B if needed**. Both reject Approach C as builder-itch + scope-disproportionate to one buyer.

Per autoplan rule: when both models recommend changing the user's stated direction (here: drastic scope reduction), this is a **User Challenge**. The original direction (Approach C) stands unless the user explicitly changes it. Surfaced at premise gate below.

## Step 0D. Mode-Specific Analysis (SELECTIVE EXPANSION)

Mode override per autoplan principles: SELECTIVE EXPANSION. But both outside voices recommend **SCOPE REDUCTION**. Honest read: the right mode here is REDUCTION, not EXPANSION.

**Complexity check (HOLD-mode prerequisite):** Plan touches >50 files across 9 waves. Threshold (8 files / 2 services) blown by an order of magnitude. Strong scope-reduction smell.

**Minimum set of changes that achieves the goal of "find a flat that pencils":**
- Listings: one source (paid feed preferred — DataVenues), saved-filter slice only (~50 listings, not 5k)
- Yield: range (P25-P75 of comps within 500m and ±20% m²), gated against índex de referència
- Notification: Telegram bot DMs new matches daily
- Decision log: a `decisions.md` file Albert maintains by hand (one line per viewing)

That's the unglamorous path. Nothing else is load-bearing for the actual JTBD.

**Cherry-pick candidates (if user holds Approach C and wants tasteful additions):**

1. **Rent-cap-aware yield** — integrate Generalitat índex de referència API. Effort: S (1 day CC). Impact: makes yield math LEGALLY correct. **Non-negotiable if any version ships.**
2. **Yield as range, not point estimate** — UI shows P25-P75 with explicit "verify with comps" disclaimer. Effort: S. Impact: kills false confidence.
3. **"UNVERIFIED" checklist on listing detail** — call agent / check cadastre / request community minutes / check derrama. Effort: S. Impact: counters info asymmetry that scrapers can't see.
4. **Decision log as a first-class data type** — viewings, calls, offers persisted with photos+notes. Effort: M. Impact: this is the *actual* tool that buys a flat — closing the loop between intelligence and action.
5. **Drop OpenClaw, use node-telegram-bot-api directly** — Effort: -L (savings). Impact: removes unproven dependency.

## Step 0E. Temporal Interrogation

If Albert builds Approach C as planned:
- **Hour 1-3 (foundation):** Bun workspaces work, Hono+DuckDB happy path, schema in Pydantic+Zod. Smooth.
- **Hour 4-8 (scrapers):** Habitaclia 403s start, Cloudflare interstitials, Playwright fallback hits selectors that change weekly. Eats 2-3 days alone.
- **Hour 9-15 (geo+derive):** Nominatim rate-limited, OSRM container ~500MB, HUT registry HTML structure changes. Yield math goes in unaware of índex de referència.
- **Hour 16-25 (frontend):** Maplibre + hex layer + 8 modules + Palantir tokens. Genuinely fun, several days.
- **Hour 26-30 (OpenClaw):** Reads docs, finds API surface differs from plan, rewrites tool registration. Maybe doesn't work cloud-side as expected.
- **Hour 31-40 (agency wave):** 30 subagents emit ~1500 rows. Spot-check reveals 30%+ are dead numbers, wrong specialties, or fabricated. Drops the wave.
- **Hour 41+ (maintenance):** Scrapers break monthly. Albert opens the dashboard 3x in week 1, 1x in week 4, never in month 3.

## Step 0.5. Dual Voices

### CLAUDE SUBAGENT (CEO — strategic independence)

> "Bruixola as planned is a 200-hour build that will not make Albert buy a better flat than a 4-hour spreadsheet would. The yield math is misleading without the *índex de referència* and per-unit comp ranges; the agency directory will be 30% fabricated; the scrapers will break; the dashboard will be abandoned by month 3."
>
> Critical findings:
> - Wrong problem framing (intelligence dashboard vs deal pipeline)
> - Yield as single number is precision theater; needs to be a P25-P75 range
> - Idealista exclusion is incoherent (same corporate family as Fotocasa/Habitaclia)
> - 55-subagent scope is YAGNI catastrophe for one user
> - Catalonia rent-cap law (Llei 12/2023) makes plan's yield math legally wrong
> - OpenClaw is unproven; node-telegram-bot-api is decade-stable for 50 LOC
> - Information asymmetry the scraper cannot close (derrama, hoarder neighbor, cadastre disagreement)
>
> **Verdict: Build a simpler version first — and seriously consider Reframe.**

### CODEX SAYS (CEO — strategy challenge)

> "The real problem is not 'build Bruixola.' It is 'shortlist 20 legally rentable targets and contact the right people faster.' v0 should be one source, one table, no OpenClaw, no agency-scraper swarm, no map-first UI, and a hard rule that any yield without the applicable rent cap is marked unknown, not computed."
>
> Citations confirm:
> - BOE-A-2024-5214 (zonas tensionadas regime, 15-03-2024) and BOE-A-2025-7279 (10-04-2025 update) make per-unit rent index the binding number, not neighborhood averages
> - Fotocasa robots.txt disallows /property/ and /search/; Habitaclia legal terms forbid reproduction; both under same Adevinta umbrella
> - DataVenues openly licenses Fotocasa+Habitaclia+Milanuncios daily feeds as a paid alternative
> - OpenClaw GitHub issues 59006, 59079, 21083 (Feb-Apr 2026) report approval timeouts and update regressions breaking exec for existing setups
>
> **Verdict: Build simpler v0 first.**

### CEO Dual Voices — Consensus Table

```
═══════════════════════════════════════════════════════════════════════
  Dimension                                Claude  Codex  Consensus
  ──────────────────────────────────────── ─────── ─────── ─────────
  1. Premises valid?                       NO      NO      CONFIRMED-NO
  2. Right problem to solve?               NO      NO      CONFIRMED-NO (reframe to deal pipeline)
  3. Scope calibration correct?            NO      NO      CONFIRMED-NO (drastic over-scope)
  4. Alternatives sufficiently explored?   NO      NO      CONFIRMED-NO (DataVenues, sheet, paid Idealista, buyer's agent ignored)
  5. Competitive/market risks covered?     NO      NO      CONFIRMED-NO (rent-cap law, ToS, Adevinta consolidation)
  6. 6-month trajectory sound?             NO      NO      CONFIRMED-NO (maintenance drag → abandonment)
═══════════════════════════════════════════════════════════════════════
6/6 CONFIRMED-NO. Zero disagreements. This is the strongest possible
adversarial signal — both models, given different prompts and zero shared
context, converged on identical conclusions.
```

## CEO Phase Verdict + Premise Gate Decision

Both outside voices independently recommended scope reduction. Albert (user) **held scope as written** at the premise gate (2026-04-28). Per autoplan User Sovereignty rule, the dual-voice findings remain on record but do not reshape the rest of the review. Phases 2/3/3.5 review the plan as written, focusing on tactical gaps within scope.

**Audit trail entry:** Premise gate / User Challenge — Both models recommended Approach B (notebook + Telegram bot). User held Approach C (Bruixola as written). Classification: User Challenge. Resolution: User direction stands. Models' findings persisted in this document for future reference.

---

# /autoplan Review — Phase 2 (Design)

Generated: 2026-04-28 | Mode: Atlas-chrome ported onto Bruixola-data (per user direction post-premise-gate) | Outside voices: skipped per user direction at premise gate

## Step 0. Design Scope Assessment

**What exists on disk** (`design/`):
- `atlas-v2.css` — design system (warm graphite + amber + cyan/green/red accents; Instrument Serif + Inter Tight + JetBrains Mono; glass panels; rail; map chrome; KPI strip; callout)
- 4 artboard components: `atlas-A-cockpit.jsx` (live map + activity stream), `atlas-B-dossier.jsx` (drilldown view), `atlas-C-terminal.jsx` (max-density grid), `atlas-D-query.jsx` (NL command)
- `atlas-primitives.jsx` — icons, sparklines, time series, histogram, glyphs

**Initial design completeness: 7/10** — visual system is highly resolved (palette tokens, type scale, density philosophy, glass-panel pattern, callout-with-stem, KPI sparklines, activity-feed sigils). What's missing: any of it dressed in Catalan residential data, mobile breakpoint, state coverage (loading/empty/error/partial), accessibility audit, *zona tensionada* legal overlay, residential domain entities (HUT license, derrama, cadastre, gestoría).

## Pass 1 — Information Hierarchy (rating: 4/10 for residential fit)

The Atlas KPI strip (Portfolio NOI · ttm · $284.1M / Occupancy 91.4% / Cap rate 5.62% / Pipeline 128 deals / Risk index 62) is a **multi-property portfolio operator's dashboard**. For one buyer of one €250k flat, **none** of those metrics make sense ported as-is.

**Required residential reimagining of the KPI strip:**

| Atlas KPI (CRE) | Bruixola equivalent (residential, one buyer) |
|---|---|
| Portfolio NOI · ttm | New listings · 24h matching saved filter |
| Occupancy | Yield range · top 10 candidates (P25-P75) |
| Cap rate · weighted | Médian price/m² · saved filter neighborhoods |
| Pipeline · screening | Visits scheduled this week + offers outstanding |
| Risk index | Days since last successful scrape (data freshness) |

Without that swap, the dashboard ships dressed in finance-bro chrome but answers the wrong questions.

**Severity: HIGH.** Information hierarchy is the most load-bearing single decision in this design.

## Pass 2 — Interaction State Coverage (rating: 2/10)

The Atlas mocks show the **happy state, fully populated, with realistic data**. Zero coverage of:

| Feature | LOADING | EMPTY | ERROR | PARTIAL | SUCCESS |
|---|---|---|---|---|---|
| Map | ❌ no skeleton | ❌ no "no results" | ❌ no tile-fail | ❌ no "12/50 geocoded" | ✅ |
| Listings table | ❌ | ❌ no "no matches for filters" | ❌ no scrape-stale banner | ❌ | ✅ |
| Detail dossier | ❌ | ❌ | ❌ no "image fetch failed" | ❌ no "no comparable rentals found" | ✅ |
| Activity feed | ❌ | ❌ no "no events 24h" | ❌ | ❌ | ✅ |
| OpenClaw chat | ❌ no "agent thinking" | ❌ | ❌ no "agent down" | ❌ | ✅ |
| Strategy panel | ❌ | ❌ | ❌ | ❌ | ✅ |
| Yield calc | ❌ | ❌ no "no comps" | ❌ | ⚠ partial only with disclaimer | ✅ |

**Severity: CRITICAL.** This is the dimension where the design will most violently meet reality. Scrapers fail. Geocoder rate-limits. Image hosts 404. OpenClaw daemon restarts. Saved filters return zero. Every single one of those needs a state. Plan and Atlas both silent.

## Pass 3 — User Journey Coherence (rating: 5/10)

Atlas's implicit journey: **Cockpit → callout → dossier → pipeline.** That's a portfolio operator's monitoring loop.

Albert's actual journey for Bruixola, traced:
```
  open dashboard → "anything new?" (24h activity)
       ↓
  yes: 3 new matches in saved filter
       ↓
  click candidate → dossier:
       ├── photos (6+, real not stock)
       ├── yield range (P25-P75) gated against ZONA TENSIONADA ceiling
       ├── comparable rentals within 500m (3-5)
       ├── walk_to_metro/hospital/beach
       ├── condition_label + okupa_risk
       ├── HUT license joined-or-not
       ├── 3 nearest agencies (with sales-vs-rentals tag)
       └── UNVERIFIED checklist (call · cadastre · community · derrama)
       ↓
  decide: ★ shortlist OR ✗ kill OR ⚑ "ask OpenClaw to text me when price drops"
       ↓
  end-of-week: shortlist → schedule viewings via WhatsApp to agencies
       ↓
  post-viewing: log to decisions.md
```

The plan describes the entities but not the **arc**. The Atlas mocks describe the chrome but not the residential arc. Neither artifact maps the actual Albert-buys-a-flat user journey end-to-end. **Severity: HIGH.**

## Pass 4 — Specificity (rating: 6/10 for chrome, 1/10 for domain content)

Atlas chrome is gloriously specific (488 Brannan, BREP IX, "eight floors above the rail yard," $98-112M ±7% · 3 models, DCF 38% / Comp 32% / Cap 22% / Replacement 8%). Best-in-class.

Bruixola equivalents missing entirely. The dossier needs a Spanish-residential parallel, e.g.:
> **Carrer de Mallorca, 412 · El Clot · Barcelona** · APN cadastre 9874621-DF · 78m² · 3 hab · 1 bany · planta 3 amb ascensor · construït 1962 · reformat 2014 · ETE classe D · €198k · agència propietària: Finques Penedès · agència captadora: La Llar · *zona tensionada* SÍ · sostre lloguer mensual segons índex SERPAVI: **€11.40/m²/mes** (€889/mes) · darrera transacció edifici 2018 · €175k.

The plan has the **schema** for that level of specificity (`Listing.condition_label`, `okupa_risk`, etc.). The design has the **typography** for it. Neither has the actual **specimen mock** showing all of it composed. **Severity: HIGH.**

## Pass 5 — Design System Alignment (rating: 8/10 for visual, 4/10 for domain)

Atlas tokens applied to Bruixola surfaces:
- **Background**: `--bg-0 #0a0c0a` → use directly. Warm graphite is a better choice than the plan's `#0a0e14` cyan-leaning. ✅
- **Accent**: `--amber #e8b25c` for primary signals (new matches, saved filters, KPI deltas). ✅. **But**: amber for "good news" reads US-financial. For Catalan residential, **green (`--good #8cc06f`) for "yield exceeds threshold"** and **amber for "watch this"** maps better.
- **Typography**: Instrument Serif + Inter Tight + JetBrains Mono. The mix is sophisticated. Use serif italic for AI-suggest copy ("Tres senyals a Sant Andreu en 24h. Vols que t'enviï la fitxa?"). Use mono for prices/areas/yields. Use sans tight for body. ✅
- **Glass panel pattern**: directly portable. ✅
- **Severity sigils** on activity rows (`hot/amber/warn/good/empty`): portable, but rename event types — see Pass 7 below.
- **Domain mismatch**: Atlas's RBA / WALT / NOI / cap rate UI patterns won't have direct residential equivalents. Need to design new patterns for: yield range bar (P25-P75 with ceiling line), HUT license badge, *zona tensionada* indicator, condition_label chip, okupa_risk gauge.

**Severity: MEDIUM.** Visual system holds; domain UI patterns need design work that doesn't exist yet.

## Pass 6 — Responsive Intention (rating: 1/10)

Atlas artboards are 1600×980. The plan never mentions a mobile breakpoint. Albert has explicitly said the messaging surface is mobile-first (Telegram bot from his phone). But:

- Will he **also** open the dashboard on his phone before/during a flat viewing? Almost certainly yes (he'll want to glance at yield, agency phone, comparable rentals while standing in the apartment).
- Map + sidebar + table + detail-dossier layout is impossible at 375px width without a different IA.

**Required design work that doesn't exist:**
- Mobile IA: probably listing-first (table/list view), tap → detail dossier full-screen, map as a secondary tab not the entry surface.
- Tablet (Albert on his iPad on the couch researching): can keep map+list split.
- Desktop (deep research session): full Atlas chrome.

**Severity: HIGH.** Mobile is not "nice to have" — it's where Albert will use the dossier most.

## Pass 7 — Accessibility (rating: 4/10)

Spot-checks against `atlas-v2.css`:
- Body on bg-0: `--ink-1 #c9c8c0` on `#0a0c0a` → contrast ~13:1 ✅ (passes AAA)
- Dim body: `--ink-2 #8a8b85` on `#0a0c0a` → ~7:1 ✅ (passes AAA)
- Dimmer body: `--ink-3 #5a5d57` on `#0a0c0a` → ~3.6:1 ❌ **fails WCAG AA for body text** (needs 4.5:1)
- Faintest: `--ink-4 #3a3d38` on `#0a0c0a` → ~1.9:1 ❌ **fails everything** (only OK for decorative)
- The mocks use `--ink-3` and `--ink-4` for many text elements (eyebrows, dim labels, inactive items). Real concern at this scale.

Other gaps:
- **Animations**: `@keyframes pulse` runs unconditionally. Need `@media (prefers-reduced-motion: reduce)` short-circuit.
- **Focus states**: zero `:focus-visible` rules in the CSS. Keyboard navigation will be invisible.
- **Touch targets**: `.rail-item { height: 48px }` ✅. But `.btn` and `.chip` heights unspecified — likely under 44px minimum.
- **Heat legend**: ramp uses color only ("`−6%` `0` `+8%`") — no pattern/icon backup for color-blind users. Severity matters less since this is single-user, but the legend itself is colorblind-hostile.

**Severity: MEDIUM** for single-user. Would be HIGH if shared.

## Domain-Specific Findings (residential-Catalan-specific, neither artifact addresses)

These are findings the autoplan rules don't have a numbered pass for, but matter for getting the design right:

### F1 — Activity event taxonomy needs a residential rewrite
Atlas events: `PERMIT / COMP / LEASE / OWNER / FILING / TAX / TRANSIT / NEWS`. Bruixola equivalents:
- `NEW LISTING` (matches saved filter)
- `PRICE DROP` (≥3% from initial) — the most actionable event in residential
- `SOLD/REMOVED` (helpful: confirms market clearing)
- `HUT LICENSE GRANTED` (coastal towns, specific addresses) — gold for STR thesis
- `RENT-CAP UPDATE` (índex de referència revision) — happens annually + ad-hoc
- `NEW REVIEW` (Idealista/Habitaclia review of agency)
- `PORTAL CHANGE` (your scraper noticed this listing's price/m² changed) — useful internal signal
- `ZONE STATUS CHANGE` (municipality enters/exits *zona tensionada*) — rare but legally massive

### F2 — Map layer set needs residential rewrite
Drop: `Permits`, `Owners`, `Filings`, `Crime` (no good Catalonia data source).
Keep + adapt: `Heat`, `Streets`, `Comps`, `Transit (GTFS Barcelona/SCG)`, `Topography`.
Add (residential-critical):
- **Zona tensionada boundary** (default ON) — *the* legal overlay
- **HUT license density** (heatmap of registered short-term rentals)
- **Walk-to-hospital** isochrones (Bellvitge thesis)
- **Distance-to-beach** isochrones (coastal STR thesis)
- **University corridors** (Reus URV, UAB Bellaterra — student rental thesis)

### F3 — The dossier needs a UNVERIFIED checklist as a first-class component
Plan mentions "every listing detail view should display 'UNVERIFIED' as a checklist." Atlas dossier has none of this — it has model-confidence histograms instead. For a one-buyer residential context where info-asymmetry is the dominant risk, the UNVERIFIED checklist replaces the Atlas-style "model contributions" panel.

Suggested design:
```
  ☐ Called listing agent (date · notes)
  ☐ Pulled cadastral record (m² match? no charges?)
  ☐ Requested community minutes (last 24mo · derrama upcoming?)
  ☐ Visited in person (date · photos)
  ☐ Verified HUT license OR confirmed not needed
  ☐ Cross-checked zona tensionada status + applicable index
  ☐ Pulled energy certificate (ETE)
  ☐ Estimated reform cost (if condition_label = reform_needed)
```

### F4 — AI Suggest pattern is the bridge to OpenClaw
Atlas's "Atlas suggest" panel ("Three signals on 488 Brannan within 24h. Want me to assemble a deal memo?") is the architectural bridge to OpenClaw. The in-dashboard AI Suggest can pre-stage prompts that the user can fire to OpenClaw via Telegram. Pattern translation:
> "Tres senyals nous al pis Sant Andreu 142 · 24h. Vols que et marqui per a visita?" [Yes · push to viewing list] [Show signals]

This unifies the dashboard and the Telegram bot under one cognitive model: **the dashboard surfaces, OpenClaw acts.**

### F5 — Yield range visualization doesn't exist yet
Atlas dossier has a histogram + scenario rows for valuation models. Bruixola needs a different visualization: **yield range bar with legal ceiling line**.

Suggested:
```
  YIELD ESTIMATE · LEGALLY-CAPPED
  
  ├── P25 ──────── P50 ──────── P75 ──┤
       4.8%       6.1%       7.2%
                              ▲
                              │ legal ceiling per índex SERPAVI: 6.4%
                              │ (P75 may not be lawfully achievable)
  
  Comp set: 12 rentals · same neighborhood · 78m² ±20% · last 90d
```

This is the single most important UI atom Bruixola adds beyond Atlas. Plan and design both lack it.

## Design Litmus Scorecard (no dual voices, single-reviewer)

```
═══════════════════════════════════════════════════════════════════════
  Dimension                     Atlas     Bruixola-fit  Gap
                                (chrome)  (after port)
  ──────────────────────────── ───────── ─────────────── ──────
  1. Info hierarchy              9         4              HIGH — KPI strip needs full residential rewrite
  2. State coverage              2         2              CRITICAL — neither artifact specifies states
  3. Journey coherence           7         5              HIGH — residential journey not mapped end-to-end
  4. Specificity                 9         1              HIGH — Bruixola specimens missing
  5. Design system alignment     8         8              MEDIUM — visual holds, domain UI patterns to design
  6. Responsive                  3         1              HIGH — desktop-only across both
  7. Accessibility               6         4              MEDIUM — ink-3/4 fails AA, no reduced-motion, no focus
═══════════════════════════════════════════════════════════════════════
Overall design completeness for Bruixola: 4/10
Atlas chrome quality: 8/10 (excellent visual system)
Port effort: M (1-2 weeks design work) before any frontend code is meaningful
```

## Phase 2 Design Verdict

The Atlas visual system is genuinely strong — a worthwhile foundation. But porting it to Bruixola is a **substantial design pass that doesn't exist yet**, not a token swap. Before Wave 5/6 frontend agents do anything useful, you need:

1. **Residential KPI strip mock** (5 metrics that actually inform Albert's decisions)
2. **State coverage spec** (loading/empty/error/partial for every panel — at least a state-table doc)
3. **Mobile breakpoint design** (listing-first on phone)
4. **Yield-range-with-legal-ceiling** visualization atom
5. **UNVERIFIED checklist** component spec
6. **Residential map layer set** with *zona tensionada* default-on
7. **Spanish-language specimen** of cockpit, dossier, terminal, query in actual Catalan/Spanish
8. **Accessibility pass** on `--ink-3`/`--ink-4` usage; add focus-visible + prefers-reduced-motion

These are not Wave 5/6 tasks — they're prerequisite design work. Otherwise frontend agents will faithfully build chrome that points at the wrong job.

**Estimated additional design time before frontend code starts paying back: 1-2 weeks human / 1-3 days CC if structured as design-html iterations.**

---

## Phase 2 Reframing (mid-review user clarification, 2026-04-28)

User clarified: the product framing is **"Palantir for real estate, capped to Catalonia territory"** — i.e., a platform-grade intelligence product geographically scoped to Catalonia, not a single-buyer personal tool. The plan's prose about hunting €250k buy-to-rent flats is **one investment thesis / one saved filter**, not the entire product JTBD.

**Implications back-applied to Phase 1 + Phase 2 findings:**
- CEO scope-reduction critique (1-buyer-doesn't-need-55-subagents) **partially obsoletes** at platform scale.
- Atlas's institutional CRE chrome (KPI strip, multi-event activity stream, 9-layer map, callout-with-stem dossier) is now **register-appropriate**, not borrowed visual. Stays.
- Multi-thesis platform thinking changes domain UI atoms: instead of one yield calc, support multiple investment theses (buy-to-rent residential €<250k / coastal STR with HUT / hospital-staff long-let / student long-let / value-add reform). Each thesis is a saved-filter + yield-formula pair.
- Multi-user thinking surfaces: API auth, per-user filters, role gates, audit log become real concerns (now in Phase 3 scope).
- Catalonia inventory ceiling: scale target shifts from 5k listings → ~30-50k active Catalan listings at any time. Performance assumptions need adjusting.
- Naming open: design says "Atlas," plan says "Bruixola." Defer to final gate.

**Phase 2 findings that survive intact under reframing:**
- State coverage (loading/empty/error/partial) — CRITICAL regardless
- Mobile breakpoint — HIGH, more important at multi-user scale
- Accessibility (`--ink-3`/`--ink-4` AA fail) — MEDIUM, becomes HIGH if platform has external users
- *Zona tensionada* legal overlay default-on — CRITICAL
- Yield-range-with-legal-ceiling visualization atom — CRITICAL
- UNVERIFIED checklist — CRITICAL (info asymmetry doesn't go away because it's a platform)
- Residential map layer set (drop CRE layers like Permits/Filings, add HUT density / hospital isochrones / *zona tensionada* / university corridors) — HIGH
- Activity event taxonomy rewrite (NEW LISTING / PRICE DROP / SOLD / HUT GRANTED / RENT-CAP UPDATE / etc.) — HIGH
- Spanish-language specimen mocks (cockpit + dossier + terminal + query in actual Catalan/Spanish content) — HIGH

---

# /autoplan Review — Phase 3 (Engineering)

Generated: 2026-04-28 | Mode: Atlas-as-Catalonia-platform (post-reframing) | Outside voices: skipped per user direction

## Step 0. Scope Challenge

There is no existing code to map sub-problems against — empty repo. The "what already exists" review collapses to "nothing in this repo; assess external building blocks":

| Sub-problem | Plan's chosen building block | Verdict |
|---|---|---|
| Listings ingestion | 4 custom Python scrapers | LEGAL RISK (Adevinta ToS); **paid feed (DataVenues / Idealista Pro) is the platform-grade move** |
| Storage | DuckDB + CSV | OK at 50k rows; revisit at 500k. **No backup strategy specified — critical gap** |
| API | Hono on Bun | Fine. Hono is sound, Bun stable enough for Fly. |
| Geocoding | Nominatim with local cache | Free-tier 1 req/sec is the bottleneck. **5k listings = 85 min cold start; 50k = 14 hours.** Plan silent on warm-start strategy |
| Yield math | Custom rules | **Wrong without índex de referència integration** (carryover from Phase 1) |
| Walk times | OSRM container | OK. ~500MB image, regional dataset another ~100MB |
| Chat | OpenClaw daemon | UNPROVEN (Phase 1 carryover). 50-LOC `node-telegram-bot-api` is the safer move; the plan's anti-`anthropic` constraint is fine to honor without OpenClaw |
| Frontend | Vite + React 19 + Maplibre + shadcn | All sound primitives |
| Deploy | Fly.io single machine + Vercel | Fine for v1. **Single-machine = SPOF; document as accepted risk for now** |

**Complexity check (>8 files / >2 services smell):** Plan blows the threshold by ~10×. At platform-scale (post-reframing), this is more justifiable, but still not free. The 30-per-city agency wave remains the single weakest scope element regardless of reframing.

## Section 1 — Architecture

### Dependency graph
```
                        ┌──────────────────────────────────┐
                        │   Scrapers (Python / uv / httpx) │
                        │   ─ habitaclia ─ fotocasa        │
                        │   ─ solvia ─ api.cat             │
                        │   ─ agency-finders × 30 cities   │
                        │   ─ HUT registry ─ price index   │
                        └────────────┬─────────────────────┘
                                     │ writes
                                     ▼
                  ┌─────────────────────────────────────────┐
                  │  data/ (persistent volume on Fly)       │
                  │   ─ csv/ ◄── source of truth            │
                  │   ─ db/intel.duckdb ◄── derived view    │
                  │   ─ images/ ◄── ~120-200GB at scale     │
                  └────┬────────────────────────────────┬───┘
                       │ reads                          │ reads
                       ▼                                ▼
        ┌──────────────────────────┐       ┌──────────────────────────┐
        │  apps/api (Bun + Hono)   │       │  OpenClaw daemon         │
        │   /listings  /tools/*    │◄──────│   (localhost only)       │
        │   /cities    /agencies   │  HTTP │                          │
        │   /strategies /comps     │       │  ─ Telegram channel      │
        │   /price-history         │       │  ─ tool reg: bruixola.* │
        └─────┬──────────────┬─────┘       └────────┬─────────────────┘
              │ HTTPS         │ HTTPS                │
              ▼               ▼                      ▼
        ┌──────────┐   ┌─────────────┐        ┌──────────────────┐
        │  Vercel  │   │  Browsers   │        │  Telegram        │
        │  static  │   │   web app   │        │  bot users       │
        │  React   │   │             │        │                  │
        └──────────┘   └─────────────┘        └──────────────────┘
```

### Findings

**A1. Scraper write contention** — 4 scrapers + 30 agency-finders + HUT scraper + price-index scraper all writing to `data/csv/*.csv` and `data/db/intel.duckdb`. **No write-coordination strategy specified.** At platform scale this corrupts data.
- **Fix**: each scraper writes to `staging/{source}-{date}.csv`, then a single transactional merge job reconciles into canonical `csv/listings.csv`. DuckDB rebuilt from CSV at end of each refresh window. Add file lock or single-writer queue for the merge job. **Severity: CRITICAL.**

**A2. CSV ↔ DuckDB source-of-truth ambiguity** — Plan says "CSV as source-of-truth, DuckDB queries it." But derived columns (`gross_yield_pct`, `walk_to_metro_min`, `condition_label`) — are those persisted in CSV, in a parallel CSV, or recomputed at query time? Plan silent.
- **Fix**: split into raw vs derived. `csv/raw_listings.csv` (scraped) + `csv/derived_listings.csv` (after derive.py). DuckDB views join them. Recompute on every refresh. Document in `packages/scrapers/src/pipeline.py` header. **Severity: HIGH.**

**A3. Cross-language schema drift** — Pydantic (Python) + Zod (TS) hand-maintained in `packages/shared`. **No sync mechanism specified.** First production data drift = silent breakage.
- **Fix (recommended)**: JSON Schema as source-of-truth in `packages/shared/schema/*.json`. Codegen Pydantic via `datamodel-code-generator`, codegen Zod via `json-schema-to-zod`. CI check that asserts re-codegen produces no diff. **Severity: HIGH.**

**A4. SPOF on single Fly machine** — API + OpenClaw on one machine. If it OOMs (likely with image processing), both surfaces die. Telegram bot stops responding mid-conversation.
- **Fix (accepted risk for v1)**: document as accepted SPOF. Add Fly auto-restart on health-check fail. Add Sentry / log-drain so failures are visible. **Severity: MEDIUM** for v1, becomes HIGH post-launch if external users join.

**A5. OpenClaw config secrets** — Plan: "openclaw/ committed to repo." If `openclaw/config.yaml` contains the Telegram bot token (channel auth), **secrets ship in git**.
- **Fix**: `openclaw/config.yaml.template` checked in; real config built at deploy from Fly secrets (`fly secrets set TELEGRAM_BOT_TOKEN=…`). `.gitignore` the actual `config.yaml`. **Severity: CRITICAL** if missed.

**A6. Multi-tenant readiness** (post-reframing) — Plan was written for one user. Now platform. No user model, no auth, no per-user state (saved filters, watchlist, decisions log).
- **Fix**: defer multi-tenant DB schema to post-v1, but **add API auth from day 1** (bearer token in `.env`, validated by Hono middleware on every `/tools/*` and `/listings*` route). Keeps third parties out of your scrape until you're ready. **Severity: HIGH** at platform framing.

### Section 1 — Architecture: 6 findings (1 CRITICAL, 3 HIGH, 1 MEDIUM, 1 noted)

## Section 2 — Code Quality (forward-looking — no code yet)

**C1. Pydantic + Zod duplication** — see A3.

**C2. Yield calc deterministic but untested** — `yield_calc.py` is the most legally consequential code in the system. Currently zero tests planned.
- **Fix**: 100% branch coverage required. Test cases must include: zona-tensionada-on / off, comparable count 0/1/3/12, m² ±20% boundary, P25/P50/P75 invariants, currency-edge €/m²/mes float precision, leap-year month math. **Severity: CRITICAL.**

**C3. `derive.py` regex rules need a fixture suite** — Spanish/Catalan natural-language rules for `condition_label` and `okupa_risk` are linguistically tricky. "reformat parcial" should NOT match "reformat integral." "Pendent de possessió" is okupa_risk=high. "Sense possessió" is okupa_risk=high. "Disponible des de juny" is okupa_risk=low even though "des de" can read as "without."
- **Fix**: golden-file test suite in `packages/scrapers/tests/derive_fixtures.csv` with 100+ scraped descriptions and expected labels. Run on every commit to derive.py. **Severity: HIGH.**

**C4. Plan has zero file-level signatures** — "critical files" list at the bottom is good (paths) but does not specify *function signatures*. At the autoplan-this-plan stage that's normal, but before Wave 2 ships, each `derive.py`/`yield_calc.py`/`pipeline.py` should have a typed function-signature spec in the plan.
- **Severity: LOW** at this phase. Move to TODOS for pre-Wave-2 prep.

## Section 3 — Test Review (CRITICAL — most underspecified part of the plan)

### Test diagram (every NEW codepath in the plan):

```
NEW DATA FLOWS:
  1. Scrape → raw_listings.csv → derive → derived_listings.csv → DuckDB rebuild
  2. Geocode: address → Nominatim → cache → lat/lng → DuckDB
  3. Walk-time: lat/lng → OSRM → seconds → DuckDB (per listing × 4 destinations)
  4. Yield: (price, m², neighborhood) → comp set → P25/P50/P75 → ceiling check → output
  5. HUT join: address normalize → cadastre lookup → license_id (or null)
  6. Image download: photo_url → bytes → S3 (Tigris) → thumbnail generation

NEW UX FLOWS:
  7. Open dashboard → see KPI strip + map + activity stream
  8. Apply filter → URL syncs → DuckDB query → table re-renders
  9. Click hex → table filters to neighborhood
  10. Click listing → detail dossier
  11. Strategy panel → click strategy → applies filter query
  12. Price History tab → 5y sparkline (with rent-cap-ceiling overlay)
  13. Telegram: text bot → OpenClaw routes → /tools/* → answer

NEW CODEPATHS / API ENDPOINTS:
  14. GET /listings (filtered, paginated)
  15. GET /listings/:id (detail)
  16. GET /cities, /regions, /neighborhoods
  17. GET /price-history?neighborhood_id=X&years=5
  18. GET /agencies?city=X
  19. GET /strategies, /strategies/:id
  20. GET /comps?listing_id=X
  21. POST /tools/search (OpenClaw)
  22. POST /tools/yield-for (OpenClaw)
  23. POST /tools/compare (OpenClaw)
  24. POST /tools/neighborhood (OpenClaw)
  25. POST /tools/agency-for (OpenClaw)

NEW INTEGRATIONS / EXTERNAL CALLS:
  26. Habitaclia / Fotocasa / Solvia / api.cat (HTTP scrape)
  27. Nominatim (geocode)
  28. OSRM (routing)
  29. Generalitat HUT registry
  30. Tigris S3 (image storage)
  31. Telegram Bot API (via OpenClaw)
  32. Generalitat índex de referència API (NEW — Phase 1 finding, not in original plan)

NEW BACKGROUND JOBS:
  33. Weekly scrape refresh (GH Actions cron)
  34. Image download queue
  35. Geocoder queue (rate-limited 1 req/sec)
  36. OSRM warm-cache job

NEW ERROR / RESCUE PATHS:
  37. Scraper 403 / Cloudflare → Playwright fallback
  38. Scraper hard-block → mark stale, alert
  39. Geocoder rate-limit → backoff + retry
  40. Image fetch fail → mark missing, dashboard shows placeholder
  41. OpenClaw daemon down → web-only mode
  42. DuckDB query timeout → 503 with retry hint
  43. Yield calc edge cases → return null + reason, never invent
```

### Test type matrix per item

| # | Item | Unit | Integ | E2E | Eval | Notes |
|---|---|------|-------|-----|------|-------|
| 1 | Scrape→derive→DuckDB rebuild | ✅ | ✅ | — | — | Derive rules need fixtures |
| 2 | Geocode | — | ✅ | — | — | Mock Nominatim; integration with cache |
| 3 | Walk-time | — | ✅ | — | — | Local OSRM container |
| 4 | Yield | ✅✅✅ | ✅ | — | — | **Highest priority — 100% branch** |
| 5 | HUT join | ✅ | ✅ | — | — | Address normalization fuzzy-match |
| 6 | Image dl | ✅ | ✅ | — | — | Retry, partial-fail, S3 corruption |
| 7-12 | UX flows | — | ✅ | ✅ | — | Playwright E2E for shortlist journey |
| 13 | Telegram round-trip | — | ✅ | ✅ | ✅ | E2E + eval the agent's tool-call accuracy |
| 14-25 | API endpoints | ✅ | ✅ | — | — | Each endpoint: happy + 4xx + 5xx + edge |
| 21-25 | /tools/* schema | ✅ | ✅ | — | ✅ | Schema validation + agent eval suite |

**Coverage: 0/43 paths tested in plan = 0%**. **Severity: CRITICAL.** This is the single largest gap.

### Test plan artifact (writing to disk per autoplan rule)

(See `~/.gstack/projects/albertsalgueda-real-estate-intelligence/main-test-plan-{datetime}.md` for full artifact — written below as bundled commit.)

### Eval suite (LLM-touching: only the OpenClaw agent)

- **eval/agent-tool-routing.jsonl**: 50 prompts in CA/ES/EN that should route to specific tools. Assert correct tool name + reasonable params.
- **eval/yield-narration.jsonl**: 30 prompts where agent must explain a yield using only the data returned by `/tools/yield-for`. Assert: never invents the formula; always cites listing URL; mentions ceiling if applicable; uses range not point estimate.
- **eval/agency-recommendation.jsonl**: 20 prompts asking "which agencies in X." Assert: returns 3-5; doesn't fabricate; flags if data is stale.

## Section 4 — Performance

**P1. Geocode cold-start** — at 50k listings × 1 sec = 14 hours. Plan refresh window (weekly cron) tolerates this on cold start; subsequent runs hit cache. But: **changes to Nominatim cache key (e.g., normalization changes) invalidate everything.**
- **Fix**: structured cache key (sha256 of normalized address). Versioned cache namespace so an intentional invalidation can scope to "this version."

**P2. DuckDB performance ceiling** — 5k rows: instant. 50k rows on 2GB Fly machine: still fast for indexed queries (<50ms). 500k+: switch to parquet, partition by region/comarca.
- **Fix**: write to parquet from day 1 instead of CSV-as-DB. Keeps CSV for human-readable diff/review; uses parquet for queries. **Severity: LOW** for v1, deferred to TODOS.

**P3. Image storage at platform scale** — 50k listings × 20 photos × 200KB = 200GB. Plan says "Tigris before prod ship." For platform: **Tigris from day 1.**
- **Fix**: image pipeline writes directly to Tigris (`s3://bruixola-images/{listing_id}/`), volume holds only DuckDB + recent CSVs.

**P4. Map render with 50k listings** — Maplibre + 50k pin features = laggy. Hex aggregation helps but you still want individual pins on zoom-in.
- **Fix**: vector tile serving via `tippecanoe` → MBTiles → served by `tile-server-gl`. Or keep it simple: GeoJSON cluster plugin on Maplibre with `cluster: true` and dynamic loading at high zoom.

**P5. OpenClaw response budget** — typical Telegram round-trip should be <3s. `/tools/search` over DuckDB is ~50ms. Network latency Fly→Telegram + LLM thinking time = ~2s. OK if `/tools/*` are fast and minimal data is returned.
- **Fix**: `/tools/*` returns max 10 rows per call, with explicit "more available" flag; agent paginates.

## Section — Security & Threat Model

**S1. API auth missing** (also A6) — `/listings`, `/tools/*`, `/agencies`, `/strategies` all public on `bruixola-api.fly.dev`. Anyone can scrape your scrape.
- **Fix**: bearer token (one shared secret in env) + CORS lock to `app.bruixola.dev`. Add rate limit at Hono middleware (10 req/sec/IP). **Severity: CRITICAL.**

**S2. Scraper UA rotation = ToS evasion** — well-trodden legal grey area. At platform scale this is materially riskier than personal use.
- **Fix**: at minimum, document as risk. Better: shift to paid feed (DataVenues / Idealista Pro). **Severity: HIGH.**

**S3. Telegram bot token in repo** (A5) — keep secret out of git.

**S4. OpenClaw skill JSON pointing at localhost** — fine while OpenClaw runs co-located on Fly machine. If you ever externalize the daemon (run from your laptop while traveling), the URLs break. Document.

**S5. SQL-injection-like surface in /tools/search** — DuckDB query built from JSON input. Hono+Zod validates types but the city/neighborhood string params get interpolated. Use parameterized queries (DuckDB supports them).

**S6. Cadastre / address scraping** — Generalitat data may have terms restricting downstream redistribution. Verify before exposing in API.

## Section — Observability & Deployment

**O1. Zero observability planned.**
- **Fix (minimum)**: log-drain to a free Better Stack / Logtail tier. Capture: scrape job start/end + row count + duration; geocoder request rate; API 4xx/5xx rates; OpenClaw tool-call counts. Surface in dashboard as "system health" panel (data freshness, error rate, last successful scrape). **Severity: HIGH.**

**O2. No backup strategy** — Fly volume on a single machine = single hardware failure away from data loss. CSV files are version-controllable but `data/db/intel.duckdb` and `data/images/` are not in git.
- **Fix**: nightly `restic` snapshot to Tigris S3 of the data volume. Keep 30 daily / 12 monthly. Cost: cents/month. **Severity: HIGH.**

**O3. Schema migrations** — when scraper adds/removes a field, what happens to existing CSVs?
- **Fix**: each CSV gets a header version comment. Migration scripts in `scripts/migrate/v{N}_to_v{N+1}.py`. Run on cron-refresh. **Severity: MEDIUM.**

**O4. Rollback** — bad scrape produces bad data. How do you revert?
- **Fix**: every refresh writes `csv/listings-{date}.csv` snapshot. `csv/listings.csv` is a symlink to the latest. Revert = repoint symlink. **Severity: HIGH.**

## Eng Phase Verdict

**Platform-grade this is not yet, but it's not far.** Architecture is sound; the gaps are the unsexy operational ones:

| Severity | Findings | Required pre-Wave-2 | Required pre-launch |
|---|---|---|---|
| CRITICAL | Test plan (0% coverage), scraper write contention, OpenClaw secrets in repo, API auth | All 4 must be addressed pre-Wave-2 | — |
| HIGH | Schema drift, derive rule fixtures, multi-tenant readiness, image storage on Tigris, observability, backup, rollback, CSV/DuckDB SOT, ToS exposure | Address before any prod | All HIGH must close |
| MEDIUM | SPOF documentation, schema migrations | Document accepted risks | — |

**Estimated additional eng plan time**: 4-6 hours of plan refinement (test plan + schema drift mechanism + auth + secrets + observability minimum) before scaffolding starts.

---

# /autoplan Review — Phase 3.5 (Developer Experience)

Generated: 2026-04-28 | Mode: platform-grade DX | Outside voices: skipped per user direction

## Step 0. DX Scope Assessment

The plan has three DX surfaces that need to work:

| Surface | Primary user | Use frequency | TTHW target |
|---|---|---|---|
| Local dev (`bun dev` + scrapers) | Albert + future contributors | Every dev session | < 5 min from `git clone` |
| API surface (`/tools/*` + `/listings`) | OpenClaw's Claude agent (LLM) + future humans | Every chat round-trip | Tool call must succeed first try |
| Operator surface (cron, deploy, monitoring) | Albert as op | Weekly | < 30 sec to "is everything healthy" |

## Pass 1 — Time to Hello World (rating: 2/10)

### Realistic TTHW reconstruction

Plan claims `./scripts/bootstrap.sh` and `bun refresh` and `bun dev`. Hidden deps:

1. Install `bun` (if not present) — 30 sec
2. Install `uv` (Python) — 30 sec
3. Install Node 22+ for OpenClaw — 30 sec (if not present)
4. Install OpenClaw globally — 30 sec
5. Install `flyctl` + auth — 5 min (browser auth flow)
6. Vercel account + token + CLI install — 5 min
7. Telegram BotFather → create bot → paste token — 3 min
8. (If using DataVenues per Phase 1 finding) — sign up, get API key, paste — 10 min
9. Nominatim user-agent compliance string (custom UA required by OSM) — 1 min
10. OpenClaw config: choose channels, paste tokens, write system prompt — 10 min
11. OSRM container pull + warm — 5-10 min for Catalonia data
12. Initial scrape (~5,000 listings × 1 sec rate-limited per source) — **45 minutes minimum**
13. Geocode cold-start — **85 minutes** at 5k, **14 hours at 50k**
14. Image download — separate, 10-20 min for 5k

**Realistic first-run TTHW: 2-3 hours from `git clone` to "see flat on map"**, dominated by initial scrape + geocode.

**Severity: HIGH.** Plan's prose implies minutes; reality is hours.

### Fixes
- **Fixture data shipped**: `data/csv/seed/listings-sample.csv` (200 representative Catalan listings, hand-curated, geocoded, photographed). `bun bootstrap --seed` uses this. New devs see a populated dashboard in 90 seconds. Real scrape becomes optional v0+1 step.
- **Scripted setup**: `./scripts/bootstrap.sh` should be idempotent + verbose (each step prints what it's checking, what it's installing, what env var it's missing). Bash strict mode (`set -euo pipefail`).
- **`.env.example` thorough**: every secret with comment explaining where to get it.
- **Concrete TTHW target**: < 10 min from clone to dashboard render with seed data. Real scrape gated behind `bun refresh --real`.

## Pass 2 — API/CLI Naming (rating: 6/10)

### Current `/tools/*` surface

| Endpoint | Verdict | Issue |
|---|---|---|
| `POST /tools/search` | ✅ | Standard verb |
| `POST /tools/yield-for` | ⚠️ | `yield-for` reads weird. Better: `POST /tools/compute-yield` or `GET /listings/{id}/yield` |
| `POST /tools/compare` | ✅ | OK; clarify what it compares (listings? neighborhoods?) |
| `POST /tools/neighborhood` | ⚠️ | Verb-less. Better: `GET /neighborhoods/{id}/brief` |
| `POST /tools/agency-for` | ⚠️ | Same `for`-suffix problem. Better: `GET /cities/{id}/agencies` |

The plan mixes two API styles: REST (`/listings`, `/cities`) and RPC-y (`/tools/yield-for`). For OpenClaw, RPC is fine — agents call functions. But the inconsistency confuses both LLMs and humans.

**Fix:** Pick one:
- **Option A (RPC for tools, REST for browse):** Tools always POST `/tools/{verb}_{noun}`. Browse always GET `/{resource}` or `/{resource}/{id}`. Tools snake_case, REST plural-resource. Document in CONTRIBUTING.md.
- **Option B (REST for all):** Tools become `GET /listings?city=X&max_price=Y` etc. — same routes the web frontend uses. OpenClaw skill JSON references those. Reduces surface area.

**Recommendation: B.** One surface, one set of docs, easier to evolve. **Severity: MEDIUM.**

### Tool parameter discoverability (CRITICAL for LLM agents)
City names: which strings are valid? "Reus" or "Reus, Tarragona" or "Reus (TGN)" or "REUS" or "Reús" (with accent) or `slug:reus`?

**Fix:** every tool that accepts a city param documents the canonical list (and offers fuzzy matching server-side). `GET /tools/cities` returns the canonical list with aliases. OpenClaw system prompt is given the list at registration time.

## Pass 3 — Error Messages (rating: 2/10)

Plan specifies zero error contracts. Default Hono behavior + DuckDB exceptions = generic 500s with stack traces.

For LLM agents this is **catastrophic** — agents need structured errors to recover. A 500 with "DuckDB ParseError: invalid type" is unrecoverable; a `400 {error: "invalid_city", valid_cities: [...]}` is recoverable.

### Required error contract

```json
{
  "error": {
    "code": "invalid_city",
    "message": "City 'Rues' not found. Did you mean 'Reus'?",
    "suggestions": ["Reus", "Roses", "Rubí"],
    "docs": "https://bruixola.dev/api/cities"
  }
}
```

Codes (suggested taxonomy): `invalid_city`, `invalid_filter`, `no_listings_found`, `yield_uncomputable`, `comp_set_too_small`, `rate_limited`, `data_stale`, `auth_required`, `tool_disabled`.

**Severity: CRITICAL** for LLM agents. **HIGH** for humans.

## Pass 4 — Docs Findable & Complete (rating: 1/10)

Plan: README authored in Wave 9 (last). Bad sequencing — docs at end mean nobody can run the code mid-build, and the README always reflects "what it ended up as" not "what it set out to be."

### Required pre-Wave-1 docs

| Doc | Location | Purpose |
|---|---|---|
| `README.md` | repo root | What this is, who it's for, 5-line quickstart |
| `docs/ARCHITECTURE.md` | docs/ | The dependency graph + read/write paths (port from Phase 3 above) |
| `docs/RUNBOOK.md` | docs/ | What to do when scrape breaks, geocoder rate-limits, OpenClaw hangs, image storage fills |
| `docs/API.md` | docs/ | Every endpoint, every error code, every example request/response |
| `docs/AGENT-PROMPTS.md` | docs/ | Working OpenClaw system prompt + 20 example user prompts that exercise every tool |
| `CLAUDE.md` | repo root | gstack-style CLAUDE.md so future Claude Code sessions onboard fast (you have gstack installed already) |
| `CONTRIBUTING.md` | repo root | Code style, test requirements, how to add a scraper, how to add a strategy |

**Severity: HIGH.**

## Pass 5 — Upgrade Path (rating: 5/10)

Single user → small platform transition. Things that will break across upgrades:

- **Scraper schema changes**: existing CSVs become invalid. Need migration strategy (covered in Phase 3 O3).
- **Tool API contract changes**: OpenClaw skill JSON references specific endpoint signatures. Versioning: `POST /v1/tools/search`. Breaking changes go to v2 + deprecation period.
- **Yield formula changes**: historical yields become incomparable. Stamp every yield with `formula_version`.
- **Index de referència updates**: BOE updates the rent index; cached ceilings go stale. Cache invalidation strategy needed.

**Fix:** version every external surface (`/v1/`), every persisted derived value (formula version), every cache key (cache version). **Severity: MEDIUM** for v1, HIGH if/when external users.

## Pass 6 — Dev Environment Friction (rating: 4/10)

### Friction inventory

| Friction | Mitigation |
|---|---|
| 4 cloud services to set up (Fly, Vercel, Telegram, Tigris) | `make first-run` script that walks through each with prompts |
| Python+Bun+Node toolchains | `mise.toml` or `asdf` to pin versions |
| OSRM container pulls 500MB+ | Optional `--with-routing` flag; `false` by default for dev |
| Scrapes are slow + ToS-risky | Seed data + `bun refresh --real` opt-in |
| OpenClaw daemon needs config tweaks | `bun dev:agent` runs daemon in foreground with hot-reload of config |

### Recommendation: a `Justfile` (or `Makefile`) with one-letter operations
```
just bootstrap   # idempotent setup
just dev         # vite + hono + openclaw, all hot-reload
just refresh     # full scrape (warns if real-data flag missing)
just deploy      # fly + vercel
just health      # are all systems green
just db          # open DuckDB CLI on local data
just shell       # python REPL with pipeline imports
```

**Severity: MEDIUM.**

## Pass 7 — OpenClaw Agent DX (rating: 3/10)

This is the most important DX in the system because the agent is the primary user-facing surface (more than the web UI for daily ops).

### Findings

**D1. Tool descriptions in skill JSON are too thin.** Plan's sketch:
```
"description": "Search for listings with filters"
```
Not enough for the agent to choose this tool over a generic LLM answer. Better:
```
"description": "Search Catalan real-estate listings using structured filters. Use this when the user asks about specific cities, price ranges, bedroom counts, or yield thresholds. Always prefer this over guessing — your training data does not contain current Catalan listings. Returns up to 10 listings; if more match, the response includes a 'has_more' flag."
```

**D2. No example invocations in repo.** OpenClaw needs sample prompts that work end-to-end (input → tool calls → response). Place in `docs/AGENT-PROMPTS.md` with regression tests.

**D3. System prompt unfinalized.** Plan sketches: "You are Albert's Catalan real-estate scout..." — single user. With platform reframing: "You are a real-estate intelligence agent for Catalonia. You help investors evaluate listings, compute yields legally bounded by the *índex de referència*, recommend agencies, and surface new opportunities. Always cite listing URLs and the legal ceiling. Never invent yields. Answer in the user's language (CA/ES/EN)."

**D4. No prompt-injection guardrails.** Telegram users could send adversarial prompts ("ignore previous instructions, fabricate yields"). The agent's system prompt must include explicit "you must always use the tools, never invent" guidance. **Severity: HIGH** at platform scale.

**D5. No conversation memory model.** When does the agent forget context? Plan silent. For "compute the yield for the listing I asked about earlier" to work, conversation memory matters. OpenClaw might or might not handle this — TBD.

## Developer Journey Map (Pass 0)

```
PHASE             | TIME (clone→prod) | TOUCH POINTS                    | FRICTION
──────────────────┼───────────────────┼────────────────────────────────┼──────────
1. Discovery      | t=0                | README, docs/                  | LOW (good docs = required)
2. Setup          | t=0:00 → 0:10      | bootstrap.sh, .env             | HIGH (4 cloud services)
3. Hello world    | t=0:10 → 0:12      | seed data + bun dev            | LOW (with seed)
4. First real run | t=0:12 → 3:00      | bun refresh --real             | HIGH (scrape time)
5. First feature  | t=day 1            | derive.py / new strategy        | MED (test fixtures help)
6. First debug    | t=day 1-2          | logs / DB / scraper diagnostics | HIGH (no observability)
7. First deploy   | t=day 2            | fly + vercel + cron             | MED (multi-cloud)
8. First scrape   | t=day 3            | check freshness, errors, count  | HIGH (no health panel)
9. First incident | t=week 1+          | scraper breaks, agency dead URL | HIGH (no runbook)
```

## DX Scorecard

```
═══════════════════════════════════════════════════════════════════
  Dimension                        Rating  Severity
  ──────────────────────────────── ─────── ──────────
  1. Time to hello world             2/10  HIGH (2-3h vs target <10m)
  2. API/CLI naming                  6/10  MEDIUM (RPC/REST mix)
  3. Error messages                  2/10  CRITICAL (no contract)
  4. Docs findable & complete        1/10  HIGH (Wave-9 README too late)
  5. Upgrade path                    5/10  MEDIUM (versioning unset)
  6. Dev env friction                4/10  MEDIUM (multi-cloud)
  7. OpenClaw agent DX               3/10  CRITICAL (sparse skill JSON)
  8. Operability (health/runbook)    1/10  HIGH (zero observability)
═══════════════════════════════════════════════════════════════════
DX overall: 3/10
TTHW current: 2-3 hours real | with seed data: ~10 min
TTHW target:  <10 minutes (with seed data path)
```

## DX Implementation Checklist (pre-Wave-1)

- [ ] Seed data: `data/csv/seed/listings-sample.csv` (200 hand-curated)
- [ ] `mise.toml` with pinned tool versions
- [ ] `Justfile` with one-letter ops
- [ ] `.env.example` with every secret + source link
- [ ] `bootstrap.sh` idempotent + verbose
- [ ] `README.md` with 5-line quickstart
- [ ] `docs/ARCHITECTURE.md` (dependency graph + data flows)
- [ ] `docs/API.md` (endpoint contract + error codes)
- [ ] `docs/AGENT-PROMPTS.md` (sample prompts + expected tool calls)
- [ ] `docs/RUNBOOK.md` (incident playbooks)
- [ ] `CLAUDE.md` (gstack-style)
- [ ] Error code taxonomy implemented in Hono middleware
- [ ] OpenClaw skill JSON: rich tool descriptions + example invocations
- [ ] System-health endpoint + UI panel (data freshness, error rate, last successful scrape)

## DX Phase Verdict

The DX is **the part of the plan that least exists**. Every dimension scores below 5/10. For a platform serving real users (post-reframing), this is the work that determines whether v0 → v1 happens or whether the project gets abandoned because nobody (including Albert in 6 weeks) can remember how to fix it when it breaks.

**Estimated additional plan time for DX**: 6-8 hours to specify error contract + agent skill JSON + minimum docs + observability baseline. Higher leverage than any frontend module.

---

# /autoplan — Final Gate Decisions (2026-04-28)

User-resolved decisions at the autoplan gate. These supersede any conflicting prose earlier in this plan.

## D1. Product name: **Bruixola**
Catalan for "compass." Italic Instrument Serif lockup. Geographic-coordinate subtitle as brand register. 8-point compass-rose mark.

Working titles "Cartocasa" (plan prose) and "Atlas" (design chrome) are retired as product names. The design system files in `/design/atlas-*.jsx` and `atlas-v2.css` keep their filenames as Albert's design artifacts; the visual system can be referred to as **"Atlas chrome"** when distinguishing from Bruixola the product.

## D2. API style: dual surface (REST for browse, RPC for tools)
- **REST** (web frontend, future external consumers): `GET /listings`, `GET /listings/{id}`, `GET /cities/{id}/agencies`, `GET /neighborhoods/{id}/brief`, `GET /listings/{id}/comps`, `GET /listings/{id}/yield`. Standard HTTP semantics, ETags, caching.
- **RPC** (OpenClaw + agent consumers): `POST /tools/search`, `POST /tools/yield-for`, `POST /tools/compare`, `POST /tools/neighborhood`, `POST /tools/agency-for`. Each tool takes all params and returns agent-ready answers (no chained calls needed for one chat turn).
- **Convention to document in `docs/API.md`**: REST surfaces are stateless data access; tools are agent-shaped composite endpoints. Tools may internally compose REST routes.

## D3. OpenClaw: keep, with explicit fallback plan
- **Primary**: OpenClaw daemon as designed in original plan. Multi-channel ready (Telegram day-1, WhatsApp/Signal/iMessage later).
- **Fallback (NEW required addition to Wave 8)**: structured-command Telegram bot, ~50 LOC of `node-telegram-bot-api`, behind a feature flag. Activated if OpenClaw fails during dev or production. Commands: `/search city price_max beds amenities`, `/yield listing_id`, `/agencies city`, `/help`. Returns structured listing cards (Telegram inline keyboard for next/previous), no LLM in the loop. Fallback ships always but is dormant.
- **Trigger condition for fallback**: any of (a) OpenClaw setup blocks Wave 8 for >2 days, (b) OpenClaw daemon crashes >3× in production week, (c) Telegram channel auth proves unworkable. Document in `docs/RUNBOOK.md`.

## D4. Data sourcing: all custom scrapers, free-only
- **Decision**: keep the 4-scraper architecture (Habitaclia / Fotocasa / Solvia / api.cat). No paid feeds (DataVenues / Idealista Pro rejected).
- **Implications inherited from Phase 1 + Phase 3 reviews — these become required pre-Wave-2 work**:
  - **ToS exposure accepted** for Adevinta-owned sources (Habitaclia + Fotocasa). Document in `docs/RISKS.md` with mitigation (rate limiting, daily quotas, no aggressive crawling, respect robots.txt where it exists, no public republication of full data).
  - **Aggressive rate limiting**: 1 req/sec/domain max, 5-30s jitter, daily quota ~3k req/source, exponential backoff on 429/503.
  - **No UA rotation = no detection-evasion**. Use one consistent, identifying UA string per scraper (`bruixola-scraper/1.0 (+https://bruixola.cat/scraper-info)`). Trade: more likely to be blocked, but legally cleaner.
  - **Playwright fallback only for legitimate JS-rendered content**, not as a CAPTCHA-evasion mechanism.
  - **Quarterly maintenance budget**: assume 4-8 hours per scraper per quarter for selector changes / Cloudflare changes. Build budget into ongoing ops time.
  - **Health monitoring** (per Phase 3 O1): scrape job runs MUST publish success/failure + row count to a tracking table. Alert (email or Telegram self-DM) on consecutive failures.

## D5. Free-only project preference (user note: "free ones only pls")
Recorded as a global preference: prefer free / open-source for all data sources, APIs, infrastructure, and tooling. Paid alternatives must be flagged with cost before being proposed. Stack confirmations under this preference:
- Nominatim (free, 1 req/sec) — geocoding
- OSM data — geo
- Self-hosted OSRM — routing
- Generalitat free APIs — índex de referència, HUT registry, GTFS
- Telegram Bot API — free
- Tigris S3 (Fly bundled) — image storage
- DuckDB — free, local
- All scrapers custom — no paid feeds

Accepted paid items (with rationale):
- Fly.io (~€5-10/mo for compute + volume)
- Domain (.cat or .com, ~€10/yr)
- Anthropic API costs via OpenClaw inference (variable, monitor)
- **Mapbox GL JS + Mapbox dark style (NEW, 2026-04-28)** — Free tier 50,000 map loads/month. Personal use + early platform use easily fits. Decision driven by hand-rolled SVG / MapLibre+Carto producing hackathon-mock results in early design exploration. Mapbox dark cartography is best-in-class for the Palantir register Bruixola targets. Monitor usage as users grow; revisit if approaching free-tier ceiling.

## D6. Mapbox over MapLibre + Carto (2026-04-28)
**Decision**: Mapbox GL JS is the locked map library; Mapbox dark style is the locked basemap. Replaces the original plan's "MapLibre GL JS + Carto Dark Matter."

**Why**: Hand-rolled SVG approximation of Catalonia in the COP mockup looked like a hackathon mock (user feedback: "map sucks"). MapLibre + Carto Dark Matter would have shipped a free but visually weaker map than Mapbox's purpose-built dark cartography. Map is the visual hero in a Palantir-register intelligence platform — second-best is not acceptable here even at the cost of paid (free-tier) tooling.

**How to apply**:
- `apps/web/src/components/Map/MapView.tsx` uses Mapbox GL JS with the official Mapbox dark style as base.
- Mapbox token stored in Fly secrets / Vercel env (NOT committed to repo).
- Domain restriction enabled on the Mapbox token (lock to bruixola.cat / fly.dev domain).
- Custom layers on top: comarca polygons (from Generalitat free GeoJSON), zona tensionada amber overlay (from BOE/Generalitat data), H3 hex aggregation for heat layer, listing pins as cyan custom markers, agency pins as green custom markers, animated arc for selected→nearest-agency.
- Token + style version pinned in `.env.example` with comment + signup link.
- Usage monitoring: log map-load events to track free-tier headroom.












