#!/usr/bin/env bash
# Brúixola — deploy.
# Vercel for web (when scaffolded), Fly.io for api+agent.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "▸ Verifying schema sync (no drift before deploy)"
bun run schema:verify

if [ -d apps/web ]; then
  echo "▸ Deploying web → Vercel"
  if command -v vercel >/dev/null 2>&1; then
    vercel deploy --prod --cwd apps/web
  else
    echo "! vercel CLI not found, skipping web deploy"
  fi
fi

echo "▸ Deploying api + agent → Fly.io"
if command -v fly >/dev/null 2>&1; then
  fly deploy --strategy rolling
else
  echo "✗ fly CLI not found. Install: brew install flyctl" >&2
  exit 1
fi

echo "✓ Deploy complete"
echo "  Health: curl https://bruixola.fly.dev/health"
