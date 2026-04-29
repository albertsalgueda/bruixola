<!-- /autoplan restore point: /Users/albertsalgueda/.gstack/projects/albertsalgueda-real-estate-intelligence/main-autoplan-restore-20260429-211122.md -->
# Plan · Listing detail v2 · "Inform a real investor"

## Why we're rewriting it

The current `/listing/[id]` page tells the user **what we scraped** more than **what to do about it**. From three user gripes (2026-04-29):

1. **Asking price is buried.** Header shows "ÚLTIM PREU 95.000 €" in a tiny grey row at the right of the metadata pills. An investor scanning the page can't find the listing price in <500ms.
2. **Valuation card layout is unparseable.** The 22%-below-mediana band, the histogram, and the comp set are stacked in one column with no visual hierarchy and no explanation of axes / what the histogram represents. The user said: "la distribucio no l'entenc."
3. **Thesis panel is the best part but buried.** The cashflow/appreciation/flip cards live below a 600-pixel three-column body. The user said: "això és el que està millor però costa de trobar, aquesta es la clau."

Goal: every numeric block on the page should answer **one investor question** and surface a concrete action (track / contact agent / model alternative scenario).

## Data we already have in Supabase

| signal | source | listings covered |
|---|---|---|
| `price_eur`, `m2`, `beds`, `baths` | scrapers | 295 / 295 |
| `gross_yield_pct_p25/p50/p75` | listings × city rent | 245 / 295 |
| `gross_yield_pct_legal_max` | SERPAVI per-listing | 113 / 295 |
| `rent_index_ceiling_eur_m2_mo` | SERPAVI | 113 / 295 |
| `condition_label` | description regex | 75 / 295 |
| `okupa_risk` | description regex | 6 / 295 |
| `lift` | description regex | 38 / 295 |
| `photos[]` | scraper | 295 / 295 (~6,400 URLs) |
| `description` | scraper | 250+ / 295 |
| `address` (street where present) | scraper | Idealista listings |
| city `sale_eur_m2`, `rent_eur_m2_mo` | derived from listings + Generalitat | 45–170 cities |
| `cities.zmrt_level`, `in_zona_tensionada` | Generalitat fftm-v9b6 | 175 / 194 |
| `osm_amenities` (hospitals, transit, schools, beaches) | OSM Overpass | 4,525 features |
| `hut_licenses` (with `referencia_cadastral`) | Generalitat t2h3-cgys | 107k rows, 15k joinable |

Plus the `lib/thesis.ts` deterministic model already built (cashflow / appreciation / flip).

## Candidate sections (to be ranked + cut)

### A. Above-the-fold "deal card"
- Big, bold **asking price** (right of title, not buried in metadata pills).
- One-line **delta vs city median** ("22% per sota mediana · 103.906 €–140.578 € rang").
- One-line **legal context** ("ZMRT 1 · sostre legal 4,9 €/m²/mo" or "Fora de zona").
- One-line **condition** (real, not "Desconegut" — fall back to the photo-vision Wave 2 result; if none, hide).
- 4 KPI tiles in a strip: **Yield brut**, **Cashflow durant**, **Capital inicial**, **PER**. Each tile clickable → scrolls to its thesis card below.

Removes the "PROPIETARI · NO DISPONIBLE", "ETE —", "ANY —" placeholders that currently dominate the header. Hide pills with no data; don't show "—".

### B. Promote thesis panel above-the-fold
- Move the three thesis cards immediately under the deal card, before photos, NOT below the 3-column body.
- Make each card width-responsive (40%/40%/20% on desktop, stacked on mobile).
- Each card gets a one-sentence **lede** at the top: "Aquest pis NO s'autofinança" / "S'autofinança · 116€/mes net" / "Flip negatiu — pis ja en bon estat" — punchy text the agent could read aloud.

### C. Replace placeholder histogram with a real distribution
- The current 14-bar histogram is hardcoded — `[10, 18, 28, 36, 44, 50, 46, 38, 32, 24, 16, 10, 6, 4]` literal in JSX. It carries zero information.
- Replace with the actual €/m² distribution of the comp set (city or comarca depending on which fallback fired). Mark the subject's €/m² with a vertical line. Show P25/P50/P75 ticks.
- If <8 comps to compute a real distribution, hide the histogram entirely.

