# Brúixola

> Real-estate intelligence · Catalonia
> N · 41.39° · E · 2.16°

Palantir-style intelligence platform for Catalan residential real-estate, capped to Catalonia territory. Multi-thesis (residential buy-to-rent, coastal STR with HUT, hospital-staff long-let, student long-let, value-add reform). Agent-first chat surface via OpenClaw on Telegram.

## Quick start

```sh
# 0. Prereqs: bun >= 1.1.30, uv (Python), Docker (for OSRM)
brew install oven-sh/bun/bun
curl -LsSf https://astral.sh/uv/install.sh | sh

# 1. Bootstrap (idempotent)
bash scripts/bootstrap.sh

# 2. Generate schemas (JSON Schema → Pydantic + Zod)
bun run schema:gen

# 3. Run the API + a seed dataset
bun run dev
# API: http://localhost:3001
# Health check: curl http://localhost:3001/health
```

## Layout

```
bruixola/
├── apps/api/                   Hono + DuckDB API (Bun)
├── packages/shared/            JSON Schema → Pydantic + Zod (cross-language types)
├── packages/scrapers/          Python scrapers (uv + httpx + bs4 + Playwright)
├── openclaw/                   Agent config (template only; real config via Fly secrets)
├── data/                       CSVs (versioned), DuckDB (gitignored), images (gitignored)
├── scripts/                    bootstrap, refresh, deploy
└── docs/PLAN.md                Plan of record (autoplan-reviewed)
```

`apps/web` is intentionally not scaffolded yet. Frontend ships post-API per current sequencing.

## Status

Pre-Wave-1. See `docs/PLAN.md` for full plan and review history.

CRITICAL items closed in this scaffold:
- ✅ Item 3 — OpenClaw secrets out of git (template + Fly secrets pattern)
- ✅ Item 5 — Schema-drift mechanism (JSON Schema → codegen for Pydantic + Zod, with no-drift guard)
- ✅ Item 2 partial — API auth middleware skeleton wired in apps/api

CRITICAL items still open:
- Item 1 — Generalitat *índex de referència* integration
- Item 4 — Test plan (yield_calc + derive.py fixtures + agent eval)
- Item 6 — State coverage spec
- Item 7 — Scraper write-coordination (staging → transactional merge)
- Item 8 — Error code taxonomy (skeleton present in apps/api/src/errors.ts)

## License

Personal project. All rights reserved.
