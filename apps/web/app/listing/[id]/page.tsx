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
 * `/listing/[id]` — el Dossier B d'Atlas.
 *
 * Tres columnes server-rendered. La crida d'atenció a la checklist
 * NO VERIFICAT a baix és intencionada: és el "comptador d'asimetria
 * d'informació" — l'agent en sap més que la plataforma, i volem que
 * l'usuari senti aquell buit abans d'afegir un pis al pipeline.
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

type Severity = 'green' | 'amber' | 'red' | 'cyan';

type RiskRow = {
  key: string;
  label: string;
  value: string;
  detail: string;
  severity: Severity;
};

const CONDITION_SEVERITY: Record<
  Listing['condition_label'],
  { severity: Severity; value: string; detail: string }
> = {
  reformado: {
    severity: 'green',
    value: 'Reformat · sense intervenció prevista',
    detail: 'Cap inversió addicional necessària a curt termini.',
  },
  good: {
    severity: 'cyan',
    value: 'Bon estat · ús immediat',
    detail: 'Llogable o habitable sense reforma estructural.',
  },
  reform_needed: {
    severity: 'amber',
    value: 'Cal reformar · estimar cost',
    detail: 'Demanar pressupost a constructor abans d’ofertar.',
  },
  wreck: {
    severity: 'red',
    value: 'Per enderrocar · obra major',
    detail: 'Cost de reforma probablement supera la diferència de preu.',
  },
  unknown: {
    severity: 'amber',
    value: 'Estat sense verificar',
    detail: 'Visitar en persona per confirmar condició.',
  },
};

function severityClass(s: Severity): string {
  if (s === 'green') return 'bg-green';
  if (s === 'amber') return 'bg-amber';
  if (s === 'cyan') return 'bg-cyan';
  return 'bg-red';
}

