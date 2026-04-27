#!/usr/bin/env bash
# Brúixola — idempotent first-run setup.
# Usage: bash scripts/bootstrap.sh [--seed]
#
# Verbose by design: each step prints what it's checking, what it's installing,
# what env it's missing. New devs should not need to read this script to debug.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ─────────────────────────────────────────────────────────────
# Color helpers
# ─────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_OK="\033[0;32m"; C_WARN="\033[0;33m"; C_ERR="\033[0;31m"; C_DIM="\033[2m"; C_RST="\033[0m"
else
  C_OK=""; C_WARN=""; C_ERR=""; C_DIM=""; C_RST=""
fi
ok()    { printf "%b✓%b  %s\n" "$C_OK" "$C_RST" "$1"; }
warn()  { printf "%b!%b  %s\n" "$C_WARN" "$C_RST" "$1"; }
err()   { printf "%b✗%b  %s\n" "$C_ERR" "$C_RST" "$1"; }
step()  { printf "\n%b▸%b  %s\n" "$C_DIM" "$C_RST" "$1"; }

step "Brúixola bootstrap"

# ─────────────────────────────────────────────────────────────
# Tooling checks
# ─────────────────────────────────────────────────────────────
step "Checking required tools"

if ! command -v bun >/dev/null 2>&1; then
  err "bun not found. Install: brew install oven-sh/bun/bun  (or curl -fsSL https://bun.sh/install | bash)"
  exit 1
fi
ok "bun $(bun --version)"

if ! command -v uv >/dev/null 2>&1; then
  warn "uv not found (Python). The scrapers package needs uv. Install: curl -LsSf https://astral.sh/uv/install.sh | sh"
else
  ok "uv $(uv --version 2>&1 | head -1)"
fi

if ! command -v docker >/dev/null 2>&1; then
  warn "docker not found. OSRM (routing) is containerized; routing features will be disabled until Docker is installed."
else
  ok "docker $(docker --version | head -1)"
fi

# ─────────────────────────────────────────────────────────────
# .env
# ─────────────────────────────────────────────────────────────
step "Setting up .env"

if [ ! -f .env ]; then
  cp .env.example .env
  ok ".env created from .env.example"
  warn "Edit .env and fill in: BRUIXOLA_API_TOKEN, VITE_MAPBOX_TOKEN, TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY"
  warn "Generate API token: openssl rand -hex 32"
else
  ok ".env already exists"
fi

# Generate API token if still placeholder
if grep -q "replace-with-32-byte-hex-token" .env 2>/dev/null; then
  TOKEN=$(openssl rand -hex 32)
  if [ "$(uname)" = "Darwin" ]; then
    sed -i '' "s|replace-with-32-byte-hex-token|$TOKEN|" .env
  else
    sed -i "s|replace-with-32-byte-hex-token|$TOKEN|" .env
  fi
  ok "Generated BRUIXOLA_API_TOKEN"
fi

# ─────────────────────────────────────────────────────────────
# OpenClaw config
# ─────────────────────────────────────────────────────────────
step "Setting up OpenClaw config"

if [ ! -f openclaw/config.yaml ]; then
  if [ -f openclaw/config.yaml.template ]; then
    cp openclaw/config.yaml.template openclaw/config.yaml
    ok "openclaw/config.yaml created from template"
    warn "Edit openclaw/config.yaml and fill in: telegram.bot_token, anthropic.api_key"
  else
    warn "openclaw/config.yaml.template missing — skipping"
  fi
else
  ok "openclaw/config.yaml already exists"
fi

# ─────────────────────────────────────────────────────────────
# Bun deps
# ─────────────────────────────────────────────────────────────
step "Installing TS workspace deps"

bun install
ok "bun install complete"

# ─────────────────────────────────────────────────────────────
# Python deps (scrapers)
# ─────────────────────────────────────────────────────────────
if command -v uv >/dev/null 2>&1; then
  step "Installing Python scrapers deps"
  ( cd packages/scrapers && uv sync )
  ok "scrapers deps installed"
fi

# ─────────────────────────────────────────────────────────────
# Schema codegen (Pydantic + Zod from JSON Schema)
# ─────────────────────────────────────────────────────────────
step "Running schema codegen"

bun run schema:gen || warn "Schema codegen had errors — fix before committing."
ok "schemas generated"

# ─────────────────────────────────────────────────────────────
# Data dirs
# ─────────────────────────────────────────────────────────────
step "Creating data dirs"

mkdir -p data/csv data/db data/images data/staging data/cache
ok "data/* dirs ready"

# ─────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────
step "Bootstrap complete"
ok "Run: bun run dev    (starts API on :3001)"
ok "Health: curl http://localhost:3001/health"
echo
warn "Open .env and review BRUIXOLA_API_TOKEN, VITE_MAPBOX_TOKEN, TELEGRAM_BOT_TOKEN before running real scrapes."
