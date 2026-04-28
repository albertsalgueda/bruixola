# Brúixola Runbook

Operational guide for spinning up, debugging, and recovering Brúixola.

> **Currency**: this is a personal-scale ops doc. As the platform grows, sections about backup, multi-machine, and incident response will get teeth.

## TL;DR (cold start, fastest path)

```sh
bash scripts/bootstrap.sh   # one-time: deps, .env, codegen, dirs
bun run dev                 # API on http://localhost:3001
```

That's it for the **minimum viable Brúixola** — API + DuckDB (embedded). No Docker, no daemons. `curl http://localhost:3001/health` should return `{"ok":true,...}`.

## What runs where

| Service | Process | Where | Lifecycle | Required for |
|---|---|---|---|---|
| **API** | `bun run dev` (or `bun run start` in prod) | port 3001 (local) / Fly machine `mad` (prod) | long-running | everything |
| **Next.js web app** | `bun run dev:web` (or `bun run dev:all` to boot with the API) | port 3000 (local) / Fly machine `mad` (prod) | long-running | COP UI, listings, dossier |
| **DuckDB** | embedded in API process | `data/db/intel.duckdb` (file) | follows API | data queries |
| **Scrapers** | `uv run bruixola-scrape` (Python CLI) | local one-shot or Fly cron | on-demand | data refresh |
| **OSRM** (routing) | `osrm-routed` Docker container | port 5000 (local) | long-running | walk/drive times (Wave 3) |
| **Nominatim** | hosted (free public OSM endpoint) | https://nominatim.openstreetmap.org | external | geocoding |
| **Tigris S3** | hosted (Fly bundled object store) | `https://fly.storage.tigris.dev` | external | image storage at scale |
| **OpenClaw** | sidecar daemon `openclaw daemon --config ...` | localhost on Fly machine | long-running | Telegram chat surface |
| **Telegram** | hosted Bot API | api.telegram.org | external | user-facing chat |

Note: there is **no separate database service**. DuckDB is embedded — it's a library, not a server. The `data/db/intel.duckdb` file IS the database. It's read/written by the API process directly.

## Local dev — recipes

For the full local stack (API on :3001 + Next.js web on :3000) in one shot:

```sh
bash scripts/bootstrap.sh
bun run dev:all
```

`dev:all` uses a shell `&` to boot both workspaces in parallel. `Ctrl-C` once stops both. Open http://localhost:3000/cop for the COP view. If you only need one process at a time, use the recipes below.

### A) API only (start here)

```sh
bash scripts/bootstrap.sh
bun run dev
```

Verify:
```sh
curl http://localhost:3001/health
# { "ok": true, "service": "bruixola-api", "version": "0.1.0", "ts": "..." }

TOKEN=$(grep BRUIXOLA_API_TOKEN .env | cut -d= -f2)

# Auth wall holds:
curl http://localhost:3001/listings
# { "error": { "code": "auth_required", ... } } → 401

# With auth (returns 501 stub until Wave 4 lands real handlers):
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/listings
```

Stop: `Ctrl-C` in the API terminal. Or if running in background: `pkill -f "apps/api/src/server.ts"`.

### B) API + Routing (when working on walk-time features)

OSRM needs a one-time data prep dance. Catalonia extract is ~250MB compressed; preprocessing takes 5-10 minutes on a modern Mac.

```sh
# 1) Fetch the Catalonia OSM extract (one-time)
mkdir -p data/osrm
curl -L https://download.geofabrik.de/europe/spain/cataluna-latest.osm.pbf \
  -o data/osrm/cataluna-latest.osm.pbf

# 2) Prep OSRM data (one-time, 5-10 min)
docker compose --profile routing-setup up
# Watch the three stages: osrm-extract → osrm-partition → osrm-customize
# When all three exit 0, the data is ready.

# 3) Run the OSRM daemon
docker compose --profile routing up -d

# 4) Verify
curl 'http://localhost:5000/route/v1/foot/2.169,41.397;2.182,41.404?overview=false'
# Should return JSON with a "routes" array containing distance + duration.

# 5) Bring everything up (API also)
bun run dev
```

Stop OSRM: `docker compose --profile routing down`.

### C) Full stack (API + Routing + Scrapers + OpenClaw)

The full local stack is rarely needed during dev. Most days you only need (A). Run (C) when:
- Testing a fresh end-to-end refresh against real platforms
- Debugging the OpenClaw → Brúixola tool-call round-trip

