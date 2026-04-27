#!/usr/bin/env bash
# packages/shared/scripts/codegen-pydantic.sh
#
# Generates Pydantic v2 models from JSON Schema. Output goes to:
#   packages/scrapers/src/bruixola_scrapers/schemas/
#
# Uses datamodel-code-generator from the scrapers' uv venv (NOT a project-wide
# install — keeps Python tooling scoped to the package that needs it).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCHEMA_DIR="$ROOT/packages/shared/schema"
OUT_DIR="$ROOT/packages/scrapers/src/bruixola_scrapers/schemas"

mkdir -p "$OUT_DIR"

# Where datamodel-codegen lives. Prefer the scrapers' uv venv.
DMG=""
if [ -x "$ROOT/packages/scrapers/.venv/bin/datamodel-codegen" ]; then
  DMG="$ROOT/packages/scrapers/.venv/bin/datamodel-codegen"
elif command -v uv >/dev/null 2>&1; then
  DMG="uv run --project $ROOT/packages/scrapers datamodel-codegen"
elif command -v datamodel-codegen >/dev/null 2>&1; then
  DMG="datamodel-codegen"
else
  echo "✗ datamodel-codegen not found. Run: cd packages/scrapers && uv sync" >&2
  exit 1
fi

# Header for the generated package __init__.py
INIT="$OUT_DIR/__init__.py"
{
  echo "# AUTO-GENERATED — DO NOT EDIT BY HAND."
  echo "# Source: packages/shared/schema/*.json"
  echo "# Regenerate: bash packages/shared/scripts/codegen-pydantic.sh"
  echo "# Drift check: bash packages/shared/scripts/verify-no-drift.sh"
  echo "#"
} > "$INIT"

# Generate one Pydantic file per schema
for SCHEMA in "$SCHEMA_DIR"/*.json; do
  STEM="$(basename "$SCHEMA" .json)"
  OUT_FILE="$OUT_DIR/$STEM.py"

  $DMG \
    --input "$SCHEMA" \
    --input-file-type jsonschema \
    --output "$OUT_FILE" \
    --output-model-type pydantic_v2.BaseModel \
    --target-python-version 3.12 \
    --use-standard-collections \
    --use-union-operator \
    --collapse-root-models \
    --use-double-quotes \
    --use-schema-description \
    --field-constraints \
    --enum-field-as-literal one \
    --disable-timestamp \
    --use-default-kwarg \
    --reuse-model

  # Prepend the do-not-edit header
  TMP="$(mktemp)"
  {
    echo "# AUTO-GENERATED — DO NOT EDIT BY HAND."
    echo "# Source: packages/shared/schema/$STEM.json"
    echo "# Regenerate: bash packages/shared/scripts/codegen-pydantic.sh"
    echo "#"
    cat "$OUT_FILE"
  } > "$TMP"
  mv "$TMP" "$OUT_FILE"

  # Re-export via __init__
  PASCAL=$(python3 -c "import re,sys; s=sys.argv[1]; print(''.join(p.capitalize() for p in re.split(r'[_-]', s)))" "$STEM")
  echo "from .$STEM import $PASCAL  # noqa: F401" >> "$INIT"

  printf "  pydantic ✓  %s.py\n" "$STEM"
done
