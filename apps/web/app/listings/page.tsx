import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Listing, ConditionLabel } from '@/lib/supabase/types';
import { TopBar } from '@/components/chrome/top-bar';
import { StatusStrip } from '@/components/chrome/status-strip';
import { Badge } from '@/components/primitives/badge';
import { formatEur, formatNumber, formatPct } from '@/lib/format';
import { t } from '@/lib/i18n';

/**
 * `/listings` — dense table of every live listing.
 *
 * Server component. Filters are applied at the Supabase query layer (cheaper
 * + lets us sort by `first_seen_at` without pulling everything into Node).
 * The "filter form" itself lands in Wave 5; for now we read URL params and
 * surface the active set as chips above the table so the URL is debuggable.
 */

const DASH = '–';

type SearchParams = {
  city?: string;
  max_price_eur?: string;
  min_yield_p50?: string;
  condition?: string;
  in_zona_tensionada?: string;
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

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const cityFilter = params.city?.trim() || null;
  const maxPrice = parseNumber(params.max_price_eur);
  const minYield = parseNumber(params.min_yield_p50);
  const conditionFilter = params.condition?.trim() || null;
  const zonaTensFilter = parseBool(params.in_zona_tensionada);

  let query = supabase
    .from('listings')
    .select('*')
    .is('removed_at', null)
    .order('first_seen_at', { ascending: false })
    .limit(200);

  if (cityFilter) query = query.eq('city_slug', cityFilter);
  if (maxPrice != null) query = query.lte('price_eur', maxPrice);
  if (minYield != null) query = query.gte('gross_yield_pct_p50', minYield);
  if (conditionFilter) query = query.eq('condition_label', conditionFilter);
  if (zonaTensFilter != null)
    query = query.eq('in_zona_tensionada', zonaTensFilter);

  const { data } = await query;
  const listings = (data ?? []) as Listing[];

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

  return (
    <div className="min-h-screen bg-bg-0 text-ink-1">
      <StatusStrip count={listings.length} />
      <TopBar />

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
              {formatNumber(listings.length)} pisos vius · ordenats per data
              d&apos;aparició
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-sm border border-line-2 bg-bg-1 px-3 text-[12px] text-ink-3">
              <span aria-hidden>⌕</span>
              <input
                type="search"
                placeholder="Cerca pisos..."
                disabled
                className="w-56 bg-transparent text-ink-2 placeholder:text-ink-3 focus:outline-none disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </header>

        {/* Active-filter chip row */}
        <div className="mb-4 flex min-h-[28px] flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            Filtres
          </span>
          {activeFilters.length === 0 ? (
            <span className="text-[12px] text-ink-3">cap</span>
          ) : (
            activeFilters.map((f) => (
              <Badge key={f.key} variant="ghost-cyan">
                {f.label}
              </Badge>
            ))
          )}
        </div>

        {listings.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-sm border border-dashed border-line-2 bg-bg-1 text-[14px] text-ink-2">
            Cap pis coincideix amb el filtre
          </div>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-line-1 bg-bg-1">
            <table className="w-full border-collapse text-left text-[12px] tabular-nums">
              <thead className="sticky top-0 z-10 bg-bg-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                <tr className="border-b border-line-2">
                  <th className="px-3 py-2 font-medium">Plat</th>
                  <th className="px-3 py-2 font-medium">Llistat</th>
                  <th className="px-3 py-2 font-medium">Ciutat</th>
                  <th className="px-3 py-2 text-right font-medium">€ Preu</th>
                  <th className="px-3 py-2 text-right font-medium">m²</th>
                  <th className="px-3 py-2 text-right font-medium">€/m²</th>
                  <th className="px-3 py-2 text-right font-medium">Hab</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Yield P50
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Ceiling</th>
                  <th className="px-3 py-2 font-medium">Zona</th>
                  <th className="px-3 py-2 font-medium">Condició</th>
                  <th className="px-3 py-2 font-medium">URL</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => {
                  const perM2 =
                    l.m2 && l.m2 > 0 ? Math.round(l.price_eur / l.m2) : null;
                  return (
                    <tr
                      key={l.id}
                      className="group border-b border-line-1 last:border-b-0 hover:bg-bg-2"
                    >
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
          </div>
        )}
      </main>
    </div>
  );
}
