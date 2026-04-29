# Plan · Listing detail v3 · "Reality Check, not Dashboard"

> Replaces v2. v2 tried to add 8 sections; Codex's CEO review (2026-04-29) gutted that. v3 is the cut: **3 sections, one new artifact (the Reality Check card), photos stay above the fold.**

## What v2 got wrong (per Codex CEO dissent)

1. **PER as a hero KPI is bad** — slow, assumption-heavy, not how someone triages in 5s.
2. **Promoting thesis above photos is backwards** — the thesis is generic Spain-spreadsheet logic; photos answer condition / light / dump-or-not. Front-loading faux precision while deferring raw evidence is a 6-month regret bet.
3. **D ("call agent / model scenarios / verify") is generic SaaS theater** — every listing can say that.
4. **E (city-centroid mini-map) is fake precision** — `listings.walk_to_hospital_min`, `walk_to_metro_min`, `distance_to_beach_m` already exist in the schema. If we have real numbers, show them; if not, don't simulate.
5. **F (HUT density on every detail) is city-thesis, not deal-thesis** — only relevant when STR is the explicit strategy. Belongs on the city page.
6. **H ("gradient risk bar")** doesn't fix the actual problem — that "unknown" is encoded as amber pseudo-information. A gradient just makes ignorance look designed.
7. **The "investor" user is too broad** — codebase already leans operator (`properties`, `deals`, `opportunities`, `viewing_logs`, `pipeline_stages`). Design for **acquisition agent / buyer-side operator**, not casual investor.

## What v3 ships (3 things, ruthlessly)

### 1. The Reality Check card (THE artifact)

A compact dense top-of-page strip that reveals contradictions Idealista cannot:

```
€198,000 · 22% below city median · legal rent cap €889/mo
−€116/mo during mortgage · ranks #2 of your last 3 saves
2 unresolved checks · seen first 3 days ago
```

This is **the screenshot moment**. It exposes the arbitrage story:
- *cheap on price* + *fails under legal cap* = "looks like a bargain, isn't"
- *cheap on price* + *autofinances at cap* = "real bargain"
- *expensive* + *new today* = "act fast" vs *expensive* + *stale 60 days* = "they're stuck"

**Implementation**: replace the current header metadata-pill row (`CONDICIÓ · ETE · ANY · PROPIETARI · ÚLTIM PREU`) with this strip. **Asking price moves to the title row, big**.

### 2. Unified Market Reality (replaces Valoració + histogram + Comparables Propers)

Codex flagged we have **three** market-comparison surfaces today on the same page (`page.tsx:756`, `:965`, plus the embedded histogram). One fused section:

- **Real €/m² distribution** of the comp set (city if ≥8 comps, comarca otherwise; hide if <5).
- **Subject marker line** at this listing's €/m².
- **Comp list below the chart** (5 items, not 2 panels).
- **Provenance footer**: "5 comps a Ripollès · derivat de listings.price_eur ÷ m²" — every numeric block declares observed-vs-inferred.

**Cuts**: the placeholder histogram with literal `[10, 18, 28, 36, 44, 50, ...]` JSX values. The duplicated "Comparació de mercat" + "Comparables propers" rows. The amber "Conjunt de comparables insuficient" message (replaced by honest `n=0` with comarca-fallback note).

### 3. Decision Workflow strip (replaces v2's "D — investor actions")

Connects the public listing to the tenant workspace that already exists in the product:

- **Rank vs your saved properties** — `properties` table joins by tenant. "Aquest pis ranks #2 of your last 3 saves on €/m² delta vs city". Falls back to "save your first 3 listings to unlock ranking" when empty.
- **Unresolved unknowns count** — explicit "2 unresolved checks: cadastre, energy_cert" → shortlist of cheap things to chase. Replaces the static 8-item LLISTA BRÚIXOLA.
- **Action: shortlist / visit / kill** — buttons that mutate `properties.archived_at` or open a `viewing_logs` row. Reuses existing actions in `apps/web/app/listings/actions.ts`.

This is what makes the page a **decision engine** instead of a brochure.

## What gets cut from v2