### D. Investor-action panel ("What to do now")
- Three concrete next steps based on the thesis output:
  - "Trucar a l'agent · {agency_name} · {phone}"
  - "Modelar escenaris · canvia LTV / rate / reno €/m²"
  - "Verificar · cadastre + visita en persona"
- Live link to a `?scenario=...` URL parameter that re-runs the thesis with custom assumptions (LTV slider, rate slider, reno €/m² slider). Server-renders new numbers — no client-side JS heavy.

### E. Map mini-tile + walk-time intelligence
- 200×200 pixel inset map of the listing's city centroid.
- Pull from `osm_amenities` + haversine distance:
  - Closest **hospital** (km)
  - Closest **train/metro** (km)
  - Closest **school** (km)
  - Closest **beach** (km, only if <50km — hide for inland)
- This is the "walk-to-X" data the schema's been waiting for. Server-side haversine, no client tile loading.

### F. HUT density bar
- For the listing's city: count of active HUT licenses, % of housing stock.
- A 1-row sparkline showing the comarca's HUT-density vs Catalonia avg.
- Drives the STR thesis — "this town has 850 active HUT licenses; STR competition is heavy."

### G. Description signal extraction (Wave 2 vision)
- Deferred until the rule-1 reversal lands. When activated: extract from photos `light_level`, `view_quality`, `kitchen_modernity`, `has_pool`, `has_garden`, `condition_visible`. Surface as a chip row above the description.

### H. Risk panel hardening
- Replace "Sense dades" / "Estat sense verificar" rows with a coloured **gradient bar**: green (verified) → amber (signal-based) → red (unverified). The current text-heavy rows make every listing look "bad" because they default to amber.
- Each row links to "How we verify this" copy.

## Layout

```
┌─────────────────────────────────────────────────┐
│  [photo hero]  │  Title + asking price + delta  │  ← deal card, single row
│                │  4 KPI tiles                   │
├────────────────┴────────────────────────────────┤
│  Thesis panel · 3 cards (cashflow / appr / flip)│  ← above the fold
├─────────────────────────────────────────────────┤
│  Photos gallery + description + features chips  │
├──────────────┬─────────────────┬────────────────┤
│  Valoració   │  Map + walk-X   │  Comparables   │  ← 3-col body
│  + histogram │  + HUT density  │  scope-aware   │
├──────────────┴─────────────────┴────────────────┤
│  Risc gradient + verification checklist (LOCKED)│
├─────────────────────────────────────────────────┤
│  Investor actions · CTA strip                   │
└─────────────────────────────────────────────────┘
```

## Paywall / premium gating

Logged-in tenant: full access to thesis, valuation, comparables, walk-X, HUT density.
Anonymous: photos + description + asking price visible. Everything else **blurred** with the existing `<PremiumGate>` overlay → modal CTA.

The `lib/auth/tenant.ts` `getMyTenantId()` is the gate. Already wired.

## Out of scope for this v2

- Vision analysis (Wave 2, separate plan).
- Catastro per-listing enrichment (Wave 2, blocked on geocode).
- Scenario sliders with proper state machine (live-fire MVP without sliders, server params only).
- Mobile layout pass beyond Tailwind defaults.

## Risk / open questions for the review

1. **Hardcoded histogram replacement** — when comp count < 8, do we hide the histogram or show it noisy? Hide is cleaner; might reduce information density on every Ripollès small-town listing.
2. **Map tile** — Mapbox token is already in env. Cost: free tier 50k loads/mo. 295 listings × N investor views ≈ comfortable. Confirm.
3. **Investor-action panel** — should the "Modelar escenaris" CTA actually wire scenario sliders in v2 or stay a stub? Stub is faster; sliders in v3.
4. **Thesis-above-the-fold** — moves the photos below. Some users will scroll past expecting photos first. Worth A/B but we don't have analytics. Default: thesis above unless visual is the primary signal (e.g., when condition_label='unknown' and we have ≥10 photos, lead with photos).
5. **Description "regex chip" extraction** — keep as a separate card or fold into the thesis (e.g., "Piscina detected → STR yield bump"). Folding adds complexity.

## Success criteria

A user landing cold on `/listing/2f838dc0c1d2` (Campdevànol €82k bargain) within 5 seconds knows:
- the asking price (€82k, big),
- the city-median delta (75% per sota — bargain alert),
- yield p50 (17.6%),
- whether it autofinances (probably yes, badge visible),
- the closest hospital / transit / beach without scrolling.

Without those: the page is "still made of crap" per the user.
