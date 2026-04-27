#!/usr/bin/env bash
# Brúixola — full data refresh.
# Runs scrapers → derive → yield → DuckDB rebuild.
# Run weekly via GH Actions cron OR manually for ad-hoc refresh.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  echo "✗ .env missing. Run: bash scripts/bootstrap.sh" >&2
  exit 1
fi
# shellcheck disable=SC1091
set -a; . .env; set +a

if ! command -v uv >/dev/null 2>&1; then
  echo "✗ uv not found. Install Python tooling first." >&2
  exit 1
fi

cd packages/scrapers
uv run python -m bruixola_scrapers.pipeline "$@"
