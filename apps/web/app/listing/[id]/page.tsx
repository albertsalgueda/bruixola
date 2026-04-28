import Image from 'next/image';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type {
  Agency,
  City,
  Comarca,
  Listing,
  Neighborhood,
} from '@/lib/supabase/types';
import { TopBar } from '@/components/chrome/top-bar';
import { StatusStrip } from '@/components/chrome/status-strip';
import { Badge } from '@/components/primitives/badge';
import { YieldBar } from '@/components/cop/yield-bar';
import { ListingActions } from '@/components/listing/actions';
import { UnverifiedChecklist } from '@/components/listing/checklist';
import { getActiveListingsCount, getActivityCount24h } from '@/lib/activity';
import {
  formatEur,
  formatM2,
  formatNumber,
  formatPct,
} from '@/lib/format';
import { t } from '@/lib/i18n';

/**
 * `/listing/[id]` — the Atlas B-Dossier.
 *
 * Three-column server-rendered analytical surface. Visual loudness on the
 * UNVERIFIED checklist at the bottom is intentional: it's the
 * "info asymmetry counter" — the agent has more data than the platform, and
 * we want the user to feel that gap before they put a property in their
 * pipeline.
 */

const DASH = '–';

const COMP_M2_TOLERANCE = 20;
const COMP_PRICE_TOLERANCE_EUR = 50_000;

const CHECKLIST_ITEMS = [
  "Trucat a l'agent",
  'Cadastre verificat',
  'Acta comunitària',
  'Visita en persona',
  'HUT verificat',
  'Zona tensionada',
  'Certificat energètic',
  'Cost reforma estimat',
] as const;

const SCENARIOS: Array<{
  key: string;
  label: string;
  delta: string;
  severity: 'green' | 'amber' | 'red';
  detail: string;
}> = [
  {
    key: 'hold',
    label: 'Hold (5 anys)',
    delta: '+€48k',
    severity: 'green',
    detail: 'Yield acumulat sense reforma',
  },
  {
    key: 'sell',
    label: 'Sell (12 mesos)',
    delta: '+€21k',
    severity: 'amber',
    detail: 'Marge net després de costos transacció',
  },
  {
    key: 'refi',
    label: 'Refi LTV 70%',
    delta: '+€12k',
    severity: 'amber',
    detail: 'Capital alliberat aprox. (Euribor +0.9)',
  },
  {
    key: 'convert',
    label: 'Convert HUT',
    delta: '−€8k',
    severity: 'red',
    detail: 'Risc moratòria HUT activa a la zona',
  },
];

const MODEL_CONTRIBS: Array<{ label: string; weight: number }> = [
  { label: 'DCF', weight: 38 },
  { label: 'Comp set', weight: 32 },
  { label: 'Cap rate', weight: 22 },
  { label: 'Replacement', weight: 8 },
];

function severityClass(s: 'green' | 'amber' | 'red'): string {
  if (s === 'green') return 'bg-green';
  if (s === 'amber') return 'bg-amber';
  return 'bg-red';
}

function severityText(s: 'green' | 'amber' | 'red'): string {
  if (s === 'green') return 'text-green';
  if (s === 'amber') return 'text-amber';
  return 'text-red';
}

function approxRange(price: number): { low: string; high: string } {
  // Wave 4 placeholder: clamp to ±30% of asking price. The previous
  // capitalisation-of-rent proxy was structurally wrong (it multiplied a
  // ratio by price by months by years, producing valuations 10-20× too
  // high). Real DCF + comp-set + cap-rate model lands in Wave 6 and will
  // replace this; the explicit "v1 placeholder" label below is the
  // honesty signal until then.
  return {
    low: formatEur(price * 0.7),
    high: formatEur(price * 1.3),
  };
}

