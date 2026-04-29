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
import { Badge } from '@/components/primitives/badge';
import { YieldBar } from '@/components/cop/yield-bar';
import { ListingActions } from '@/components/listing/actions';
import { UnverifiedChecklist } from '@/components/listing/checklist';
import { PhotoGallery } from '@/components/listing/photo-gallery';
import { getActiveListingsCount, getActivityCount24h } from '@/lib/activity';
import { getMyTenantId } from '@/lib/auth/tenant';
import {
  trackListing,
  untrackListing,
} from '@/app/listings/actions';
import Link from 'next/link';
import type { Route } from 'next';
import {
  formatEur,
  formatM2,
  formatNumber,
  formatPct,
} from '@/lib/format';
import { t } from '@/lib/i18n';
import { computeThesis } from '@/lib/thesis';
import {
  countUnresolvedChecks,
  rankAgainstSaved,
} from '@/lib/listing-rank';
import { RealityCheck } from '@/components/listing/reality-check';
import { MarketReality } from '@/components/listing/market-reality';
import { DecisionWorkflow } from '@/components/listing/decision-workflow';

/**
 * `/listing/[id]` — el Dossier B d'Atlas.
 *
 * Tres columnes server-rendered. La crida d'atenció a la checklist
 * NO VERIFICAT a baix és intencionada: és el "comptador d'asimetria
 * d'informació" — l'agent en sap més que la plataforma, i volem que
 * l'usuari senti aquell buit abans d'afegir un pis al pipeline.
 */

const DASH = '–';

// Comparables tolerance: scaled to the subject's size/price.
// Minimum floors (50k €, 20 m²) protect tiny apartments from a 0% band;
// percentage spreads (20%) keep the band sensible for €5M villas.
const COMP_M2_TOLERANCE_PCT = 0.2;
const COMP_M2_TOLERANCE_MIN = 20;
const COMP_PRICE_TOLERANCE_PCT = 0.25;
const COMP_PRICE_TOLERANCE_MIN_EUR = 50_000;

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

type Valuation = {
  low: string;
  high: string;
  midEur: number | null;
  deltaPct: number | null;          // negative = listing priced below city median
  deltaLabel: 'below' | 'at' | 'above' | null;
  basis: 'city-median' | 'asking-fallback';
  cityMedianEurM2: number | null;
  subjectPriceM2: number | null;
};

