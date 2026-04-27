#!/usr/bin/env bash
# packages/shared/scripts/verify-no-drift.sh
#
# Runs both codegen scripts (Zod + Pydantic) and asserts that the working tree
# has no diff afterward. If it does, the JSON Schema and the generated code are
# out of sync and someone forgot to run `bun run schema:gen` after editing a
# schema. Exits non-zero in that case so CI / fly.toml release_command catches
# it before deploy.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

# Track which generated paths we care about
TARGETS=(
  "packages/shared/src/generated/zod"
  "packages/scrapers/src/bruixola_scrapers/schemas"
)

# Snapshot pre-codegen state of the targets (file list + hashes)
TMP_BEFORE=$(mktemp)
TMP_AFTER=$(mktemp)
trap 'rm -f "$TMP_BEFORE" "$TMP_AFTER"' EXIT

snapshot() {
  for t in "${TARGETS[@]}"; do
    if [ -d "$t" ]; then
      ( cd "$t" && find . -type f -print0 | xargs -0 shasum -a 256 ) || true
    fi
  done | sort
}

snapshot > "$TMP_BEFORE"

echo "▸ Regenerating schemas to verify no drift..."
bun run packages/shared/scripts/codegen-zod.ts
bash packages/shared/scripts/codegen-pydantic.sh

snapshot > "$TMP_AFTER"

if ! diff -q "$TMP_BEFORE" "$TMP_AFTER" >/dev/null; then
  echo
  echo "✗ Schema drift detected. Generated code does NOT match what's committed."
  echo "  This means a JSON Schema was edited without re-running codegen, OR"
  echo "  someone hand-edited a generated file (don't do that)."
  echo
  echo "  Differences (committed → fresh):"
  diff "$TMP_BEFORE" "$TMP_AFTER" | head -40 || true
  echo
  echo "  Fix: run 'bun run schema:gen' and commit the result."
  exit 1
fi

echo "✓ No schema drift."
