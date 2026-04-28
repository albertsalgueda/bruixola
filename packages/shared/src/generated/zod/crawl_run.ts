// AUTO-GENERATED — DO NOT EDIT BY HAND.
// Source: packages/shared/schema/*.json
// Regenerate: bun run --filter '@bruixola/shared' codegen:zod
// Drift check: bash packages/shared/scripts/verify-no-drift.sh
//
import { z } from "zod"

export const CrawlRunSchema = z.object({ "id": z.string().uuid().describe("UUID assigned at run start."), "platform": z.enum(["habitaclia","fotocasa","solvia","api_cat","pisos","idealista","local"]).describe("'local' for long-tail town-specific outlets — disambiguate via source_host."), "source_host": z.union([z.string().describe("Hostname for local-kind crawls; null for the four majors."), z.null().describe("Hostname for local-kind crawls; null for the four majors.")]).describe("Hostname for local-kind crawls; null for the four majors.").optional(), "started_at": z.string().datetime({ offset: true }), "finished_at": z.union([z.string().datetime({ offset: true }), z.null()]).optional(), "status": z.enum(["running","ok","partial","error"]).describe("running = in flight. ok = clean exit. partial = exception mid-run, some rows persisted. error = failed before any rows persisted."), "pages_fetched": z.number().int().gte(0).default(0), "listings_seen": z.number().int().gte(0).default(0), "error_count": z.number().int().gte(0).default(0), "notes": z.union([z.string(), z.null()]).optional() }).strict().describe("One execution of the scraper pipeline against one source. Listings upserted during a run carry this run's id in listings.crawl_id.")


export type CrawlRun = z.infer<typeof CrawlRunSchema>;
