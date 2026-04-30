import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { createClient } from '@/lib/supabase/server';
import type { Listing, ConditionLabel, Strategy } from '@/lib/supabase/types';
import { TopBar } from '@/components/chrome/top-bar';
import { Badge } from '@/components/primitives/badge';
import { ListingCard } from '@/components/listings/listing-card';
import { FilterSidebar } from '@/components/listings/filter-sidebar';
import { getMyTenantId } from '@/lib/auth/tenant';
import { trackListing, untrackListing } from './actions';
import { formatEur, formatNumber, formatPct } from '@/lib/format';
import { t } from '@/lib/i18n';
import { getActivityCount24h } from '@/lib/activity';

/**
 * `/listings` — public scraped anuncis browser.
 *
 * Photo-driven grid by default (real-estate decisions are visual). Filter
 * sidebar is always-on; the active-filter chip row stays for visibility.
 * Three views:
 *  - GRID  (default) — card grid, photos
 *  - TAULA — dense sortable table for power-users
 *  - MAPA  — geographic distribution
 */

const DASH = '–';

type SearchParams = {
  q?: string;
  city?: string;
  max_price_eur?: string;
  min_yield_p50?: string;
  condition?: string;
  in_zona_tensionada?: string;
  strategy?: string;
  sort?: string;
  dir?: string;
  view?: string;
  /** Investment-thesis filter — see `THESES` below. */
  tesi?: 'cashflow' | 'bargain' | 'flip';
  /** Minimum monthly cashflow during mortgage (€). Negative numbers allowed. */
  min_cashflow?: string;
};

/**
 * Thesis presets — each one bundles 2-3 filters that, together, surface
 * listings that pencil out under that thesis. Composable with the existing
 * filter chips; written in URL space so they're shareable + back-button safe.
 */
const THESES: Record<
  NonNullable<SearchParams['tesi']>,
  {
    label: string;
    description: string;
    /** Predicate run AFTER thesis is computed in JS (after the Supabase query). */
    pass: (row: { cashflow_during: number | null; delta_pct: number | null; condition_label: string }) => boolean;
  }
> = {
  cashflow: {
    label: 'Autofinança',
    description: 'Lloguer durant hipoteca cobreix despeses + quota.',
    pass: (r) => r.cashflow_during != null && r.cashflow_during > 0,
  },
  bargain: {
    label: 'Per sota mediana',
    description: '≥ 10% per sota la mediana €/m² de la ciutat.',
    pass: (r) => r.delta_pct != null && r.delta_pct <= -10,
  },
  flip: {
    label: 'Reform & flip',
    description: 'Cal reformar i preu per sota mediana.',
    pass: (r) =>
      r.condition_label === 'reform_needed' &&
      r.delta_pct != null &&
      r.delta_pct < 0,
  },
};

type ConditionVariant =
  | 'good'
  | 'warning'
  | 'critical'
  | 'info'
  | 'ghost-amber';

const CONDITION_VARIANT: Record<ConditionLabel, ConditionVariant> = {
  reformado: 'good',
  good: 'info',
  reform_needed: 'warning',
  wreck: 'critical',
  unknown: 'ghost-amber',
};

const SORTABLE: Record<string, string> = {
  price_eur: 'price_eur',
  m2: 'm2',
  gross_yield_pct_p50: 'gross_yield_pct_p50',
  first_seen_at: 'first_seen_at',
  // Note: 'cashflow' isn't a DB column — sorted in-memory after thesis compute.
  cashflow: 'cashflow',
};

const SORT_LABELS: Record<string, string> = {
  first_seen_at: 'Més recents',
  gross_yield_pct_p50: 'Yield P50',
  price_eur: 'Preu',
  m2: 'Superfície',
  cashflow: 'Cashflow',
};

function parseNumber(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBool(raw: string | undefined): boolean | null {
  if (raw == null || raw === '') return null;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return null;
}

function urlWithout(
  params: Record<string, string | undefined>,
  keys: string[],
): Route {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (!keys.includes(k) && v != null && v !== '') sp.set(k, v);
  }
  const qs = sp.toString();
  return (qs ? `/listings?${qs}` : '/listings') as Route;
}

function urlWith(
  params: Record<string, string | undefined>,
  patch: Record<string, string | undefined>,
): Route {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) {
    if (v != null && v !== '') sp.set(k, v);
  }
  const qs = sp.toString();
  return (qs ? `/listings?${qs}` : '/listings') as Route;
}