function buildDescription(
  l: Listing,
  city: City | null,
  neighborhood: Neighborhood | null,
): string {
  const parts: string[] = [];
  const where = neighborhood?.name ?? city?.name ?? l.city_slug;
  parts.push(
    `Pis residencial a ${l.address ?? where}, ${city?.name ?? l.city_slug}.`,
  );
  if (l.m2 != null) {
    const beds = l.beds ?? '—';
    const baths = l.baths ?? '—';
    parts.push(
      `${formatNumber(Math.round(l.m2))} m² distribuïts en ${beds} habitacions i ${baths} banys.`,
    );
  }
  parts.push(`${t(l.condition_label, 'condition_label')}.`);
  const tail: string[] = [];
  if (l.energy_cert) tail.push(`ETE classe ${l.energy_cert}`);
  if (l.lift) tail.push('Amb ascensor');
  if (l.year_renovated) tail.push(`Reformat ${l.year_renovated}`);
  if (tail.length > 0) parts.push(tail.join(' · ') + '.');
  return parts.join(' ');
}

export default async function ListingDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: listingData } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .is('removed_at', null)
    .maybeSingle();

  const listing = listingData as Listing | null;
  if (!listing) notFound();

  const m2Min = listing.m2 != null ? listing.m2 - COMP_M2_TOLERANCE : null;
  const m2Max = listing.m2 != null ? listing.m2 + COMP_M2_TOLERANCE : null;
  const priceMin = listing.price_eur - COMP_PRICE_TOLERANCE_EUR;
  const priceMax = listing.price_eur + COMP_PRICE_TOLERANCE_EUR;

  const cityPromise = supabase
    .from('cities')
    .select('*')
    .eq('slug', listing.city_slug)
    .maybeSingle();

  const neighborhoodPromise = listing.neighborhood_id
    ? supabase
        .from('neighborhoods')
        .select('*')
        .eq('id', listing.neighborhood_id)
        .maybeSingle()
    : Promise.resolve({ data: null });

  const agenciesPromise = supabase
    .from('agencies')
    .select('*')
    .eq('city_slug', listing.city_slug)
    .order('verified_at', { ascending: false })
    .limit(5);

  let compsQuery = supabase
    .from('listings')
    .select('*')
    .is('removed_at', null)
    .eq('city_slug', listing.city_slug)
    .neq('id', listing.id)
    .gte('price_eur', priceMin)
    .lte('price_eur', priceMax)
    .limit(6);
  if (m2Min != null && m2Max != null) {
    compsQuery = compsQuery.gte('m2', m2Min).lte('m2', m2Max);
  }

  const [
    cityRes,
    neighborhoodRes,
    agenciesRes,
    compsRes,
    activityCount,
    activeListingsCount,
  ] = await Promise.all([
    cityPromise,
    neighborhoodPromise,
    agenciesPromise,
    compsQuery,
    getActivityCount24h(),
    getActiveListingsCount(),
  ]);

  const city = (cityRes.data ?? null) as City | null;
  const neighborhood =
    (neighborhoodRes.data ?? null) as Neighborhood | null;
  const agencies = (agenciesRes.data ?? []) as Agency[];
  const comps = (compsRes.data ?? []) as Listing[];

  const comarca: Comarca | null = city
    ? (
        (
          await supabase
            .from('comarques')
            .select('*')
            .eq('slug', city.comarca_slug)
            .maybeSingle()
        ).data ?? null
      ) as Comarca | null
    : null;

  const valuation = approxRange(listing.price_eur);

  const description = buildDescription(listing, city, neighborhood);
  const photos = listing.photos.length > 0 ? listing.photos : [];

  return (
    <div className="min-h-screen bg-bg-0 text-ink-1">
      <StatusStrip count={activeListingsCount} />
      <TopBar activityCount={activityCount} />

      {/* Property header bar */}
      <header className="border-b border-line-1 bg-bg-1">
        <div className="mx-auto max-w-[1600px] px-6 py-5">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
                <span>APN · {listing.id.slice(0, 8).toUpperCase()}</span>
                <span aria-hidden>·</span>
                <span>cadastre N/D</span>
                {comarca && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{comarca.name}</span>
                  </>
                )}
              </div>
              <h1 className="mt-1 font-display text-[38px] font-medium leading-tight tracking-tight text-ink-0">
                {listing.address ?? listing.title ?? 'Sense adreça'}
              </h1>
              <div className="mt-1 font-display text-[16px] text-ink-2">
                {listing.m2 != null ? `${formatM2(listing.m2)} · ` : ''}
                {neighborhood?.name ?? city?.name ?? listing.city_slug}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                <span>
                  Condició ·{' '}
                  <span className="text-ink-1">
                    {t(listing.condition_label, 'condition_label')}
                  </span>
                </span>
                <span>
                  ETE ·{' '}
                  <span className="text-ink-1">
                    {listing.energy_cert ?? DASH}
                  </span>
                </span>
                <span>
                  Any ·{' '}
                  <span className="text-ink-1">
                    {listing.year_built ?? DASH}
                  </span>
                </span>
                <span>
                  Owner · <span className="text-ink-1">N/A</span>
                </span>
                <span>
                  Last price ·{' '}
                  <span className="text-ink-1">
                    {formatEur(listing.price_eur)}
                  </span>
                </span>
                {listing.in_zona_tensionada && (
                  <Badge variant="ghost-amber">zona tensionada</Badge>
                )}
                {listing.okupa_risk !== 'unknown' &&
                  listing.okupa_risk !== 'low' && (
                    <Badge variant="ghost-red">
                      {t(listing.okupa_risk, 'okupa_risk')}
                    </Badge>
                  )}
              </div>
            </div>

            <ListingActions
              listingId={listing.id}
              pdfTitle={listing.address ?? listing.title ?? listing.id}
            />
          </div>
        </div>
      </header>

      {/* Three-column body */}
      <main className="mx-auto max-w-[1600px] px-6 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr_360px]">
          {/* LEFT — valuation + scenarios */}
          <aside className="flex flex-col gap-5">
            <section className="rounded-sm border border-line-1 bg-bg-1 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                Brúixola valuation v1
              </div>
              <div className="mt-2 font-display text-[26px] font-medium leading-tight tracking-tight text-ink-0">
                {valuation.low}
                <span className="mx-2 text-ink-3">–</span>
                {valuation.high}
              </div>
              <div className="mt-1 font-mono text-[11px] text-ink-3">
                Rang estimat · v1 placeholder · model en desenvolupament
              </div>

              {/* Histogram placeholder */}
              <svg
                viewBox="0 0 220 60"
                className="mt-4 w-full text-cyan-dim"
                aria-hidden
              >
                {[
                  10, 18, 28, 36, 44, 50, 46, 38, 32, 24, 16, 10, 6, 4,
                ].map((h, i) => (
                  <rect
                    key={i}
                    x={i * 16 + 2}
                    y={60 - h}
                    width={12}
                    height={h}
                    className={
                      i >= 4 && i <= 9 ? 'fill-cyan' : 'fill-current opacity-60'
                    }
                  />
                ))}
                <line
                  x1={92}
                  x2={92}
                  y1={4}
                  y2={60}
                  className="stroke-amber"
                  strokeDasharray="2 2"
                />
              </svg>

              <div className="mt-4 border-t border-line-1 pt-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                  Model contributions
                </div>
                <div className="mt-2 flex flex-col gap-2">
                  {MODEL_CONTRIBS.map((m) => (
                    <div key={m.label} className="flex items-center gap-3">
                      <div className="w-24 font-mono text-[11px] text-ink-2">
                        {m.label}
                      </div>
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-bg-3">
                        <div
                          className="absolute inset-y-0 left-0 bg-cyan"
                          style={{ width: `${m.weight}%` }}
                        />
                      </div>
                      <div className="w-8 text-right font-mono text-[11px] tabular-nums text-ink-1">
                        {m.weight}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-sm border border-line-1 bg-bg-1 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                Scenarios
              </div>
              <div className="mt-2 flex flex-col divide-y divide-line-1">
                {SCENARIOS.map((s) => (
                  <div
                    key={s.key}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${severityClass(s.severity)}`}
                        aria-hidden
                      />
                      <div>
                        <div className="text-[12px] text-ink-0">{s.label}</div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                          {s.detail}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`font-mono text-[13px] tabular-nums ${severityText(s.severity)}`}
                    >
                      {s.delta}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          {/* CENTER — gallery + description + checklist */}
          <section className="flex min-w-0 flex-col gap-5">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {photos.length > 0 ? (
                photos.slice(0, 6).map((src, i) => (
                  <div
                    key={`${src}-${i}`}
                    className={`relative overflow-hidden rounded-sm border border-line-1 bg-bg-2 ${
                      i === 0 ? 'md:col-span-3 md:row-span-2 aspect-[16/9]' : 'aspect-[4/3]'
                    }`}
                  >
                    <Image
                      src={src}
                      alt={`Foto ${i + 1} de ${listing.address ?? listing.id}`}
                      fill
                      sizes={i === 0 ? '(min-width: 1024px) 720px, 100vw' : '240px'}
                      className="object-cover"
                      priority={i === 0}
                    />
                  </div>
                ))
              ) : (
                <div className="md:col-span-3 flex aspect-[16/9] items-center justify-center rounded-sm border border-dashed border-line-2 bg-bg-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
                  Sense fotografies
                </div>
              )}
            </div>

            <section className="rounded-sm border border-line-1 bg-bg-1 p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                Descripció
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-1">
                {description}
              </p>
            </section>

            {/* UNVERIFIED checklist — info-asymmetry counter */}
            <section className="rounded-sm border border-amber-dim bg-bg-1 p-5">
              <UnverifiedChecklist
                listingId={listing.id}
                items={CHECKLIST_ITEMS}
              />
            </section>
          </section>

          {/* RIGHT — yield, comps, agencies */}
          <aside className="flex flex-col gap-5">
            <section className="rounded-sm border border-line-1 bg-bg-1 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                Yield brut · gateig legal
              </div>
              <div className="mt-3">
                <YieldBar
                  p25={listing.gross_yield_pct_p25}
                  p50={listing.gross_yield_pct_p50}
                  p75={listing.gross_yield_pct_p75}
                  legalMax={listing.gross_yield_pct_legal_max}
                  inZonaTensionada={listing.in_zona_tensionada}
                />
              </div>
              {listing.in_zona_tensionada && (
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-amber">
                  Lloguer limitat per índex de referència
                </p>
              )}
            </section>

            <section className="rounded-sm border border-line-1 bg-bg-1">
              <header className="flex items-center justify-between border-b border-line-1 px-4 py-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                  Comparable rentals
                </div>
                <div className="font-mono text-[10px] tabular-nums text-ink-3">
                  {comps.length} comps
                </div>
              </header>
              {comps.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12px] text-ink-3">
                  Sense comparables al rang
                </div>
              ) : (
                <ul className="divide-y divide-line-1">
                  {comps.map((c) => {
                    const perM2 =
                      c.m2 && c.m2 > 0
                        ? Math.round(c.price_eur / c.m2)
                        : null;
                    return (
                      <li key={c.id} className="px-4 py-3">
                        <a
                          href={`/listing/${c.id}`}
                          className="block focus:outline-none"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12px] text-ink-0">
                                {c.address ?? c.title ?? c.id}
                              </div>
                              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                                {c.m2 != null ? formatM2(c.m2) : DASH}
                                {perM2 != null && (
                                  <>
                                    <span className="mx-1.5">·</span>
                                    {formatNumber(perM2)} €/m²
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono text-[12px] tabular-nums text-ink-0">
                                {formatEur(c.price_eur)}
                              </div>
                              <div className="font-mono text-[10px] tabular-nums text-cyan">
                                {formatPct(c.gross_yield_pct_p50)}
                              </div>
                            </div>
                          </div>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="rounded-sm border border-line-1 bg-bg-1">
              <header className="flex items-center justify-between border-b border-line-1 px-4 py-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                  3 Agències més properes
                </div>
                <div className="font-mono text-[10px] tabular-nums text-ink-3">
                  {agencies.length}
                </div>
              </header>
              {agencies.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12px] text-ink-3">
                  Cap agència verificada per a {city?.name ?? listing.city_slug}
                </div>
              ) : (
                <ul className="divide-y divide-line-1">
                  {agencies.slice(0, 3).map((a) => (
                    <li key={a.id} className="px-4 py-3">
                      <div className="text-[12px] font-medium text-ink-0">
                        {a.name}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-ink-2">
                        {a.phone && (
                          <a
                            href={`tel:${a.phone}`}
                            className="hover:text-cyan"
                          >
                            ☎ {a.phone}
                          </a>
                        )}
                        {a.web && (
                          <a
                            href={a.web}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-cyan"
                          >
                            ↗ web
                          </a>
                        )}
                        {a.is_gestoria && (
                          <span className="text-amber">gestoria</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
