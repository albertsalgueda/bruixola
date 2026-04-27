// AUTO-GENERATED — DO NOT EDIT BY HAND.
// Source: packages/shared/schema/*.json
// Regenerate: bun run --filter '@bruixola/shared' codegen:zod
// Drift check: bash packages/shared/scripts/verify-no-drift.sh
//
import { z } from "zod"

export const NeighborhoodSchema = z.object({ "id": z.string().regex(new RegExp("^[0-9a-f]{12}$")).describe("Stable Bruixola neighborhood ID = sha1(city_slug + ':' + name) first 12 hex."), "city_slug": z.string().regex(new RegExp("^[a-z0-9-]+$")), "name": z.string(), "name_es": z.union([z.string(), z.null()]).optional(), "lat": z.union([z.number().gte(-90).lte(90), z.null()]).optional(), "lng": z.union([z.number().gte(-180).lte(180), z.null()]).optional(), "polygon_geojson": z.union([z.string().describe("Polygon as GeoJSON string (for choropleth/hex aggregation)."), z.null().describe("Polygon as GeoJSON string (for choropleth/hex aggregation).")]).describe("Polygon as GeoJSON string (for choropleth/hex aggregation).").optional(), "avg_sale_eur_m2": z.union([z.number(), z.null()]).optional(), "avg_rent_eur_m2_mo": z.union([z.number(), z.null()]).optional(), "rent_index_eur_m2_mo": z.union([z.number().describe("Neighborhood-level SERPAVI index value if available; falls back to city-level."), z.null().describe("Neighborhood-level SERPAVI index value if available; falls back to city-level.")]).describe("Neighborhood-level SERPAVI index value if available; falls back to city-level.").optional(), "in_zona_tensionada": z.union([z.boolean(), z.null()]).optional() }).strict().describe("A neighborhood within a Catalan city (barri).")


export type Neighborhood = z.infer<typeof NeighborhoodSchema>;
