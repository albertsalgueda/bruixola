# @bruixola/scrapers

Python scrapers for Catalan real-estate portals + ETL pipeline.

## Setup

```sh
cd packages/scrapers
uv sync
uv run playwright install chromium  # if you'll use the JS-rendered fallback
```

## Layout

```
packages/scrapers/
├── pyproject.toml
├── src/bruixola_scrapers/
│   ├── __init__.py
│   ├── pipeline.py              orchestrator: scrape → dedupe → geocode → derive → yield → load
│   ├── platforms/
│   │   ├── base.py              rate limit, UA, retry, robots.txt respect
│   │   ├── habitaclia.py        (Wave 2)
│   │   ├── fotocasa.py          (Wave 2)
│   │   ├── solvia.py            (Wave 2)
│   │   └── api_cat.py           (Wave 2)
│   ├── derive.py                rules engine: condition_label, okupa_risk
│   ├── yield_calc.py            yield ranges + zona-tensionada ceiling gate
│   ├── geocode.py               Nominatim with local cache
│   ├── osrm.py                  walk/drive times via local OSRM
│   ├── images.py                photo download + thumbnail
│   ├── hut.py                   Generalitat HUT registry join
│   ├── rent_index.py            SERPAVI índex de referència
│   └── schemas/                 AUTO-GENERATED from packages/shared/schema/*.json
└── tests/
    └── ...
```

## Run

```sh
# Full refresh (all sources + derive + yield + DuckDB rebuild)
uv run bruixola-scrape

# Single source
uv run bruixola-scrape --source habitaclia

# Stage-only (skip platform fetch, re-derive from existing CSVs)
uv run bruixola-scrape --re-derive
```

## Schemas — DO NOT EDIT BY HAND

`src/bruixola_scrapers/schemas/` is codegened from `packages/shared/schema/*.json`.
Edit the JSON Schema, then regenerate:

```sh
# From repo root:
bun run schema:gen        # regenerates Pydantic + Zod
bun run schema:verify     # asserts no drift
```

## Rules of engagement

1. **No Anthropic SDK calls** in this package or anywhere else in app code. The conversational layer is OpenClaw's job.
2. **One identifying UA per scraper.** No UA rotation. No detection-evasion. Respect robots.txt where present.
3. **1 req/sec/domain** with 5–30s jitter. Daily quota ~3k req/source. Exponential backoff on 429/503.
4. **Yield calc must gate against the SERPAVI rent index** for any listing in a zona tensionada.
5. **Yield is always a P25/P50/P75 range** plus optional legal-max. Never a single point estimate.
6. **No write to canonical CSV directly.** Each scraper writes to `data/staging/{source}-{date}.csv`. The pipeline runs a transactional merge job at the end.