| v2 section | v3 verdict | reason (per Codex) |
|---|---|---|
| A. Deal card | **kept** with KPI fix | PER → "all-in cash to close" + "rent cap €/mo" + "yield p50" |
| B. Promote thesis above-fold | **rejected** | thesis math too generic to deserve top real estate; one hero photo + Reality Check strip wins |
| C. Real histogram | **kept** | merged into "Market Reality" |
| D. Investor actions | **rewritten** | generic theater → workflow connect to properties/deals |
| E. Map mini-tile + walk-X | **cut** | city centroid is fake precision; schema's per-listing access fields already exist (use them when populated, don't simulate) |
| F. HUT density bar | **moved off detail page** | belongs on the city page (`/cop?city=...`); only relevant for STR thesis |
| G. Vision photo features | **deferred** (Wave 2) | already deferred in v2; remove from candidate set entirely |
| H. Risk gradient bar | **rewritten** | replace "amber-by-default" rows with "n unresolved checks" + a CTA. The fix isn't visual; it's epistemic. |

## What stays unchanged

- `lib/thesis.ts` — keep as-is. The full 3-card thesis panel stays **below the fold**, where it serves users who want depth without front-loading faux precision.
- Photos gallery — stays above thesis but below the Reality Check strip.
- Description + auto-extracted feature chips — kept (already shipped this session).
- Premium gating — apply to Reality Check (rank vs saves) and Decision Workflow. Asking price + photos + description stay free.

## Layout (final)

```
┌────────────────────────────────────────────────────────────┐
│ Title                              €198,000  ·  Save  Add │
│ 176 m² · Campdevànol · primer cop fa 3 dies                │
├────────────────────────────────────────────────────────────┤
│  REALITY CHECK                                             │
│  22% below city median · legal cap €889/mo · −€116/mo      │
│  during mortgage · ranks #2 of your last 3 saves           │
│  2 unresolved checks · cadastre · energy_cert              │
├────────────────────────────────────────────────────────────┤
│  [hero photo, full-width, 16:9]                            │
│  [thumbnail strip below]                                   │
├────────────────────────────────────────────────────────────┤
│  Market Reality (unified comp section)                     │
│  · €/m² distribution + subject marker + comp list          │
├────────────────────────────────────────────────────────────┤
│  Description · auto-extracted features chips               │
├────────────────────────────────────────────────────────────┤
│  Tesis d'inversió (already built, kept where it is)        │
├────────────────────────────────────────────────────────────┤
│  Decision Workflow (rank-vs-saves · unknowns · actions)    │
└────────────────────────────────────────────────────────────┘
```

## Files affected (eng-review preview)

- `apps/web/app/listing/[id]/page.tsx` (~1100 lines today)
  - Delete the 14-bar literal histogram (~lines 540–580 in v2 code).
  - Delete the "Comparació de mercat" duplicate inside the valuation card (~756).
  - Move the Reality Check strip into the header.
  - Wire `/listings/actions.ts` calls into the Decision Workflow section.
- `apps/web/components/listing/reality-check.tsx` (NEW, ~150 lines).
- `apps/web/components/listing/market-reality.tsx` (NEW, ~200 lines, replaces 2 components).
- `apps/web/components/listing/decision-workflow.tsx` (NEW, ~180 lines).
- `apps/web/lib/listing-rank.ts` (NEW): `rankAgainstSavedProperties(listingId, tenantId)` returning `{rank, total, betterOnEurM2, betterOnYield}`.

## What this is NOT (out of scope, won't drift)

- City-centroid map / walk-time card (Codex right: fake precision; reuse `listings.walk_to_*` columns when populated).
- HUT density panel (moved to city page).
- Wave 2 vision (rule-1 reversal pending).
- Catastro per-listing enrichment (blocked on geocoding from descriptions).
- Mobile layout audit beyond Tailwind defaults.

## Risk / open questions surfaced by Codex review

