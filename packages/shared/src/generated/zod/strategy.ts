// AUTO-GENERATED — DO NOT EDIT BY HAND.
// Source: packages/shared/schema/*.json
// Regenerate: bun run --filter '@bruixola/shared' codegen:zod
// Drift check: bash packages/shared/scripts/verify-no-drift.sh
//
import { z } from "zod"

export const StrategySchema = z.object({ "id": z.string().regex(new RegExp("^[a-z0-9-]+$")), "title": z.string(), "title_es": z.union([z.string(), z.null()]).optional(), "thesis": z.string().describe("Multi-paragraph human-authored thesis describing why this strategy works (or doesn't, currently)."), "filter_query": z.record(z.string(), z.any()).describe("Structured filter applied to listings to surface candidates. Schema defined per-strategy and validated at API."), "yield_posture": z.enum(["long_let_residential","long_let_student","long_let_hospital_staff","str_hut","value_add_reform","buy_and_flip"]).describe("Drives which yield_formula_version applies and which UI atoms surface in the dossier."), "example_listing_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{12}$"))).optional(), "avg_yield_pct_p50": z.union([z.number(), z.null()]).optional(), "risk_score": z.union([z.number().int().gte(0).lte(100).describe("Hand-curated, 0=lowest risk, 100=highest."), z.null().describe("Hand-curated, 0=lowest risk, 100=highest.")]).describe("Hand-curated, 0=lowest risk, 100=highest.").optional() }).strict().describe("A hand-curated investment thesis with a saved filter and yield posture. Each Strategy is a saved-filter + yield-formula pair; the platform supports many at once.")


export type Strategy = z.infer<typeof StrategySchema>;