function severityText(s: Severity): string {
  if (s === 'green') return 'text-green';
  if (s === 'amber') return 'text-amber';
  if (s === 'cyan') return 'text-cyan';
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

function buildRiskRows(listing: Listing): RiskRow[] {
  const rows: RiskRow[] = [];

  // 1) Risc okupacional — based on okupa_risk
  if (listing.okupa_risk === 'high') {
    rows.push({
      key: 'okupa',
      label: 'Risc okupacional',
      value: 'Alt · pendent possessió detectada',
      detail:
        'Senyals al text indiquen possible ocupació il·legal o procés de desnonament obert.',
      severity: 'red',
    });
  } else if (listing.okupa_risk === 'medium') {
    rows.push({
      key: 'okupa',
      label: 'Risc okupacional',
      value: 'Mitjà · revisar text',
      detail:
        'L’anunci conté formulacions ambigües sobre disponibilitat. Trucar a l’agent.',
      severity: 'amber',
    });
  } else if (listing.okupa_risk === 'low') {
    rows.push({
      key: 'okupa',
      label: 'Risc okupacional',
      value: 'Baix · cap senyal',
      detail: 'No s’han detectat indicadors d’ocupació al text de l’anunci.',
      severity: 'green',
    });
  } else {
    rows.push({
      key: 'okupa',
      label: 'Risc okupacional',
      value: 'Sense dades',
      detail: 'L’anunci no permet inferir el risc d’ocupació amb confiança.',
      severity: 'amber',
    });
  }

  // 2) Sostre legal aplicable — based on zona tensionada + P75 vs legal_max
  const inZona = listing.in_zona_tensionada === true;
  const p75 = listing.gross_yield_pct_p75;
  const legalMax = listing.gross_yield_pct_legal_max;
  if (inZona && p75 != null && legalMax != null && p75 > legalMax) {
    const ceilEur = listing.rent_index_ceiling_eur_m2_mo;
    rows.push({
      key: 'cap',
      label: 'Sostre legal aplicable',
      value: 'P75 supera el sostre',
      detail:
        ceilEur != null
          ? `Índex SERPAVI fixa el lloguer màxim a ${ceilEur.toFixed(2)} €/m²/mes.`
          : 'L’índex de referència limita el lloguer màxim aplicable.',
      severity: 'red',
    });
  } else if (inZona && p75 != null && legalMax != null && p75 <= legalMax) {
    rows.push({
      key: 'cap',
      label: 'Sostre legal aplicable',
      value: 'P75 dins del sostre · marge OK',
      detail:
        'El rang de yield estimat queda per sota del sostre SERPAVI vigent.',
      severity: 'green',
    });
  } else if (!inZona) {
    rows.push({
      key: 'cap',
      label: 'Sostre legal aplicable',
      value: 'Fora de zona tensionada · sense sostre',
      detail:
        'Aquesta finca no està en zona declarada tensionada — no aplica sostre SERPAVI.',
      severity: 'cyan',
    });
  } else {
    rows.push({
      key: 'cap',
      label: 'Sostre legal aplicable',
      value: 'Zona tensionada · sostre pendent',
      detail: 'Falten dades per comparar el yield amb el sostre legal.',
      severity: 'amber',
    });
  }

  // 3) Estat de l'edifici
  const cond = CONDITION_SEVERITY[listing.condition_label];
  rows.push({
    key: 'condition',
    label: "Estat de l'edifici",
    value: cond.value,
    detail: cond.detail,
    severity: cond.severity,
  });

  // 4) Llicència HUT
  if (listing.hut_license_id) {
    rows.push({
      key: 'hut',
      label: 'Llicència HUT',
      value: `Concedida · ${listing.hut_license_id}`,
      detail: 'Llicència d’ús turístic activa al registre de la Generalitat.',
      severity: 'green',
    });
  } else {
    rows.push({
      key: 'hut',
      label: 'Llicència HUT',
      value: 'No aplica · ús residencial llarg',
      detail:
        'Sense llicència HUT registrada — el cas base és lloguer de llarga durada.',
      severity: 'cyan',
    });
  }

  return rows;
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
    .limit(8);
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
  const compsRaw = (compsRes.data ?? []) as Listing[];

  // Sort comparables by m² closeness to the subject (so the most relevant
  // ones land at the top of the comparison panel).
  const subjectM2 = listing.m2 ?? null;
  const comps = subjectM2 != null
    ? [...compsRaw].sort((a, b) => {
        const da = a.m2 != null ? Math.abs(a.m2 - subjectM2) : Number.POSITIVE_INFINITY;
        const db = b.m2 != null ? Math.abs(b.m2 - subjectM2) : Number.POSITIVE_INFINITY;
        return da - db;
      })
    : compsRaw;

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
  const riskRows = buildRiskRows(listing);

  const subjectPriceM2 =
    listing.m2 && listing.m2 > 0
      ? Math.round(listing.price_eur / listing.m2)
      : null;

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
                <span aria-label={`Identificador APN ${listing.id.slice(0, 8).toUpperCase()}`}>
                  APN · {listing.id.slice(0, 8).toUpperCase()}
                </span>
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
              <p className="mt-1 font-display text-[16px] text-ink-2">
                {listing.m2 != null ? `${formatM2(listing.m2)} · ` : ''}
                {neighborhood?.name ?? city?.name ?? listing.city_slug}
              </p>

              <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                <div className="flex items-baseline gap-2">
                  <dt>Condició</dt>
                  <dd className="text-ink-1">
                    {t(listing.condition_label, 'condition_label')}
                  </dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt>ETE</dt>
                  <dd className="text-ink-1">{listing.energy_cert ?? DASH}</dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt>Any</dt>
                  <dd className="text-ink-1">{listing.year_built ?? DASH}</dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt>Propietari</dt>
                  <dd className="text-ink-1">No disponible</dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt>Últim preu</dt>
                  <dd className="text-ink-1">{formatEur(listing.price_eur)}</dd>
                </div>
                {listing.in_zona_tensionada && (
                  <Badge variant="ghost-amber">zona tensionada</Badge>
                )}
                {listing.okupa_risk !== 'unknown' &&
                  listing.okupa_risk !== 'low' && (
                    <Badge variant="ghost-red">
                      {t(listing.okupa_risk, 'okupa_risk')}
                    </Badge>
                  )}
              </dl>
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
          {/* LEFT — valuation + market comparison + risk */}
          <aside className="flex flex-col gap-5" aria-label="Valoració i risc">
            <section
              aria-labelledby="valuation-title"
              className="rounded-sm border border-line-1 bg-bg-1 p-4"
            >
              <h2
                id="valuation-title"
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3"
              >
                Valoració Brúixola · v1
              </h2>
              <div className="mt-2 font-display text-[26px] font-medium leading-tight tracking-tight text-ink-0">
                {valuation.low}
                <span className="mx-2 text-ink-3" aria-hidden>–</span>
                {valuation.high}
              </div>
              <p className="mt-1 font-mono text-[11px] text-ink-3">
                Rang estimat · v1 placeholder · model en desenvolupament
              </p>

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

              {/* Market comparison — replaces fake "Model contributions" */}
              <div className="mt-4 border-t border-line-1 pt-3">
                <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                  Comparació de mercat
                </h3>
                {comps.length < 3 ? (
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-amber">
                    Conjunt de comparables insuficient — verifica amb agent
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-col divide-y divide-line-1">
                    {comps.slice(0, 5).map((c) => {
                      const cM2 = c.m2 ?? null;
                      const perM2 =
                        cM2 != null && cM2 > 0
                          ? Math.round(c.price_eur / cM2)
                          : null;
                      const subjectLabel = c.address ?? c.title ?? c.id;
                      return (
                        <li key={c.id} className="py-2">
                          <a
                            href={`/listing/${c.id}`}
                            className="block focus:outline-none"
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-[12px] text-ink-1">
                                {subjectLabel}
                              </span>
                              <span className="font-mono text-[11px] tabular-nums text-cyan">
                                {formatPct(c.gross_yield_pct_p50)}
                              </span>
                            </div>
                            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                              {cM2 != null ? formatM2(cM2) : DASH}
                              {perM2 != null && (
                                <>
                                  <span className="mx-1.5">·</span>
                                  {formatNumber(perM2)} €/m²
                                </>
                              )}
                            </div>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {subjectPriceM2 != null && comps.length >= 3 && (
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                    Subjecte · {formatNumber(subjectPriceM2)} €/m²
                  </p>
                )}
              </div>
            </section>

            <section
              aria-labelledby="risk-title"
              className="rounded-sm border border-line-1 bg-bg-1 p-4"
            >
              <h2
                id="risk-title"
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3"
              >
                Anàlisi de risc
              </h2>
              <ul className="mt-2 flex flex-col divide-y divide-line-1">
                {riskRows.map((r) => (
                  <li
                    key={r.key}
                    className="flex items-start gap-3 py-3"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityClass(r.severity)}`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                        {r.label}
                      </div>
                      <div
                        className={`text-[12px] font-medium ${severityText(r.severity)}`}
                      >
                        {r.value}
                      </div>
                      <p className="mt-1 text-[11px] leading-[1.45] text-ink-2">
                        {r.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </aside>

          {/* CENTER — gallery + description + checklist */}
          <section
            className="flex min-w-0 flex-col gap-5"
            aria-label="Dossier"
          >
            {photos.length === 0 ? (
              <div className="flex aspect-[16/9] items-center justify-center rounded-sm border border-dashed border-line-2 bg-bg-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
                Sense fotografies
              </div>
            ) : photos.length === 1 ? (
              <div className="relative aspect-[16/9] overflow-hidden rounded-sm border border-line-1 bg-bg-2">
                <Image
                  src={photos[0]!}
                  alt={`Foto principal de ${listing.address ?? listing.id}`}
                  fill
                  sizes="(min-width: 1024px) 720px, 100vw"
                  className="object-cover"
                  priority
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="relative aspect-[16/9] overflow-hidden rounded-sm border border-line-1 bg-bg-2">
                  <Image
                    src={photos[0]!}
                    alt={`Foto principal de ${listing.address ?? listing.id}`}
                    fill
                    sizes="(min-width: 1024px) 720px, 100vw"
                    className="object-cover"
                    priority
                  />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {photos.slice(1, 5).map((src, i) => (
                    <div
                      key={`${src}-${i}`}
                      className="relative aspect-[4/3] overflow-hidden rounded-sm border border-line-1 bg-bg-2"
                    >
                      <Image
                        src={src}
                        alt={`Foto ${i + 2} de ${listing.address ?? listing.id}`}
                        fill
                        sizes="180px"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <section
              aria-labelledby="description-title"
              className="rounded-sm border border-line-1 bg-bg-1 p-5"
            >
              <h2
                id="description-title"
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3"
              >
                Descripció
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-1">
                {description}
              </p>
            </section>

            {/* UNVERIFIED checklist — info-asymmetry counter */}
            <section
              aria-labelledby="verification-title"
              className="rounded-sm border border-amber-dim bg-bg-1 p-5"
            >
              <h2 id="verification-title" className="sr-only">
                Verificació pendent
              </h2>
              <UnverifiedChecklist
                listingId={listing.id}
                items={CHECKLIST_ITEMS}
              />
            </section>
          </section>

          {/* RIGHT — yield, comps, agencies */}
          <aside
            className="flex flex-col gap-5"
            aria-label="Yield i agències"
          >
            <section
              aria-labelledby="yield-title"
              className="rounded-sm border border-line-1 bg-bg-1 p-4"
            >
              <h2
                id="yield-title"
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3"
              >
                Yield brut · sostre legal
              </h2>
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

            <section
              aria-labelledby="comps-title"
              className="rounded-sm border border-line-1 bg-bg-1"
            >
              <header className="flex items-center justify-between border-b border-line-1 px-4 py-2">
                <h2
                  id="comps-title"
                  className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3"
                >
                  Comparables propers
                </h2>
                <span className="font-mono text-[10px] tabular-nums text-ink-3">
                  {comps.length} comps
                </span>
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

            <section
              aria-labelledby="agencies-title"
              className="rounded-sm border border-line-1 bg-bg-1"
            >
              <header className="flex items-center justify-between border-b border-line-1 px-4 py-2">
                <h2
                  id="agencies-title"
                  className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3"
                >
                  3 Agències més properes
                </h2>
                <span className="font-mono text-[10px] tabular-nums text-ink-3">
                  {agencies.length}
                </span>
              </header>
              {agencies.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12px] text-ink-3">
                  Cap agència verificada per a {city?.name ?? listing.city_slug}
                </div>
              ) : (
                <ul className="divide-y divide-line-1">
                  {agencies.slice(0, 3).map((a) => (
                    <li key={a.id} className="px-4 py-3">
                      <h3 className="text-[12px] font-medium text-ink-0">
                        {a.name}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-ink-2">
                        {a.phone && (
                          <a
                            href={`tel:${a.phone}`}
                            className="hover:text-cyan"
                            aria-label={`Trucar a ${a.name}`}
                          >
                            <span aria-hidden>☎ </span>
                            {a.phone}
                          </a>
                        )}
                        {a.web && (
                          <a
                            href={a.web}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-cyan"
                            aria-label={`Obrir web de ${a.name}`}
                          >
                            <span aria-hidden>↗ </span>
                            web
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