1. **Rank-vs-saves requires ≥3 saved properties per user** — fallback copy "save 3 listings to unlock the ranking comparison" reads as motivation, not error. Confirm.
2. **The Reality Check card is the marketing artifact** — if it sucks, the whole pivot fails. Worth a 1-day visual polish pass before declaring v3 done.
3. **The "freshness" signal** (`first_seen_at`) isn't currently surfaced anywhere. Add to the title row even before Reality Check lands — "primer cop fa 3 dies" is decision-relevant on its own.
4. **`listings.walk_to_*`, `distance_to_beach_m`, `energy_cert`, `year_built`** are mostly null in our scraper output today. Section A's "all-in cash to close" KPI doesn't depend on them. They become useful when Catastro lands.

## Success criteria (revised)

A user landing cold on `/listing/2f838dc0c1d2` (Campdevànol €82k) within 5 seconds answers:
- **What does it cost to own?** → all-in cash to close (€16k down + ITP + notary).
- **Does it autofinance?** → "−€116/mo during mortgage" or "+€116/mo, autofinances".
- **Is it cheap?** → "22% below city median".
- **Is it worth their time?** → "ranks #2 of your last 3 saves" + "2 unresolved checks" — gives them a triage signal.

If those four answers aren't visible in the first 600 vertical pixels: v3 hasn't shipped.

## Codex CEO consensus (single voice; subagent skipped)

| dimension | Codex verdict |
|---|---|
| Premises valid? | **NO** — "investor" is too broad; should be "acquisition agent / operator" |
| Right problem to solve? | **PARTIAL** — fix the placeholders yes, but don't add density; add **decision power** |
| Scope calibration correct? | **NO** — 8 sections is overstuffed; 3 sections + one artifact wins |
| Alternatives explored? | **NO** — v2 didn't consider compare-to-saves as the org principle |
| Competitive risks? | Idealista's strength is photos + scale; Brúixola's is **legal-cap arbitrage + workflow** |
| 6-month trajectory? | **AT RISK** if thesis-above-fold ships before vision/condition intelligence does |

`source: codex-only` — Claude CEO subagent skipped to keep this turn moving; user's pace took priority over dual-voice diligence. Add to follow-up if v3 doesn't feel right after a beat.

## Decision audit trail (auto-decided per /autoplan principles)

| # | decision | classification | principle | rationale |
|---|---|---|---|---|
| 1 | Cut sections E, F, G from v2 candidate set | mechanical | P3 (pragmatic) | Codex caught fake precision (E), wrong scope (F), self-deferred (G) |
| 2 | Replace v2 section A KPIs (PER) with all-in cash + rent cap + yield_p50 | mechanical | P5 (explicit over clever) | PER takes context to interpret; cash-to-close is universally readable |
| 3 | Reject v2 section B (thesis above photos) | mechanical | P5 + P3 | front-loading faux precision violates explicit-over-clever and pragmatic |
| 4 | Replace v2 section D ("modelar escenaris") with workflow connect | taste → auto | P1 (completeness) + repo signal | the codebase has properties/deals/opportunities/viewing_logs already; using them is more complete than a stub |
| 5 | Add NEW Reality Check card section as section 1 | mechanical | P1 + P5 | this is the missing artifact; both Codex and the user's "este es la clau" signal point at it |
| 6 | Skip Claude CEO subagent | taste → auto | P6 (bias toward action) | Codex's CEO output is concrete + actionable; subagent diversity vs delivery delay tradeoff went to delivery |
| 7 | Skip Phase 3 Eng review entirely | taste → auto | P3 (pragmatic) | the eng changes are surface-level component swaps; Codex's CEO findings already name the files. A separate eng phase would mostly restate them. |
| 8 | Skip Phase 3.5 DX review | mechanical | scope | the listing page isn't developer-facing |

## What needs your sign-off (final gate)

- **User Challenge** (both models would agree, but only Codex weighed in): the v2 "investor" framing is wrong. v3 designs for "acquisition agent / buyer-side operator". This changes what KPIs lead the page. **Your call** — your domain knowledge of the actual user beats both models.
- **Taste decision (1)**: cut the city-centroid mini-map. Accept (recommended) or keep as a thumbnail-only.
- **Taste decision (2)**: skip the dual-voice Eng review (Codex eng pass) to keep this turn moving. Accept (recommended) or run it before implementation.
- **Taste decision (3)**: ship v3 by replacing existing sections in-place vs feature-flag rollout. In-place (recommended) — there are no analytics + low traffic; feature flag adds complexity without payoff.
