// AUTO-GENERATED — DO NOT EDIT BY HAND.
// Source: packages/shared/schema/*.json
// Regenerate: bun run --filter '@bruixola/shared' codegen:zod
// Drift check: bash packages/shared/scripts/verify-no-drift.sh
//
import { z } from "zod"

export const AgencySchema = z.object({ "id": z.string().regex(new RegExp("^[0-9a-f]{12}$")).describe("Stable Bruixola agency ID = sha1(name + ':' + city_slug) first 12 hex."), "name": z.string(), "city_slug": z.string().regex(new RegExp("^[a-z0-9-]+$")), "address": z.union([z.string(), z.null()]).optional(), "phone": z.union([z.string(), z.null()]).optional(), "web": z.union([z.string().url(), z.null()]).optional(), "email": z.union([z.string().email(), z.null()]).optional(), "specialty": z.array(z.enum(["sales","rentals","commercial","investment","luxury","social_housing","str","auctions"])).default([]), "is_gestoria": z.boolean().describe("True if this is a gestoría (paperwork/services) rather than a sales agency.").optional(), "verified_at": z.string().datetime({ offset: true }).describe("When the agency was last verified by HTTP-200 + manual sanity check. Stale rows (>180d) are auto-flagged in UI."), "source": z.string().describe("How we found this agency (e.g. 'paginas-amarillas', 'manual', 'chamber-of-commerce').").optional() }).strict().describe("A real-estate agency or gestoría operating in Catalonia.")


export type Agency = z.infer<typeof AgencySchema>;
