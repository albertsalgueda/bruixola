import Link from 'next/link';
import type { Route } from 'next';
import { createClient } from '@/lib/supabase/server';
import type { Listing, ConditionLabel, Strategy } from '@/lib/supabase/types';
import { TopBar } from '@/components/chrome/top-bar';
import { Badge } from '@/components/primitives/badge';
import {
  ListingsMap,
  type ListingMapMarker,
} from '@/components/listings/listings-map';
import { rowToCity, type CityForMap } from '@/lib/market';
import { getMyTenantId } from '@/lib/auth/tenant';
import { trackListing, untrackListing } from './actions';
import { formatEur, formatNumber, formatPct } from '@/lib/format';
import { t } from '@/lib/i18n';
import { getActiveListingsCount, getActivityCount24h } from '@/lib/activity';

/**
 * `/listings` — dense table of every live listing.
 *
 * Server component. Filters are applied at the Supabase query layer.
 * Active filters render as click-to-remove chips. Search is a real <form>
 * with name="q" that ILIKE-matches against `address` and `title`.
 * Sortable columns: clicking a header cycles asc/desc via URL params.
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

/**
 * Build a query-string with one or more keys removed. Used to render the
 * "× remove this filter" links on each chip.
 */
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
  const sort = params.sort && SORTABLE[params.sort] ? params.sort : 'first_seen_at';
  const dir = params.dir === 'asc' ? 'asc' : 'desc';

  // Resolve the strategy (if any) to a filter we can apply on top of the others.
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

  // Apply the strategy filter shape on top.
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

  const view: 'table' | 'map' = params.view === 'map' ? 'map' : 'table';
  const tenantId = await getMyTenantId();

  const [{ data }, activityCount, activeListingsCount, citiesRes, trackedRes] =
    await Promise.all([
      query,
      getActivityCount24h(),
      getActiveListingsCount(),
      // City centroids (used by the map view to position dots).
      view === 'map'
        ? supabase.rpc('cities_for_map')
        : Promise.resolve({ data: null as null }),
      // Which listings does the current user already track?
      tenantId
        ? supabase
            .from('properties')
            .select('source_listing_id')
            .eq('tenant_id', tenantId)
            .is('archived_at', null)
            .not('source_listing_id', 'is', null)
        : Promise.resolve({ data: null as null }),
    ]);
  const listings = (data ?? []) as Listing[];

  const trackedRows =
    (trackedRes as { data: unknown }).data as
      | Array<{ source_listing_id: string }>
      | null;
  const trackedIds = new Set(
    (trackedRows ?? []).map((r) => r.source_listing_id),
  );

  // Map markers — only computed when the view is map (otherwise we don't have
  // city-centroid data fetched).
  const mapBundle =
    view === 'map'
      ? buildMapMarkers(
          listings,
          (((citiesRes as { data: unknown }).data ?? []) as Array<
            Record<string, unknown>
          >),
          trackedIds,
        )
      : { markers: [], unresolvedCount: 0 };

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
    activeFilters.push({
      key: 'strategy',
      label: `tesi: ${strategy.title}`,
    });

  // The combined filter description for the empty state message.
  const filterSummary =
    q != null
      ? `'${q}'`
      : activeFilters.length > 0
        ? activeFilters.map((f) => f.label).join(' · ')
        : null;

  // Pre-compute the URL params that are *not* `sort`/`dir` so column-header
  // links can preserve the rest while toggling sort.
  const passthroughParams: Record<string, string | undefined> = {
    q: q ?? undefined,
    city: cityFilter ?? undefined,
    max_price_eur:
      maxPrice != null ? String(maxPrice) : undefined,
    min_yield_p50: minYield != null ? String(minYield) : undefined,
    condition: conditionFilter ?? undefined,
    in_zona_tensionada:
      zonaTensFilter == null ? undefined : zonaTensFilter ? 'true' : 'false',
    strategy: strategySlug ?? undefined,
  };

  function sortHref(col: string): Route {
    const nextDir =
      sort === col ? (dir === 'asc' ? 'desc' : 'asc') : 'desc';
    return urlWith(passthroughParams, { sort: col, dir: nextDir });
  }
  function sortIndicator(col: string): string {
    if (sort !== col) return '';
    return dir === 'asc' ? ' ↑' : ' ↓';
  }

  return (
    <div className="min-h-screen bg-bg-0 text-ink-1">
      <TopBar activityCount={activityCount} initialQuery={q ?? ''} />

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        <header className="mb-5 flex items-end justify-between gap-4 border-b border-line-1 pb-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
              Brúixola · Llistats
            </div>
            <h1 className="mt-1 font-display text-[28px] font-medium tracking-tight text-ink-0">
              Llistats
            </h1>
            <p className="mt-1 text-[13px] text-ink-2">
              {formatNumber(listings.length)} pisos vius · ordenats per{' '}
              <span className="font-mono">{sort}</span> ({dir})
            </p>
          </div>

          <div className="flex items-center gap-3">
            <ViewToggle currentView={view} params={passthroughParams} />
            <form
              action="/listings"
              method="get"
              className="flex h-8 items-center gap-2 rounded-sm border border-line-2 bg-bg-1 px-3 text-[12px] focus-within:border-cyan-dim"
            >
              <span aria-hidden className="text-ink-3">⌕</span>
              <input
                name="q"
                type="search"
                placeholder="Cerca adreça o títol..."
                defaultValue={q ?? ''}
                className="w-56 bg-transparent text-ink-1 placeholder:text-ink-3 focus:outline-none"
              />
              {/* Preserve other active filters across the search */}
              {cityFilter && <input type="hidden" name="city" value={cityFilter} />}
              {maxPrice != null && (
                <input type="hidden" name="max_price_eur" value={String(maxPrice)} />
              )}
              {minYield != null && (
                <input type="hidden" name="min_yield_p50" value={String(minYield)} />
              )}
              {conditionFilter && (
                <input type="hidden" name="condition" value={conditionFilter} />
              )}
              {strategySlug && (
                <input type="hidden" name="strategy" value={strategySlug} />
              )}
              <button
                type="submit"
                className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan hover:text-cyan-hot"
              >
                Cerca
              </button>
            </form>
          </div>
        </header>

        {/* Active-filter chip row */}
        <section
          aria-labelledby="filters-title"
          className="mb-4 flex min-h-[28px] flex-wrap items-center gap-2"
        >
          <h2
            id="filters-title"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3"
          >
            Filtres
          </h2>
          {q && (
            <Link
              href={urlWithout({ ...passthroughParams }, ['q'])}
              className="inline-flex"
              aria-label={`Esborrar cerca '${q}'`}
            >
              <Badge variant="ghost-cyan">
                cerca: {q}{' '}
                <span className="ml-1 text-ink-2 hover:text-ink-0">×</span>
              </Badge>
            </Link>
          )}
          {activeFilters.length === 0 && !q ? (
            <span className="text-[12px] text-ink-3">cap</span>
          ) : (
            activeFilters.map((f) => (
              <Link
                key={f.key}
                href={urlWithout({ ...passthroughParams }, [f.key])}
                className="inline-flex"
                aria-label={`Esborrar filtre ${f.label}`}
              >
                <Badge variant="ghost-cyan">
                  {f.label}{' '}
                  <span className="ml-1 text-ink-2 hover:text-ink-0">×</span>
                </Badge>
              </Link>
            ))
          )}
          {(activeFilters.length + (q ? 1 : 0)) >= 2 && (
            <Link
              href="/listings"
              className="ml-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3 hover:text-cyan"
            >
              Esborrar filtres
            </Link>
          )}
        </section>

        {view === 'map' ? (
          listings.length === 0 ? (
            <EmptyResults filterSummary={filterSummary} />
          ) : (
            <ListingsMap
              markers={mapBundle.markers}
              unresolvedCount={mapBundle.unresolvedCount}
            />
          )
        ) : listings.length === 0 ? (
          <EmptyResults filterSummary={filterSummary} />
        ) : (
          <section
            aria-labelledby="results-title"
            className="overflow-x-auto rounded-sm border border-line-1 bg-bg-1"
          >
            <h2 id="results-title" className="sr-only">
              Resultats
            </h2>
            <table className="w-full border-collapse text-left text-[12px] tabular-nums">
              <thead className="sticky top-0 z-10 bg-bg-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                <tr className="border-b border-line-2">
                  <th className="px-3 py-2 font-medium" aria-label="Seguint" />
                  <th className="px-3 py-2 font-medium">Plat</th>
                  <th className="px-3 py-2 font-medium">Llistat</th>
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
                  <th className="px-3 py-2 text-right font-medium">Sostre</th>
                  <th className="px-3 py-2 font-medium">Zona</th>
                  <th className="px-3 py-2 font-medium">Condició</th>
                  <th className="px-3 py-2 font-medium">URL</th>
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
                        <TrackButton
                          listingId={l.id}
                          tracked={tracked}
                          loggedIn={tenantId != null}
                        />
                      </td>
                      <td className="px-3 py-2 align-middle font-mono text-[11px] uppercase tracking-wider text-ink-2">
                        <Link
                          href={`/listing/${l.id}`}
                          className="block focus:outline-none"
                        >
                          {l.platform}
                        </Link>
                      </td>
                      <td className="px-3 py-2 align-middle text-ink-0">
                        <Link
                          href={`/listing/${l.id}`}
                          className="block max-w-[260px] truncate hover:text-cyan focus:outline-none"
                          title={l.title ?? l.address ?? l.id}
                        >
                          {l.title ?? l.address ?? l.id}
                        </Link>
                      </td>
                      <td className="px-3 py-2 align-middle font-mono text-ink-1">
                        <Link
                          href={`/listing/${l.id}`}
                          className="block focus:outline-none"
                        >
                          {l.city_slug}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right align-middle font-mono text-ink-0">
                        <Link
                          href={`/listing/${l.id}`}
                          className="block focus:outline-none"
                        >
                          {formatEur(l.price_eur)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right align-middle font-mono text-ink-1">
                        <Link
                          href={`/listing/${l.id}`}
                          className="block focus:outline-none"
                        >
                          {l.m2 != null ? formatNumber(Math.round(l.m2)) : DASH}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right align-middle font-mono text-ink-1">
                        <Link
                          href={`/listing/${l.id}`}
                          className="block focus:outline-none"
                        >
                          {perM2 != null ? formatNumber(perM2) : DASH}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right align-middle font-mono text-ink-1">
                        <Link
                          href={`/listing/${l.id}`}
                          className="block focus:outline-none"
                        >
                          {l.beds != null ? l.beds : DASH}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right align-middle font-mono text-cyan">
                        <Link
                          href={`/listing/${l.id}`}
                          className="block focus:outline-none"
                        >
                          {formatPct(l.gross_yield_pct_p50)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right align-middle font-mono text-ink-2">
                        <Link
                          href={`/listing/${l.id}`}
                          className="block focus:outline-none"
                        >
                          {formatPct(l.gross_yield_pct_legal_max)}
                        </Link>
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
                        <Badge
                          variant={
                            CONDITION_VARIANT[l.condition_label] ?? 'info'
                          }
                        >
                          {t(l.condition_label, 'condition_label')}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[11px] text-cyan hover:text-cyan-hot"
                        >
                          obrir ↗
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </div>
  );
}

/**
 * Track / untrack button. POSTs a Server Action.
 * - Logged out → link to /login (single click → magic link → comes back to /listings).
 * - Logged in + not tracked → "★ Seguir" cyan button.
 * - Logged in + tracked → "✓ Seguint" green pill that untracks on click.
 */
function TrackButton({
  listingId,
  tracked,
  loggedIn,
}: {
  listingId: string;
  tracked: boolean;
  loggedIn: boolean;
}) {
  if (!loggedIn) {
    return (
      <Link
        href={'/login?next=/listings' as Route}
        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3 hover:text-cyan"
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
        <input type="hidden" name="return_to" value="/listings" />
        <button
          type="submit"
          className="inline-flex items-center gap-1 border border-green-dim bg-green-dim/15 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-green hover:border-green hover:text-green-hot"
          title="Deixar de seguir"
        >
          ✓ Seguint
        </button>
      </form>
    );
  }
  return (
    <form action={trackListing}>
      <input type="hidden" name="listing_id" value={listingId} />
      <input type="hidden" name="return_to" value="/listings" />
      <button
        type="submit"
        className="inline-flex items-center gap-1 border border-cyan-dim bg-cyan-dim/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan hover:bg-cyan-dim/25"
        title="Seguir aquest anunci"
      >
        ★ Seguir
      </button>
    </form>
  );
}

/** Compact TAULA · MAPA toggle, preserves all other query params. */
function ViewToggle({
  currentView,
  params,
}: {
  currentView: 'table' | 'map';
  params: Record<string, string | undefined>;
}) {
  const tableHref = urlWith(params, { view: undefined });
  const mapHref = urlWith(params, { view: 'map' });
  return (
    <div
      role="tablist"
      aria-label="Vista d'anuncis"
      className="flex items-stretch border border-line-1 bg-bg-1"
    >
      <Link
        href={tableHref}
        role="tab"
        aria-selected={currentView === 'table'}
        className={
          'px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] ' +
          (currentView === 'table'
            ? 'bg-cyan/15 text-cyan'
            : 'text-ink-3 hover:text-ink-1')
        }
      >
        Taula
      </Link>
      <Link
        href={mapHref}
        role="tab"
        aria-selected={currentView === 'map'}
        className={
          'px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] ' +
          (currentView === 'map'
            ? 'bg-cyan/15 text-cyan'
            : 'text-ink-3 hover:text-ink-1')
        }
      >
        Mapa
      </Link>
    </div>
  );
}

/** Empty state shared across table + map views. */
function EmptyResults({ filterSummary }: { filterSummary: string | null }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-line-2 bg-bg-1 text-center text-[14px] text-ink-2">
      <div>
        Cap pis coincideix
        {filterSummary ? ` amb ${filterSummary}` : ' amb el filtre'}.
      </div>
      <Link
        href={'/listings' as Route}
        className="font-mono text-[12px] uppercase tracking-[0.14em] text-cyan hover:text-cyan-hot"
      >
        Esborrar filtres →
      </Link>
    </div>
  );
}

/** Build map markers + count of unresolvable listings (no city centroid). */
function buildMapMarkers(
  listings: Listing[],
  cityRows: Array<Record<string, unknown>>,
  trackedIds: Set<string>,
): { markers: ListingMapMarker[]; unresolvedCount: number } {
  const cities = cityRows.map((r) => rowToCity(r)) as CityForMap[];
  const bySlug = new Map(cities.map((c) => [c.slug, c] as const));
  const markers: ListingMapMarker[] = [];
  let unresolvedCount = 0;
  for (const l of listings) {
    const c = bySlug.get(l.city_slug);
    if (!c) {
      unresolvedCount++;
      continue;
    }
    markers.push({
      id: l.id,
      lng: c.lng,
      lat: c.lat,
      in_zona_tensionada: l.in_zona_tensionada,
      tracked: trackedIds.has(l.id),
    });
  }
  return { markers, unresolvedCount };
}
