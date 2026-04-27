// packages/shared/scripts/codegen-zod.ts
//
// Reads JSON Schema files in ../schema/*.json and emits Zod schemas to
// ../src/generated/zod/*.ts. Each output file exports the Zod schema and the
// inferred TypeScript type. An index.ts re-exports everything.
//
// Run: bun run codegen:zod
// Verified by: bash scripts/verify-no-drift.sh

import { readdirSync, readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, basename, join, resolve } from 'node:path';
import { jsonSchemaToZod } from 'json-schema-to-zod';

const HERE = dirname(new URL(import.meta.url).pathname);
const SCHEMA_DIR = resolve(HERE, '..', 'schema');
const OUT_DIR = resolve(HERE, '..', 'src', 'generated', 'zod');

const HEADER = `// AUTO-GENERATED — DO NOT EDIT BY HAND.
// Source: packages/shared/schema/*.json
// Regenerate: bun run --filter '@bruixola/shared' codegen:zod
// Drift check: bash packages/shared/scripts/verify-no-drift.sh
//
`;

function pascalCase(s: string): string {
  return s
    .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}

function emit(): void {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const schemaFiles = readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const indexLines: string[] = [HEADER];

  for (const file of schemaFiles) {
    const stem = basename(file, '.json'); // e.g. 'listing'
    const typeName = pascalCase(stem); // 'Listing'
    const schemaName = `${typeName}Schema`; // 'ListingSchema'

    const raw = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8'));

    const zodSrc = jsonSchemaToZod(raw, {
      name: schemaName,
      module: 'esm',
    });

    // jsonSchemaToZod emits its own `import { z } from "zod"` — trust it,
    // don't double-import. Just prepend our do-not-edit header.
    const out = `${HEADER}${zodSrc}

export type ${typeName} = z.infer<typeof ${schemaName}>;
`;

    writeFileSync(join(OUT_DIR, `${stem}.ts`), out, 'utf8');
    indexLines.push(`export { ${schemaName}, type ${typeName} } from './${stem}.ts';`);
    process.stdout.write(`  zod ✓  ${stem}.ts\n`);
  }

  writeFileSync(join(OUT_DIR, 'index.ts'), indexLines.join('\n') + '\n', 'utf8');
  process.stdout.write(`  zod ✓  index.ts\n`);
}

emit();