type StrategyFilter = {
  city?: string | string[];
  city_slug?: string | string[];
  max_price_eur?: number;
  min_beds?: number;
  beds_gte?: number;
};

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const q = params.q?.trim() || null;
  const cityFilter = params.city?.trim() || null;
  const maxPrice = parseNumber(params.max_price_eur);
  const minYield = parseNumber(params.min_yield_p50);
  const conditionFilter = params.condition?.trim() || null;
  const zonaTensFilter = parseBool(params.in_zona_tensionada);
  const strategySlug = params.strategy?.trim() || null;
  const sort =
    params.sort && SORTABLE[params.sort] ? params.sort : 'first_seen_at';
  const dir = params.dir === 'asc' ? 'asc' : 'desc';
  // The map view lives at /cop?map=anuncis now — redirect legacy URLs there.
  if (params.view === 'map') {
    redirect('/cop?map=anuncis');
  }
  const view: 'grid' | 'table' =
    params.view === 'table' ? 'table' : 'grid';

  let strategy: Strategy | null = null;
  let strategyFilter: StrategyFilter | null = null;
  if (strategySlug) {
    const { data } = await supabase
      .from('strategies')
      .select('*')
      .eq('slug', strategySlug)
      .maybeSingle();
    strategy = (data ?? null) as Strategy | null;
    if (strategy && strategy.filter_query && typeof strategy.filter_query === 'object') {
      strategyFilter = strategy.filter_query as StrategyFilter;
    }
  }

  let query = supabase
    .from('listings')
    .select('*')
    .is('removed_at', null)
    .order(sort, { ascending: dir === 'asc' })
    .limit(200);

  if (q) {
    const safe = q.replace(/[%,]/g, ' ');
    query = query.or(`address.ilike.%${safe}%,title.ilike.%${safe}%`);
  }
  if (cityFilter) query = query.eq('city_slug', cityFilter);
  if (maxPrice != null) query = query.lte('price_eur', maxPrice);
  if (minYield != null) query = query.gte('gross_yield_pct_p50', minYield);
  if (conditionFilter) query = query.eq('condition_label', conditionFilter);
  if (zonaTensFilter != null)
    query = query.eq('in_zona_tensionada', zonaTensFilter);

  if (strategyFilter) {
    const cityValue = strategyFilter.city_slug ?? strategyFilter.city;
    if (Array.isArray(cityValue)) {
      if (cityValue.length > 0) query = query.in('city_slug', cityValue);
    } else if (typeof cityValue === 'string' && cityValue.length > 0) {
      query = query.eq('city_slug', cityValue);
    }
    if (typeof strategyFilter.max_price_eur === 'number') {
      query = query.lte('price_eur', strategyFilter.max_price_eur);
    }
    const minBeds = strategyFilter.min_beds ?? strategyFilter.beds_gte;
    if (typeof minBeds === 'number') query = query.gte('beds', minBeds);
  }

  const tenantId = await getMyTenantId();

  const [{ data }, activityCount, citiesAllRes, trackedRes] = await Promise.all(
    [
      query,
      getActivityCount24h(),
      // Always fetch the slug→name list for the sidebar dropdown.
      supabase.from('cities').select('slug, name').order('name'),
      tenantId
        ? supabase
            .from('properties')
            .select('source_listing_id')
            .eq('tenant_id', tenantId)
            .is('archived_at', null)
            .not('source_listing_id', 'is', null)
        : Promise.resolve({ data: null as null }),
    ],
  );

  const listings = (data ?? []) as Listing[];
  const cities = (citiesAllRes.data ?? []) as Array<{
    slug: string;
    name: string;
  }>;

  // ── v3 thesis-aware enrichments ────────────────────────────────────────
  // For every listing in the result set, compute a lightweight cashflow
  // and median-delta so users can filter by investment thesis.
  // We pull the latest city-level €/m² + rent benchmark from price_history
  // in a single batch query (one round-trip, indexed lookup).
  const distinctCitySlugs = Array.from(
    new Set(listings.map((l) => l.city_slug).filter((s): s is string => !!s)),
  );
  let cityBench: Map<string, { sale: number | null; rent: number | null; rentIdx: number | null }> =
    new Map();
  if (distinctCitySlugs.length > 0) {
    const { data: phRows } = await supabase
      .from('price_history')
      .select('scope_id, month, sale_eur_m2, rent_eur_m2_mo, rent_index_eur_m2_mo')
      .eq('scope_kind', 'city')
      .in('scope_id', distinctCitySlugs);
    // Reduce to latest month per city.
    const latest = new Map<string, { sale: number | null; rent: number | null; rentIdx: number | null; month: string }>();
    for (const r of (phRows ?? []) as Array<{
      scope_id: string;
      month: string;
      sale_eur_m2: number | string | null;
      rent_eur_m2_mo: number | string | null;
      rent_index_eur_m2_mo: number | string | null;
    }>) {
      const prev = latest.get(r.scope_id);
      if (!prev || r.month > prev.month) {
        latest.set(r.scope_id, {
          month: r.month,
          sale: r.sale_eur_m2 != null ? Number(r.sale_eur_m2) : null,
          rent: r.rent_eur_m2_mo != null ? Number(r.rent_eur_m2_mo) : null,
          rentIdx: r.rent_index_eur_m2_mo != null ? Number(r.rent_index_eur_m2_mo) : null,
        });
      }
    }
    cityBench = new Map(
      Array.from(latest.entries()).map(([slug, v]) => [slug, { sale: v.sale, rent: v.rent, rentIdx: v.rentIdx }]),
    );
  }

  // Pull the deterministic thesis math, run it per row.
  const { computeThesis } = await import('@/lib/thesis');
  const enrichedListings = listings.map((l) => {
    const bench = cityBench.get(l.city_slug);
    const cityMedianEurM2 = bench?.sale ?? null;
    const subjectEurM2 = l.m2 && l.m2 > 0 ? l.price_eur / l.m2 : null;
    const delta_pct =
      cityMedianEurM2 != null && subjectEurM2 != null
        ? Math.round(((subjectEurM2 - cityMedianEurM2) / cityMedianEurM2) * 100)
        : null;
    const thesis = computeThesis({
      priceEur: Number(l.price_eur),
      m2: l.m2 ?? null,
      rentEurM2Mo: bench?.rent ?? null,
      rentLegalCapEurM2Mo:
        l.rent_index_ceiling_eur_m2_mo != null
          ? Number(l.rent_index_ceiling_eur_m2_mo)
          : (bench?.rentIdx ?? null),
      cityMedianSaleEurM2: cityMedianEurM2,
      conditionLabel: (l.condition_label ?? 'unknown') as
        | 'reformado' | 'good' | 'reform_needed' | 'wreck' | 'unknown',
      inZonaTensionada: l.in_zona_tensionada ?? null,
    });
    return {
      ...l,
      _cashflow_during: thesis.cashflow.during,
      _cashflow_coc: thesis.cashflow.cocReturnPct,
      _delta_pct: delta_pct,
      _eur_m2: subjectEurM2 != null ? Math.round(subjectEurM2) : null,
    };
  });

  // Apply thesis preset (post-query, in-memory — these predicates need the
  // computed cashflow that doesn't live in the DB).
  const tesi = params.tesi as keyof typeof THESES | undefined;
  const minCashflow = parseNumber(params.min_cashflow);
  let filteredListings = enrichedListings;
  if (tesi && THESES[tesi]) {
    filteredListings = filteredListings.filter((l) =>
      THESES[tesi].pass({
        cashflow_during: l._cashflow_during,
        delta_pct: l._delta_pct,
        condition_label: l.condition_label,
      }),
    );
  }
  if (minCashflow != null) {
    filteredListings = filteredListings.filter(
      (l) => l._cashflow_during != null && l._cashflow_during >= minCashflow,
    );
  }
  // Cashflow sort runs in JS (column doesn't exist on Supabase row).
  if (sort === 'cashflow') {
    const mult = dir === 'asc' ? 1 : -1;
    filteredListings = [...filteredListings].sort((a, b) => {
      const av = a._cashflow_during ?? -Infinity;
      const bv = b._cashflow_during ?? -Infinity;
      return mult * (av - bv);
    });
  }
  // Replace `listings` for downstream rendering.
  type EnrichedListing = (typeof enrichedListings)[number];
  const trackedRows = (trackedRes as { data: unknown }).data as
    | Array<{ source_listing_id: string }>
    | null;
  const trackedIds = new Set(
    (trackedRows ?? []).map((r) => r.source_listing_id),
  );

  // Active-filter chips (do not include `q` here — it has its own input).
  const activeFilters: Array<{ key: string; label: string }> = [];
  if (cityFilter)
    activeFilters.push({ key: 'city', label: `ciutat: ${cityFilter}` });
  if (maxPrice != null)
    activeFilters.push({
      key: 'max_price_eur',
      label: `preu ≤ ${formatEur(maxPrice)}`,
    });
  if (minYield != null)
    activeFilters.push({
      key: 'min_yield_p50',
      label: `yield ≥ ${formatPct(minYield)}`,
    });
  if (conditionFilter)
    activeFilters.push({
      key: 'condition',
      label: `condició: ${t(conditionFilter, 'condition_label')}`,
    });
  if (zonaTensFilter != null)
    activeFilters.push({
      key: 'in_zona_tensionada',
      label: zonaTensFilter ? 'zona tensionada' : 'sense zona tensionada',
    });
  if (strategy)
    activeFilters.push({ key: 'strategy', label: `tesi: ${strategy.title}` });
  if (tesi && THESES[tesi])
    activeFilters.push({ key: 'tesi', label: `tesi: ${THESES[tesi].label}` });
  if (minCashflow != null)
    activeFilters.push({
      key: 'min_cashflow',
      label: `cashflow ≥ ${formatNumber(minCashflow)}€`,
    });

  const passthroughParams: Record<string, string | undefined> = {
    q: q ?? undefined,
    city: cityFilter ?? undefined,
    max_price_eur: maxPrice != null ? String(maxPrice) : undefined,
    min_yield_p50: minYield != null ? String(minYield) : undefined,
    condition: conditionFilter ?? undefined,
    in_zona_tensionada:
      zonaTensFilter == null ? undefined : zonaTensFilter ? 'true' : 'false',
    strategy: strategySlug ?? undefined,
    tesi: tesi ?? undefined,
    min_cashflow: minCashflow != null ? String(minCashflow) : undefined,
    view: view !== 'grid' ? view : undefined,
  };

  // Build the return-to URL for track/untrack so they land back on the same
  // filtered query state.
  const returnTo: string = (() => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(passthroughParams)) {
      if (v != null && v !== '') sp.set(k, v);
    }
    const qs = sp.toString();
    return qs ? `/listings?${qs}` : '/listings';
  })();

  function sortHref(col: string): Route {
    const nextDir = sort === col ? (dir === 'asc' ? 'desc' : 'asc') : 'desc';
    return urlWith(passthroughParams, { sort: col, dir: nextDir });
  }
  function sortIndicator(col: string): string {
    if (sort !== col) return '';
    return dir === 'asc' ? ' ↑' : ' ↓';
  }

  return (
    <div className="min-h-screen bg-bg-0 text-ink-1">
      <TopBar activityCount={activityCount} initialQuery={q ?? ''} />

      <main className="mx-auto max-w-[1600px] px-6 py-5">
        {/* Slim header */}
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line-1 pb-3">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan">
              Anuncis · Catalunya
            </span>
            <span className="font-mono text-[11px] tabular-nums text-ink-2">
              {formatNumber(filteredListings.length)} pisos
              {activeFilters.length + (q ? 1 : 0) > 0 || tesi ? ' coincideixen' : ' al mercat'}
              {tesi && filteredListings.length !== listings.length && (
                <span className="ml-2 text-ink-3">
                  ({listings.length} sense filtre)
                </span>
              )}
            </span>

            {/* Thesis preset chips — one click to filter by investment thesis */}
            <div className="ml-2 flex items-center gap-1">
              {(['cashflow', 'bargain', 'flip'] as const).map((key) => {
                const active = tesi === key;
                const href = active
                  ? urlWithout(passthroughParams, ['tesi'])
                  : urlWith(passthroughParams, { tesi: key });
                return (
                  <Link
                    key={key}
                    href={href}
                    title={THESES[key].description}
                    className={
                      active
                        ? 'rounded-sm border border-cyan bg-cyan/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan'
                        : 'rounded-sm border border-line-2 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2 hover:border-cyan-dim hover:text-ink-1'
                    }
                  >
                    {active ? '✓ ' : ''}{THESES[key].label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <SortDropdown
              currentSort={sort}
              currentDir={dir}
              params={passthroughParams}
            />
            <ViewToggle currentView={view} params={passthroughParams} />
          </div>
        </header>

        {/* Active-filter chips */}
        {(activeFilters.length > 0 || q) && (
          <section
            aria-label="Filtres actius"
            className="mb-4 flex flex-wrap items-center gap-2"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
              Actius
            </span>
            {q && (
              <Link
                href={urlWithout(passthroughParams, ['q'])}
                className="inline-flex"
                aria-label={`Esborrar cerca '${q}'`}
              >
                <Badge variant="ghost-cyan">
                  cerca: {q}{' '}
                  <span className="ml-1 text-ink-2 hover:text-ink-0">×</span>
                </Badge>
              </Link>
            )}
            {activeFilters.map((f) => (
              <Link
                key={f.key}
                href={urlWithout(passthroughParams, [f.key])}
                className="inline-flex"
                aria-label={`Esborrar filtre ${f.label}`}
              >
                <Badge variant="ghost-cyan">
                  {f.label}{' '}
                  <span className="ml-1 text-ink-2 hover:text-ink-0">×</span>
                </Badge>
              </Link>
            ))}
            {activeFilters.length + (q ? 1 : 0) >= 2 && (
              <Link
                href={'/listings' as Route}
                className="ml-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3 hover:text-cyan"
              >
                Esborrar tots
              </Link>
            )}
          </section>
        )}

        {/* Two-column body — sidebar + results. */}
        {(
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
            <FilterSidebar
              cities={cities}
              q={q}
              city={cityFilter}
              maxPrice={maxPrice}
              minYield={minYield}
              condition={conditionFilter}
              zonaTensionada={zonaTensFilter}
              strategy={strategySlug}
              view={view}
            />

            {filteredListings.length === 0 ? (
              <EmptyResults />
            ) : view === 'grid' ? (
              <section
                aria-label="Resultats"
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
              >
                {filteredListings.map((l) => (
                  <ListingCard
                    key={l.id}
                    listing={l}
                    tracked={trackedIds.has(l.id)}
                    loggedIn={tenantId != null}
                    returnTo={returnTo}
                    cashflowDuring={l._cashflow_during ?? null}
                    deltaPct={l._delta_pct ?? null}
                  />
                ))}
              </section>
            ) : (
              <>
                {/* Power table only renders on tablet/desktop. On mobile we
                    silently fall back to the card grid — a 12-column table is
                    unusable in 375px even with horizontal scroll. */}
                <div className="hidden md:block">
                  <PowerTable
                    listings={filteredListings}
                    trackedIds={trackedIds}
                    loggedIn={tenantId != null}
                    returnTo={returnTo}
                    sortHref={sortHref}
                    sortIndicator={sortIndicator}
                  />
                </div>
                <section
                  aria-label="Resultats (mòbil)"
                  className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:hidden"
                >
                  {filteredListings.map((l) => (
                    <ListingCard
                      key={l.id}
                      listing={l}
                      tracked={trackedIds.has(l.id)}
                      loggedIn={tenantId != null}
                      returnTo={returnTo}
                      cashflowDuring={l._cashflow_during ?? null}
                      deltaPct={l._delta_pct ?? null}
                    />
                  ))}
                </section>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * GRID · TAULA toggle (same page) plus a "Mapa" link that crosses over to
 * /cop?map=anuncis — the unified geographic surface lives there, not here.
 */
function ViewToggle({
  currentView,
  params,
}: {
  currentView: 'grid' | 'table';
  params: Record<string, string | undefined>;
}) {
  const opts: Array<{ key: 'grid' | 'table'; label: string }> = [
    { key: 'grid', label: 'Grid' },
    { key: 'table', label: 'Taula' },
  ];
  return (
    <div
      role="tablist"
      aria-label="Vista d'anuncis"
      className="flex items-stretch border border-line-1 bg-bg-1"
    >
      {opts.map((o) => {
        const href = urlWith(params, {
          view: o.key === 'grid' ? undefined : o.key,
        });
        const active = currentView === o.key;
        return (
          <Link
            key={o.key}
            href={href}
            role="tab"
            aria-selected={active}
            className={
              'px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] ' +
              (active
                ? 'bg-cyan/15 text-cyan'
                : 'text-ink-3 hover:text-ink-1')
            }
          >
            {o.label}
          </Link>
        );
      })}
      <Link
        href={'/cop?map=anuncis' as Route}
        role="tab"
        aria-selected={false}
        className="border-l border-line-1 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-1"
        title="Mapa al COP"
      >
        Mapa →
      </Link>
    </div>
  );
}

/** Sort dropdown — submits as GET to /listings, preserves filters. */
function SortDropdown({
  currentSort,
  currentDir,
  params,
}: {
  currentSort: string;
  currentDir: 'asc' | 'desc';
  params: Record<string, string | undefined>;
}) {
  const opts: Array<{ key: string; label: string; defaultDir: 'asc' | 'desc' }> = [
    { key: 'first_seen_at', label: 'Més recents', defaultDir: 'desc' },
    { key: 'gross_yield_pct_p50', label: 'Yield ↓', defaultDir: 'desc' },
    { key: 'price_eur', label: 'Preu ↑', defaultDir: 'asc' },
    { key: 'price_eur:desc', label: 'Preu ↓', defaultDir: 'desc' },
    { key: 'm2', label: 'Superfície ↓', defaultDir: 'desc' },
  ];
  return (
    <form
      action="/listings"
      method="get"
      className="flex items-center gap-2 border border-line-1 bg-bg-1 px-2 py-1"
    >
      {/* preserve filters */}
      {Object.entries(params)
        .filter(([k]) => k !== 'sort' && k !== 'dir')
        .map(
          ([k, v]) =>
            v != null && (
              <input key={k} type="hidden" name={k} value={v} />
            ),
        )}
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
        Ordre
      </span>
      <select
        name="sort"
        defaultValue={
          currentSort === 'price_eur' && currentDir === 'desc'
            ? 'price_eur:desc'
            : currentSort
        }
        onChange={undefined}
        className="bg-transparent font-mono text-[10px] uppercase tracking-[0.16em] text-ink-1 focus:outline-none"
      >
        {opts.map((o) => (
          <option key={o.key} value={o.key}>
            {SORT_LABELS[o.key.split(':')[0]!] ?? o.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan hover:text-cyan-hot"
      >
        Aplicar
      </button>
    </form>
  );
}

function EmptyResults() {
  return (
    <div className="col-span-full flex h-64 flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-line-2 bg-bg-1 text-center text-[14px] text-ink-2">
      <div>Cap pis coincideix amb el filtre.</div>
      <Link
        href={'/listings' as Route}
        className="font-mono text-[12px] uppercase tracking-[0.14em] text-cyan hover:text-cyan-hot"
      >
        Esborrar filtres →
      </Link>
    </div>
  );
}

/** Listing row enriched with thesis + delta computed at SSR. */
type EnrichedRow = Listing & {
  _cashflow_during?: number | null;
  _delta_pct?: number | null;
  _eur_m2?: number | null;
};

/** The dense table — kept for power-users (view=table). */
function PowerTable({
  listings,
  trackedIds,
  loggedIn,
  returnTo,
  sortHref,
  sortIndicator,
}: {
  listings: EnrichedRow[];
  trackedIds: Set<string>;
  loggedIn: boolean;
  returnTo: string;
  sortHref: (col: string) => Route;
  sortIndicator: (col: string) => string;
}) {
  return (
    <section
      aria-label="Resultats (taula)"
      className="overflow-x-auto rounded-sm border border-line-1 bg-bg-1"
    >
      <table className="w-full border-collapse text-left text-[12px] tabular-nums">
        <thead className="sticky top-0 z-10 bg-bg-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
          <tr className="border-b border-line-2">
            <th className="px-3 py-2 font-medium" aria-label="Seguint" />
            <th className="px-3 py-2 font-medium">Adreça</th>
            <th className="px-3 py-2 font-medium">Ciutat</th>
            <th className="px-3 py-2 text-right font-medium">
              <Link href={sortHref('price_eur')} className="hover:text-cyan">
                € Preu{sortIndicator('price_eur')}
              </Link>
            </th>
            <th className="px-3 py-2 text-right font-medium">
              <Link href={sortHref('m2')} className="hover:text-cyan">
                m²{sortIndicator('m2')}
              </Link>
            </th>
            <th className="px-3 py-2 text-right font-medium">€/m²</th>
            <th className="px-3 py-2 text-right font-medium">Hab</th>
            <th className="px-3 py-2 text-right font-medium">
              <Link
                href={sortHref('gross_yield_pct_p50')}
                className="hover:text-cyan"
              >
                Yield P50{sortIndicator('gross_yield_pct_p50')}
              </Link>
            </th>
            <th className="px-3 py-2 text-right font-medium">
              <Link href={sortHref('cashflow')} className="hover:text-cyan">
                Cashflow{sortIndicator('cashflow')}
              </Link>
            </th>
            <th className="px-3 py-2 text-right font-medium">Δ mediana</th>
            <th className="px-3 py-2 font-medium">Zona</th>
            <th className="px-3 py-2 font-medium">Condició</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => {
            const perM2 =
              l.m2 && l.m2 > 0 ? Math.round(l.price_eur / l.m2) : null;
            const tracked = trackedIds.has(l.id);
            return (
              <tr
                key={l.id}
                className="group border-b border-line-1 last:border-b-0 hover:bg-bg-2"
              >
                <td className="px-3 py-2 align-middle">
                  <TrackInline
                    listingId={l.id}
                    tracked={tracked}
                    loggedIn={loggedIn}
                    returnTo={returnTo}
                  />
                </td>
                <td className="px-3 py-2 align-middle text-ink-0">
                  <Link
                    href={`/listing/${l.id}` as Route}
                    className="block max-w-[280px] truncate hover:text-cyan"
                    title={l.address ?? l.title ?? l.id}
                  >
                    {l.address ?? l.title ?? l.id}
                  </Link>
                </td>
                <td className="px-3 py-2 align-middle font-mono text-ink-1">
                  {l.city_slug}
                </td>
                <td className="px-3 py-2 text-right align-middle font-mono text-ink-0">
                  {formatEur(l.price_eur)}
                </td>
                <td className="px-3 py-2 text-right align-middle font-mono text-ink-1">
                  {l.m2 != null ? formatNumber(Math.round(l.m2)) : DASH}
                </td>
                <td className="px-3 py-2 text-right align-middle font-mono text-ink-1">
                  {perM2 != null ? formatNumber(perM2) : DASH}
                </td>
                <td className="px-3 py-2 text-right align-middle font-mono text-ink-1">
                  {l.beds != null ? l.beds : DASH}
                </td>
                <td className="px-3 py-2 text-right align-middle font-mono text-cyan">
                  {formatPct(l.gross_yield_pct_p50)}
                </td>
                <td className="px-3 py-2 text-right align-middle font-mono">
                  {l._cashflow_during == null ? (
                    <span className="text-ink-3">{DASH}</span>
                  ) : l._cashflow_during > 0 ? (
                    <span className="text-green">
                      +{formatNumber(Math.round(l._cashflow_during))}
                    </span>
                  ) : (
                    <span className="text-amber">
                      −{formatNumber(Math.round(Math.abs(l._cashflow_during)))}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right align-middle font-mono">
                  {l._delta_pct == null ? (
                    <span className="text-ink-3">{DASH}</span>
                  ) : l._delta_pct < -7 ? (
                    <span className="text-green">{l._delta_pct}%</span>
                  ) : l._delta_pct > 7 ? (
                    <span className="text-amber">+{l._delta_pct}%</span>
                  ) : (
                    <span className="text-ink-2">
                      {l._delta_pct >= 0 ? '+' : ''}{l._delta_pct}%
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 align-middle">
                  {l.in_zona_tensionada ? (
                    <Badge variant="ghost-amber">tensionada</Badge>
                  ) : l.in_zona_tensionada === false ? (
                    <span className="font-mono text-[11px] text-ink-3">
                      lliure
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] text-ink-3">
                      {DASH}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 align-middle">
                  <Badge variant={CONDITION_VARIANT[l.condition_label] ?? 'info'}>
                    {t(l.condition_label, 'condition_label')}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function TrackInline({
  listingId,
  tracked,
  loggedIn,
  returnTo,
}: {
  listingId: string;
  tracked: boolean;
  loggedIn: boolean;
  returnTo: string;
}) {
  if (!loggedIn) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(returnTo)}` as Route}
        className="font-mono text-[12px] text-ink-3 hover:text-cyan"
        title="Entra per seguir aquest anunci"
      >
        ☆
      </Link>
    );
  }
  if (tracked) {
    return (
      <form action={untrackListing}>
        <input type="hidden" name="listing_id" value={listingId} />
        <input type="hidden" name="return_to" value={returnTo} />
        <button
          type="submit"
          title="Deixar de seguir"
          className="font-mono text-[12px] text-green hover:text-green-hot"
        >
          ✓
        </button>
      </form>
    );
  }
  return (
    <form action={trackListing}>
      <input type="hidden" name="listing_id" value={listingId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <button
        type="submit"
        title="Seguir aquest anunci"
        className="font-mono text-[12px] text-ink-3 hover:text-cyan"
      >
        ★
      </button>
    </form>
  );
}

