# CLAUDE.md

Project guidance for Claude Code sessions on **Brúixola**.

## What this project is

**Brúixola** (Catalan: compass) — Palantir-style real-estate intelligence platform geographically capped to Catalonia. Multi-thesis: residential buy-to-rent, coastal STR with HUT licenses, hospital-staff long-let, student long-let, value-add reform.

The plan-of-record is `docs/PLAN.md`. It has been through `/autoplan` review (CEO + Design + Eng + DX phases). Read it before any non-trivial change.

## Critical rules (locked decisions)

1. **No `import anthropic` in app code.** All AI flows through OpenClaw. The agent runs as a sidecar daemon; the app code is LLM-free.
2. **Yields MUST gate against the *índex de referència de preus de lloguer*.** Catalonia's *zonas tensionadas* (Llei 12/2023, BOE-A-2024-5214) cap legal rent per unit. Any yield calc that ignores this is legally wrong. See `data/csv/zones_tensionadas.csv` + `packages/scrapers/src/yield_calc.py`.
3. **Yield is always a range (P25–P50–P75)**, never a point estimate. UI shows a range bar with the legal ceiling line.
4. **JSON Schema in `packages/shared/schema/` is the source of truth for types.** Pydantic (Python) and Zod (TS) are codegened from it. Run `bun run schema:gen` after schema changes. CI runs `bun run schema:verify` to assert no drift.
5. **Free / open-source by default.** Paid items must be flagged with cost. Approved exceptions: Fly.io (~€10/mo), domain (~€10/yr), Mapbox GL JS (free tier 50k loads/mo), Anthropic via OpenClaw (variable, monitor).
6. **API auth on every route.** Bearer token from `BRUIXOLA_API_TOKEN` env. CORS locked to `CORS_ORIGIN`. See `apps/api/src/middleware/auth.ts`.
7. **OpenClaw secrets out of git.** `openclaw/config.yaml` is gitignored; `openclaw/config.yaml.template` is committed. Real values via Fly secrets in production.
8. **No detection-evasion in scrapers.** One identifying UA per scraper, respect robots.txt where present, rate limit 1 req/sec/domain, no UA rotation. ToS exposure is documented and accepted; aggressive evasion is not.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas / brainstorming → invoke `/office-hours`
- Strategy / scope → invoke `/plan-ceo-review`
- Architecture → invoke `/plan-eng-review`
- Design system / plan review → invoke `/plan-design-review`
- Full review pipeline → invoke `/autoplan`
- Bugs / errors → invoke `/investigate`
- QA / testing site behavior → invoke `/qa` or `/qa-only`
- Code review / diff check → invoke `/review`
- Visual polish → invoke `/design-review`
- Ship / deploy / PR → invoke `/ship` or `/land-and-deploy`
- Save progress → invoke `/context-save`
- Resume context → invoke `/context-restore`

## Conventions

- **Language**: TypeScript for API + frontend, Python for scrapers + ML/ETL.
- **Runtime**: Bun for API + scripts. uv for Python.
- **Test framework**: `bun test` for TS, `pytest` for Python.
- **Linter**: built-in TS (strict) + `ruff` for Python.
- **Commits**: imperative present tense ("add yield calc," not "added yield calc"). No emoji. No `WIP:` unless gstack continuous-checkpoint mode is on.
- **API style**: REST for `/listings`, `/cities`, etc. RPC for `/tools/*` (OpenClaw consumers). Document the convention in `docs/API.md` (TBD).
- **Frontend** (`apps/web`): Next.js 15 App Router + Tailwind v4 + @supabase/ssr (direct Supabase reads with publishable key + RLS). MapLibre GL JS with Carto Dark Matter (free) by default; Mapbox dark style if NEXT_PUBLIC_MAPBOX_TOKEN is set. Cool-dark Palantir register: bg-bg-0 (#0a0e14), cyan accent (#5fb4d4), Inter + Inter Tight + IBM Plex Mono. Tokens defined in `app/globals.css` via Tailwind v4 `@theme`.
- **Catalan/Spanish in user-facing strings**, English in code identifiers.

## Testing

- `bun test` runs all TS tests.
- `cd packages/scrapers && uv run pytest` runs Python tests.
- `bun run schema:verify` enforces no drift between JSON Schema and codegen output.
- For LLM/prompt changes (the OpenClaw skill JSON or system prompt), run the eval suite at `packages/scrapers/eval/` (TBD — eval suite is item 4 on the open critical list).

## Pre-Wave-2 critical items (status)

See `README.md` for the live status list. As of last edit, scaffold + schema codegen + secrets pattern are closed; rent-cap integration, test plan, state coverage, write-coordination, and error taxonomy remain open.
