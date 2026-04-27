// @bruixola/shared — cross-language types
//
// JSON Schema in ../schema/*.json is the source of truth.
// Pydantic models live in packages/scrapers/src/bruixola_scrapers/schemas/.
// Zod schemas live in ./generated/zod/ and are re-exported here.
//
// Edit JSON Schema; run `bun run --filter '@bruixola/shared' codegen` after.
// CI runs `bun run schema:verify` to enforce no drift.

export * from './generated/zod/index.ts';
