// AUTO-GENERATED — DO NOT EDIT BY HAND.
// Source: packages/shared/schema/*.json
// Regenerate: bun run --filter '@bruixola/shared' codegen:zod
// Drift check: bash packages/shared/scripts/verify-no-drift.sh
//
import { z } from "zod"

export const PriceHistorySchema = z.object({ "scope_id": z.string().describe("Either neighborhood.id (12-hex) or city.slug, depending on scope_kind."), "scope_kind": z.enum(["neighborhood","city"]), "month": z.string().regex(new RegExp("^\\d{4}-\\d{2}$")).describe("ISO yyyy-mm of the data point."), "sale_eur_m2": z.union([z.number(), z.null()]).optional(), "rent_eur_m2_mo": z.union([z.number(), z.null()]).optional(), "rent_index_eur_m2_mo": z.union([z.number().describe("SERPAVI ceiling for this scope+month if zona tensionada applies."), z.null().describe("SERPAVI ceiling for this scope+month if zona tensionada applies.")]).describe("SERPAVI ceiling for this scope+month if zona tensionada applies.").optional(), "source": z.string().describe("Origin of this datapoint (e.g. 'fotocasa-index', 'serpavi', 'idealista-pro', 'bruixola-derived').").optional() }).strict().describe("Monthly price index point for a neighborhood or city.")


export type PriceHistory = z.infer<typeof PriceHistorySchema>;