```sh
# Scrapers (one-shot)
cd packages/scrapers
uv run bruixola-scrape --source habitaclia       # single platform
# or:
uv run bruixola-scrape                             # all platforms

# OpenClaw daemon (separate terminal)
# First run: npm install -g openclaw
# Edit openclaw/config.yaml and fill in TELEGRAM_BOT_TOKEN + ANTHROPIC_API_KEY
openclaw daemon --config openclaw/config.yaml
```

OpenClaw won't run usefully without a Telegram bot token (BotFather, free) and an Anthropic API key (paid, OpenClaw owns the call). Skip during dev; add when you want the chat surface working.

## Health checks

```sh
# API
curl -fsS http://localhost:3001/health > /dev/null && echo "api ✓" || echo "api ✗"

# OSRM (if running)
curl -fsS http://localhost:5000/health > /dev/null && echo "osrm ✓" || echo "osrm ✗"

# Schema codegen (drift = bug)
bun run schema:verify

# DuckDB (read the file)
duckdb data/db/intel.duckdb "SELECT count(*) FROM listings;" 2>/dev/null || echo "no listings yet"
```

## Where data lives

```
Local dev
├── data/csv/                 source-of-truth scraped data (would also live in git for small ref tables)
├── data/db/intel.duckdb      queryable cache, rebuilt from CSVs
├── data/images/              photo cache (gitignored, can grow large)
├── data/staging/             transient; safe to delete
└── data/osrm/                OSRM preprocessed graph (gitignored, ~1GB after partition+customize)

Production (Fly machine)
└── /data                     mounted Fly Volume "bruixola_data" — same layout as above
```

### Persistence story (today)

- **Fly Volume "bruixola_data"** survives machine restart and redeploy.
- Does NOT survive: machine destruction, hardware fault, region migration.
- Does NOT replicate across machines: scaling to 2+ machines means each gets its own independent volume → data drift.
- **No backup yet.** Open item from autoplan Phase 3 (O2). Wire up `restic` → Tigris S3 nightly snapshot before the first real scrape lands.

## Common problems

| Symptom | Cause | Fix |
|---|---|---|
| `bun run dev` exits with `BRUIXOLA_API_TOKEN missing` (prod mode) | `.env` not populated | `bash scripts/bootstrap.sh` regenerates token. In Fly: `fly secrets set BRUIXOLA_API_TOKEN=$(openssl rand -hex 32)` |
| Schema verify fails | JSON Schema edited without re-running codegen | `bun run schema:gen` and commit the result |
| `bun install` fails on `@duckdb/node-api` | Pinned version went away upstream | Update `apps/api/package.json` to a current version (`npm view @duckdb/node-api versions`) |
| OSRM container exits 0 but `osrm-routed` won't start | Missed a stage of the prep dance | `docker compose --profile routing-setup up` again, watch each stage exit 0 before the daemon |
| `/listings` returns 501 with "Wave 4 not implemented" | Expected | Wave 4 wires up real handlers. Until then the route exists for auth-wall verification |
| Scraper 403/Cloudflare | Source rate-limit or block | Check `packages/scrapers/data/staging/` for partial output. Back off, lower req rate, retry. ToS exposure risk noted in `docs/PLAN.md` |

## Production (Fly) — first deploy (when ready)

```sh
# 1) Fly app + volume
fly apps create bruixola
fly volumes create bruixola_data --region mad --size 10

# 2) Secrets (generate or paste)
fly secrets set BRUIXOLA_API_TOKEN=$(openssl rand -hex 32)
fly secrets set TELEGRAM_BOT_TOKEN=...
fly secrets set ANTHROPIC_API_KEY=...
fly secrets set TIGRIS_ACCESS_KEY_ID=...
fly secrets set TIGRIS_SECRET_ACCESS_KEY=...

# 3) Deploy
bash scripts/deploy.sh
# That runs: schema:verify → fly deploy --strategy rolling

# 4) Verify
curl https://bruixola.fly.dev/health
fly status
fly logs
```

The `release_command` in `fly.toml` runs `bun run schema:verify` before the new release goes live — so a schema/codegen mismatch fails the deploy instead of producing inconsistent prod data.

## Stop / cleanup

```sh
# Stop the API (foreground): Ctrl-C
# Stop the API (background): pkill -f "apps/api/src/server.ts"
# Stop OSRM: docker compose --profile routing down
# Wipe local data (CAREFUL): rm -rf data/db data/images data/staging data/osrm
# Reset .env to placeholder: rm .env && bash scripts/bootstrap.sh
```