function valuationRange(args: {
  priceEur: number;
  m2: number | null;
  cityMedianEurM2: number | null;
}): Valuation {
  const { priceEur, m2, cityMedianEurM2 } = args;
  const subjectPriceM2 =
    m2 && m2 > 0 ? Math.round(priceEur / m2) : null;

  // Need both: a city benchmark and the listing m².
  if (!cityMedianEurM2 || !m2 || m2 <= 0) {
    // Fallback: ±30% of asking. Honest "no benchmark" range.
    return {
      low: formatEur(priceEur * 0.7),
      high: formatEur(priceEur * 1.3),
      midEur: priceEur,
      deltaPct: null,
      deltaLabel: null,
      basis: 'asking-fallback',
      cityMedianEurM2,
      subjectPriceM2,
    };
  }

  // City-median ±15% (P25–P75 band approximation)
  const midEur = cityMedianEurM2 * m2;
  const lowEur = midEur * 0.85;
  const highEur = midEur * 1.15;
  const deltaPct = subjectPriceM2 != null
    ? Math.round(((subjectPriceM2 - cityMedianEurM2) / cityMedianEurM2) * 100)
    : null;
  const deltaLabel: 'below' | 'at' | 'above' | null =
    deltaPct == null
      ? null
      : deltaPct < -7
        ? 'below'
        : deltaPct > 7
          ? 'above'
          : 'at';
  return {
    low: formatEur(lowEur),
    high: formatEur(highEur),
    midEur,
    deltaPct,
    deltaLabel,
    basis: 'city-median',
    cityMedianEurM2,
    subjectPriceM2,
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

// ── Auto-extracted features from description text (Catalan + Spanish) ───
type ExtractedFeature = {
  key: string;
  label: string;
  tone: 'cyan' | 'amber' | 'green';
};

const FEATURE_REGEX: Array<{ rx: RegExp; key: string; label: string; tone: ExtractedFeature['tone'] }> = [
  { rx: /\bpiscina\b/i,                                     key: 'pool',     label: 'Piscina',         tone: 'cyan' },
  { rx: /\b(jard[íi]n?|jard[íi])\b/i,                       key: 'garden',   label: 'Jardí',           tone: 'green' },
  { rx: /\bterrass?[ae]\b/i,                                key: 'terrace',  label: 'Terrassa',        tone: 'green' },
  { rx: /\bbalc[óo]n?\b/i,                                  key: 'balcony',  label: 'Balcó',           tone: 'cyan' },
  { rx: /\bexterior\b/i,                                    key: 'exterior', label: 'Exterior',        tone: 'cyan' },
  { rx: /\binterior\b/i,                                    key: 'interior', label: 'Interior',        tone: 'amber' },
  { rx: /\b(parking|garatge|garaje|aparcament|plaza? de garaje)\b/i, key: 'parking',  label: 'Parking',         tone: 'cyan' },
  { rx: /\b(traster|trastero)\b/i,                          key: 'storage',  label: 'Traster',         tone: 'cyan' },
  { rx: /\b(calefacci[óo]|calefacci|aerot[èe]rmica)\b/i,    key: 'heating',  label: 'Calefacció',      tone: 'cyan' },
  { rx: /\b(aire acondicionado|aire condicionat)\b/i,       key: 'aircon',   label: 'Aire condicionat', tone: 'cyan' },
  { rx: /\b(amueblad|moblat)\b/i,                           key: 'furnished',label: 'Moblat',          tone: 'cyan' },
  { rx: /\bvist(es|as)\s+(al?\s+(mar|monta[ñn]a|piri))/i,   key: 'views',    label: 'Vistes',          tone: 'cyan' },
  { rx: /\b(reci[ée]n reformad|recentment reformat|reform integral|nueva construcci[óo]n)\b/i, key: 'recent_reform', label: 'Reforma recent', tone: 'green' },
  { rx: /\b(ascens(o|or))\b/i,                              key: 'lift_text',label: 'Ascensor',        tone: 'cyan' },
  { rx: /\b(rebaixa|rebaja|baja[dr]o de precio|preu rebaixat|oportunitat|oportunidad|urgent vendre)\b/i, key: 'price_drop', label: 'Rebaixa de preu', tone: 'amber' },
  { rx: /\b(llic[èe]ncia tur[íi]stic|licencia tur[íi]stic|HUT[A-Z]?-\d|ús turístic|uso turístico)\b/, key: 'hut',     label: 'HUT',             tone: 'amber' },
  { rx: /\b(plaça|parking|garaje)\s*incluid[ao]\b/i,        key: 'parking_inc', label: 'Garatge inclòs',  tone: 'green' },
];

function extractFeatures(description: string | null | undefined): ExtractedFeature[] {
  if (!description) return [];
  const found: ExtractedFeature[] = [];
  for (const { rx, key, label, tone } of FEATURE_REGEX) {
    if (rx.test(description)) found.push({ key, label, tone });
  }
  return found;
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

  const m2Tol = listing.m2 != null
    ? Math.max(COMP_M2_TOLERANCE_MIN, listing.m2 * COMP_M2_TOLERANCE_PCT)
    : null;
  const m2Min = listing.m2 != null ? listing.m2 - m2Tol! : null;
  const m2Max = listing.m2 != null ? listing.m2 + m2Tol! : null;
  const priceTol = Math.max(
    COMP_PRICE_TOLERANCE_MIN_EUR,
    listing.price_eur * COMP_PRICE_TOLERANCE_PCT,
  );
  const priceMin = listing.price_eur - priceTol;
  const priceMax = listing.price_eur + priceTol;

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

  const tenantId = await getMyTenantId();

  const [
    cityRes,
    neighborhoodRes,
    agenciesRes,
    compsRes,
    activityCount,
    activeListingsCount,
    trackedRes,
  ] = await Promise.all([
    cityPromise,
    neighborhoodPromise,
    agenciesPromise,
    compsQuery,
    getActivityCount24h(),
    getActiveListingsCount(),
    tenantId
      ? supabase
          .from('properties')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('source_listing_id', id)
          .is('archived_at', null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const trackedRow = (trackedRes as { data: unknown }).data as {
    id: string;
  } | null;
  const trackedPropertyId = trackedRow?.id ?? null;

  const city = (cityRes.data ?? null) as City | null;
  const neighborhood =
    (neighborhoodRes.data ?? null) as Neighborhood | null;
  let agencies = (agenciesRes.data ?? []) as Agency[];
  let compsRaw = (compsRes.data ?? []) as Listing[];
  let compsScope: 'city' | 'comarca' = 'city';

  // Fallback 1: if city has < 3 comps, widen to entire comarca with a 50%
  // wider price/m² band. Lots of small Catalan cities have <5 listings of
  // any kind on our scrapers — without this, comarca peers stay invisible.
  if (compsRaw.length < 3 && city?.comarca_slug) {
    const { data: comarcaCitySlugs } = await supabase
      .from('cities')
      .select('slug')
      .eq('comarca_slug', city.comarca_slug);
    const slugs = ((comarcaCitySlugs ?? []) as Array<{ slug: string }>).map(
      (c) => c.slug,
    );
    if (slugs.length > 0) {
      // Widen the price band 2× and DROP the m² filter — small Catalan
      // comarques are sparse, so any same-price listing is a useful comp.
      const widePrice = priceTol * 2.0;
      const wide = supabase
        .from('listings')
        .select('*')
        .is('removed_at', null)
        .in('city_slug', slugs)
        .neq('id', listing.id)
        .gte('price_eur', listing.price_eur - widePrice)
        .lte('price_eur', listing.price_eur + widePrice)
        .limit(8);
      const wideRes = await wide;
      const wideRows = (wideRes.data ?? []) as Listing[];
      if (wideRows.length > compsRaw.length) {
        compsRaw = wideRows;
        compsScope = 'comarca';
      }
    }
  }

  // Fallback 2: agencies — if no agencies in this city, show comarca-wide.
  if (agencies.length === 0 && city?.comarca_slug) {
    const { data: cas } = await supabase
      .from('cities')
      .select('slug')
      .eq('comarca_slug', city.comarca_slug);
    const slugs = ((cas ?? []) as Array<{ slug: string }>).map((c) => c.slug);
    if (slugs.length > 0) {
      const { data: agc } = await supabase
        .from('agencies')
        .select('*')
        .in('city_slug', slugs)
        .order('verified_at', { ascending: false })
        .limit(5);
      agencies = (agc ?? []) as Agency[];
    }
  }

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

  // City benchmark for valuation (latest month from price_history).
  const { data: cityPriceRow } = await supabase
    .from('price_history')
    .select('sale_eur_m2, month')
    .eq('scope_kind', 'city')
    .eq('scope_id', listing.city_slug)
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle();
  const cityPrice = cityPriceRow as unknown as
    | { sale_eur_m2: number | null }
    | null;
  const cityMedianEurM2 =
    cityPrice?.sale_eur_m2 != null ? Number(cityPrice.sale_eur_m2) : null;

  const valuation = valuationRange({
    priceEur: listing.price_eur,
    m2: listing.m2 ?? null,
    cityMedianEurM2,
  });

  // City rent benchmark for the thesis layer (latest month).
  const { data: cityRentRow } = await supabase
    .from('price_history')
    .select('rent_eur_m2_mo, rent_index_eur_m2_mo')
    .eq('scope_kind', 'city')
    .eq('scope_id', listing.city_slug)
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Postgrest narrows the chained .eq('scope_kind', 'city') select to
  // `never`. Cast to a slim row shape until codegen catches up.
  const cityRent = cityRentRow as unknown as
    | { rent_eur_m2_mo: number | null; rent_index_eur_m2_mo: number | null }
    | null;

  const thesis = computeThesis({
    priceEur: Number(listing.price_eur),
    m2: listing.m2 ?? null,
    rentEurM2Mo:
      cityRent?.rent_eur_m2_mo != null ? Number(cityRent.rent_eur_m2_mo) : null,
    rentLegalCapEurM2Mo:
      listing.rent_index_ceiling_eur_m2_mo != null
        ? Number(listing.rent_index_ceiling_eur_m2_mo)
        : cityRent?.rent_index_eur_m2_mo != null
          ? Number(cityRent.rent_index_eur_m2_mo)
          : null,
    cityMedianSaleEurM2: cityMedianEurM2,
    conditionLabel: (listing.condition_label ?? 'unknown') as
      | 'reformado'
      | 'good'
      | 'reform_needed'
      | 'wreck'
      | 'unknown',
    inZonaTensionada: listing.in_zona_tensionada ?? null,
  });

  const description = buildDescription(listing, city, neighborhood);
  const photos = listing.photos.length > 0 ? listing.photos : [];
  const riskRows = buildRiskRows(listing);
  // `description` is on the listings DB row but missing from the codegen
  // Listing type. Cast to read it.
  const listingDescription = (listing as unknown as { description: string | null })
    .description;
  const extractedFeatures = extractFeatures(listingDescription);

  // ── v3: Reality Check + Decision Workflow inputs ───────────────────────
  const subjectEurM2 =
    listing.m2 && listing.m2 > 0 ? Math.round(listing.price_eur / listing.m2) : null;

  const rank = tenantId
    ? await rankAgainstSaved(supabase, tenantId, listing.id, subjectEurM2)
    : null;

  const unknowns = countUnresolvedChecks({
    condition_label: listing.condition_label,
    energy_cert: listing.energy_cert,
    year_built: listing.year_built,
    okupa_risk: listing.okupa_risk,
    hut_license_id: listing.hut_license_id,
    in_zona_tensionada: listing.in_zona_tensionada,
  });

  // Has the user logged a visit already?
  const { count: visitCount } = tenantId
    ? await supabase
        .from('viewing_logs')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('property_id', trackedPropertyId ?? '00000000-0000-0000-0000-000000000000')
    : { count: 0 };
  const alreadyVisited = (visitCount ?? 0) > 0;

  // SERPAVI cap × m² → monthly legal rent ceiling (or fallback to thesis output).
  const legalRentMonthlyCap =
    thesis.operating.grossRentMonthly ?? null;

  const subjectPriceM2 =
    listing.m2 && listing.m2 > 0
      ? Math.round(listing.price_eur / listing.m2)
      : null;

  return (
    <div className="min-h-screen bg-bg-0 text-ink-1">
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
              {/* Title + asking price — price now PROMINENT, on the right of title */}
              <div className="mt-1 flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <h1 className="min-w-0 grow font-display text-[34px] font-medium leading-tight tracking-tight text-ink-0">
                  {listing.address ?? listing.title ?? 'Sense adreça'}
                </h1>
                <div className="shrink-0 text-right">
                  <div className="font-display text-[32px] font-medium leading-none tracking-tight text-ink-0 tabular-nums">
                    {formatEur(listing.price_eur)}
                  </div>
                  {subjectEurM2 != null && (
                    <div className="mt-1 font-mono text-[11px] tabular-nums text-ink-3">
                      {formatNumber(subjectEurM2)} €/m²
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-1 font-display text-[14px] text-ink-2">
                {listing.m2 != null ? `${formatM2(listing.m2)} · ` : ''}
                {neighborhood?.name ?? city?.name ?? listing.city_slug}
                {listing.beds != null && (
                  <>
                    <span className="mx-2 text-ink-3">·</span>
                    {listing.beds} hab
                  </>
                )}
                {listing.baths != null && (
                  <>
                    <span className="mx-2 text-ink-3">·</span>
                    {listing.baths} banys
                  </>
                )}
              </p>

              {/* Show only badges that carry information; drop the placeholder pills row */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {listing.in_zona_tensionada && (
                  <Badge variant="ghost-amber">zona tensionada</Badge>
                )}
                {listing.okupa_risk !== 'unknown' &&
                  listing.okupa_risk !== 'low' && (
                    <Badge variant="ghost-red">
                      {t(listing.okupa_risk, 'okupa_risk')}
                    </Badge>
                  )}
                {listing.condition_label !== 'unknown' && (
                  <Badge
                    variant={
                      listing.condition_label === 'reformado' ||
                      listing.condition_label === 'good'
                        ? 'good'
                        : 'warning'
                    }
                  >
                    {t(listing.condition_label, 'condition_label')}
                  </Badge>
                )}
                {listing.energy_cert && (
                  <Badge variant="info">ETE {listing.energy_cert}</Badge>
                )}
                {listing.year_built != null && (
                  <Badge variant="info">any {listing.year_built}</Badge>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <TrackCTA
                listingId={listing.id}
                tenantId={tenantId}
                trackedPropertyId={trackedPropertyId}
              />
              <ListingActions
                listingId={listing.id}
                pdfTitle={listing.address ?? listing.title ?? listing.id}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Reality Check strip — the brutal one-glance verdict */}
      <div className="mx-auto max-w-[1600px] px-6 pt-4">
        <RealityCheck
          deltaPct={valuation.deltaPct}
          cityMedianEurM2={valuation.cityMedianEurM2}
          legalRentMonthlyCap={legalRentMonthlyCap}
          rentBasis={thesis.operating.rentBasis}
          cashflowDuring={thesis.cashflow.during}
          rank={rank}
          unknowns={unknowns}
          firstSeenAt={listing.first_seen_at ?? null}
        />
      </div>

      {/* Three-column body */}
      <main className="mx-auto max-w-[1600px] px-6 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr_360px]">
          {/* LEFT — valuation + market comparison + risk
              On mobile we push it to position 2 so the photos/centre come first. */}
          <aside
            className="order-2 flex flex-col gap-5 lg:order-none"
            aria-label="Valoració i risc"
          >
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
                {valuation.basis === 'city-median' ? (
                  <>
                    Mediana ciutat ±15% · {formatNumber(Math.round(valuation.cityMedianEurM2!))} €/m²
                  </>
                ) : (
                  <>Rang ±30% · sense benchmark de ciutat</>
                )}
              </p>

              {/* Delta vs city median */}
              {valuation.deltaPct != null && valuation.deltaLabel && (
                <div className="mt-3 flex items-center gap-2">
                  <Badge
                    variant={
                      valuation.deltaLabel === 'below'
                        ? 'good'
                        : valuation.deltaLabel === 'above'
                          ? 'warning'
                          : 'info'
                    }
                  >
                    {valuation.deltaLabel === 'below'
                      ? `${Math.abs(valuation.deltaPct)}% per sota mediana`
                      : valuation.deltaLabel === 'above'
                        ? `${valuation.deltaPct}% per sobre mediana`
                        : 'En línia amb mediana'}
                  </Badge>
                  <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                    {valuation.subjectPriceM2 != null
                      ? `${formatNumber(valuation.subjectPriceM2)} €/m² (anunci)`
                      : ''}
                  </span>
                </div>
              )}

              {/* v3: real distribution + comp list lives in <MarketReality />
                  rendered as the right-column panel; the duplicate "Comparació
                  de mercat" + placeholder histogram are removed. */}
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

          {/* CENTER — gallery + description + checklist
              Mobile: order-1 so photos lead. Desktop: keep middle column. */}
          <section
            className="order-1 flex min-w-0 flex-col gap-5 lg:order-none"
            aria-label="Dossier"
          >
            <PhotoGallery
              photos={photos}
              alt={listing.address ?? listing.title ?? listing.id}
            />

            {/* Auto-extracted feature chips from description text */}
            {extractedFeatures.length > 0 && (
              <section
                aria-labelledby="features-title"
                className="rounded-sm border border-line-1 bg-bg-1 p-5"
              >
                <div className="flex items-center justify-between">
                  <h2
                    id="features-title"
                    className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3"
                  >
                    Anàlisi automàtic · {extractedFeatures.length} senyals
                  </h2>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
                    extret de l'anunci
                  </span>
                </div>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {extractedFeatures.map((f) => (
                    <li key={f.key}>
                      <Badge
                        variant={
                          f.tone === 'green'
                            ? 'good'
                            : f.tone === 'amber'
                              ? 'warning'
                              : 'info'
                        }
                      >
                        {f.label}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section
              aria-labelledby="description-title"
              className="rounded-sm border border-line-1 bg-bg-1 p-5"
            >
              <h2
                id="description-title"
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3"
              >
                Descripció · original anunci
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-1">
                {listingDescription ?? description}
              </p>
            </section>

            {/* v3: the static UNVERIFIED checklist is replaced by the
                <DecisionWorkflow /> wide section rendered below the thesis
                panel — connects the dossier to /properties + /deals + viewing_logs. */}
          </section>

          {/* RIGHT — yield, comps, agencies
              Mobile: order-3 (last). Desktop: right column. */}
          <aside
            className="order-3 flex flex-col gap-5 lg:order-none"
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

            <MarketReality
              subjectEurM2={subjectEurM2}
              comps={comps}
              compsScope={compsScope}
              comarcaLabel={comarca?.name ?? city?.comarca_slug ?? null}
              cityMedianEurM2={valuation.cityMedianEurM2}
            />

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

        {/* Investment thesis: cashflow / appreciation / flip — wide row */}
        <ThesisPanel thesis={thesis} />

        {/* Decision workflow — rank vs saves + unresolved checks + actions */}
        <div className="mt-8">
          <DecisionWorkflow
            rank={rank}
            unknowns={unknowns}
            alreadyTracked={trackedPropertyId != null}
            alreadyVisited={alreadyVisited}
            needsMoreSaves={tenantId != null && rank == null && trackedPropertyId == null}
          />
        </div>
      </main>
    </div>
  );
}

// ── Investment thesis panel ──────────────────────────────────────────────
function ThesisPanel({ thesis }: { thesis: ReturnType<typeof computeThesis> }) {
  const fmtMonth = (v: number | null) =>
    v == null
      ? DASH
      : `${v < 0 ? '−' : ''}${formatEur(Math.round(Math.abs(v)))}/mes`;
  const fmtX = (v: number | null) => (v == null ? DASH : `${v.toFixed(1)}×`);
  const fmtPct = (v: number | null) =>
    v == null ? DASH : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

  const cashflowVariant: 'good' | 'critical' | 'info' =
    thesis.cashflow.during == null
      ? 'info'
      : thesis.cashflow.during > 0
        ? 'good'
        : 'critical';
  const flipVariant: 'good' | 'critical' | 'info' =
    thesis.flip.returnPct == null
      ? 'info'
      : thesis.flip.returnPct > 8
        ? 'good'
        : thesis.flip.returnPct > 0
          ? 'info'
          : 'critical';

  return (
    <section
      aria-label="Tesis d'inversió"
      className="mt-8 rounded-sm border border-line-1 bg-bg-1"
    >
      <header className="flex items-center justify-between border-b border-line-1 px-5 py-3">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
          Tesis d'inversió · model determinista
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
          ITP {(thesis.assumptions.itp * 100).toFixed(0)}% · hipoteca{' '}
          {(thesis.assumptions.mortgageRate * 100).toFixed(2)}% × {thesis.assumptions.mortgageTermY}a ·
          apreciació {(thesis.assumptions.appreciation * 100).toFixed(1)}%/a
        </span>
      </header>

      <div className="grid grid-cols-1 gap-px bg-line-1 md:grid-cols-3">
        {/* Cashflow */}
        <div className="bg-bg-1 p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[14px] font-medium tracking-tight text-ink-0">
              Cashflow · long-let
            </h3>
            <Badge variant={cashflowVariant}>
              {thesis.cashflow.during != null
                ? thesis.cashflow.during > 0
                  ? 'AUTOFINANÇABLE'
                  : 'NEGATIU'
                : 'SENSE DADES'}
            </Badge>
          </div>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
            Lloguer{' '}
            {thesis.operating.rentBasis === 'serpavi-legal'
              ? '· sostre SERPAVI'
              : thesis.operating.rentBasis === 'market'
                ? '· mercat'
                : '· n/d'}
          </p>
          <dl className="mt-3 space-y-1.5 font-mono text-[11px] tabular-nums">
            <ThesisRow k="Capital inicial" v={formatEur(thesis.initial.totalCash)} />
            <ThesisRow k="Quota mensual hipoteca" v={fmtMonth(thesis.initial.monthlyMortgage)} />
            <ThesisRow k="Despeses mensuals (IBI+com.+manten.)" v={fmtMonth(thesis.operating.opex)} />
            <ThesisRow
              k="Lloguer brut mensual"
              v={
                thesis.operating.grossRentMonthly != null
                  ? formatEur(Math.round(thesis.operating.grossRentMonthly)) + '/mes'
                  : DASH
              }
            />
            <div className="my-2 border-t border-line-1" />
            <ThesisRow
              k="Cashflow durant hipoteca"
              v={fmtMonth(thesis.cashflow.during)}
              tone={cashflowVariant === 'good' ? 'cyan' : 'amber'}
            />
            <ThesisRow
              k="Cashflow després de hipoteca (any 26+)"
              v={fmtMonth(thesis.cashflow.after)}
              tone="cyan"
            />
            <ThesisRow k="Retorn cash-on-cash anual" v={fmtPct(thesis.cashflow.cocReturnPct)} />
            <ThesisRow
              k="PER (anys per recuperar inversió)"
              v={
                thesis.cashflow.paybackYears != null
                  ? `${thesis.cashflow.paybackYears.toFixed(1)} anys`
                  : DASH
              }
            />
          </dl>
        </div>

        {/* Appreciation */}
        <div className="bg-bg-1 p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[14px] font-medium tracking-tight text-ink-0">
              Appreciation · buy-and-hold
            </h3>
            <Badge variant="info">CAGR {(thesis.assumptions.appreciation * 100).toFixed(1)}%</Badge>
          </div>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
            Espanya residencial · 1995–2024 nominal
          </p>
          <dl className="mt-3 space-y-1.5 font-mono text-[11px] tabular-nums">
            <ThesisRow k="Valor projectat any 5" v={formatEur(thesis.appreciation.yr5)} />
            <ThesisRow k="Valor projectat any 10" v={formatEur(thesis.appreciation.yr10)} />
            <ThesisRow k="Valor projectat any 25" v={formatEur(thesis.appreciation.yr25)} />
            <div className="my-2 border-t border-line-1" />
            <ThesisRow k="Múltiple sobre capital · 25a" v={fmtX(thesis.appreciation.holdReturnX)} tone="cyan" />
            <ThesisRow
              k="Equity al final hipoteca (any 25)"
              v={formatEur(thesis.appreciation.yr25 * 0.95)}
            />
          </dl>
        </div>

        {/* Renovate + flip */}
        <div className="bg-bg-1 p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[14px] font-medium tracking-tight text-ink-0">
              Renovate + flip
            </h3>
            <Badge variant={flipVariant}>
              {thesis.flip.returnPct != null
                ? `${thesis.flip.returnPct >= 0 ? '+' : ''}${thesis.flip.returnPct.toFixed(0)}%`
                : 'N/A'}
            </Badge>
          </div>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
            {thesis.flip.renoCostPerM2}€/m² · {thesis.flip.months} mesos · sortida +
            {((1.10 - 1) * 100).toFixed(0)}% sobre mediana ciutat
          </p>
          <dl className="mt-3 space-y-1.5 font-mono text-[11px] tabular-nums">
            <ThesisRow k="Cost reforma" v={formatEur(Math.round(thesis.flip.renoCost))} />
            <ThesisRow k="Carry cost durant obra" v={formatEur(Math.round(thesis.flip.carryCost))} />
            <ThesisRow k="Preu sortida estimat" v={formatEur(Math.round(thesis.flip.exitPrice))} />
            <div className="my-2 border-t border-line-1" />
            <ThesisRow
              k="Benefici net"
              v={formatEur(Math.round(thesis.flip.netProfit))}
              tone={flipVariant === 'good' ? 'cyan' : 'amber'}
            />
            <ThesisRow
              k="Retorn sobre capital deployable"
              v={fmtPct(thesis.flip.returnPct)}
              tone={flipVariant === 'good' ? 'cyan' : undefined}
            />
          </dl>
        </div>
      </div>

      {/* Warnings */}
      {thesis.warnings.length > 0 && (
        <ul className="border-t border-line-1 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-amber">
          {thesis.warnings.map((w, i) => (
            <li key={i}>· {w}</li>
          ))}
        </ul>
      )}

      <footer className="border-t border-line-1 px-5 py-3 font-mono text-[10px] leading-[1.55] text-ink-3">
        Suposicions: 80% LTV · Euribor 12m + 1% spread · IBI 0,3% anual · comunitat 100€/mes ·
        manteniment 1% anual · vacancia 5% · costos sortida flip 10% · prima sortida 10% sobre
        mediana ciutat. Veure <code>apps/web/lib/thesis.ts</code> per al codi.
      </footer>
    </section>
  );
}

function ThesisRow({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: 'cyan' | 'amber';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">{k}</dt>
      <dd
        className={
          tone === 'cyan'
            ? 'text-cyan'
            : tone === 'amber'
              ? 'text-amber'
              : 'text-ink-1'
        }
      >
        {v}
      </dd>
    </div>
  );
}

/**
 * Track / untrack CTA in the dossier header. Three states:
 *   - logged out          → "★ Entra per seguir" link to /login
 *   - logged in, untracked → "★ Seguir" cyan button (createsa property)
 *   - logged in, tracked   → "✓ Seguint" green pill that links to the property + small untrack X
 */
function TrackCTA({
  listingId,
  tenantId,
  trackedPropertyId,
}: {
  listingId: string;
  tenantId: string | null;
  trackedPropertyId: string | null;
}) {
  if (!tenantId) {
    return (
      <Link
        href={(`/login?next=${encodeURIComponent(`/listing/${listingId}`)}`) as Route}
        className="inline-flex items-center gap-1 border border-cyan bg-cyan/15 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-cyan hover:bg-cyan/25"
      >
        ★ Entra per seguir
      </Link>
    );
  }
  if (trackedPropertyId) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href={(`/properties/${trackedPropertyId}`) as Route}
          className="inline-flex items-center gap-1 border border-green-dim bg-green-dim/15 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-green hover:border-green hover:text-green-hot"
        >
          ✓ Seguint · obrir fitxa
        </Link>
        <form action={untrackListing}>
          <input type="hidden" name="listing_id" value={listingId} />
          <input type="hidden" name="return_to" value={`/listing/${listingId}`} />
          <button
            type="submit"
            title="Deixar de seguir"
            className="border border-line-2 px-2 py-2 font-mono text-[11px] text-ink-3 hover:border-red-dim hover:text-red"
          >
            ✕
          </button>
        </form>
      </div>
    );
  }
  return (
    <form action={trackListing}>
      <input type="hidden" name="listing_id" value={listingId} />
      <input type="hidden" name="return_to" value={`/listing/${listingId}`} />
      <button
        type="submit"
        className="inline-flex items-center gap-1 border border-cyan bg-cyan/15 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-cyan hover:bg-cyan/25"
      >
        ★ Seguir
      </button>
    </form>
  );
}
