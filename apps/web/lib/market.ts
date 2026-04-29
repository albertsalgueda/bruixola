// Public-market types and helpers for the COP page and the agent.
//
// The DB shape:
//   - `cities_for_map()` RPC → 178 rows with extracted lng/lat
//   - `comarques_geojson()` RPC → 41 rows with polygon as GeoJSON text
//   - `price_history` table → monthly rows, scope_kind ∈ {city, neighborhood}
//
// Supabase returns NUMERIC columns as strings — every helper here coerces them
// to numbers, so the rest of the code can deal with `number | null` only.

import type { HutMoratoriumStatus, PriceHistory } from '@/lib/supabase/types';

/** A row from the `public.cities_for_map()` RPC. */
export type CityForMap = {
  slug: string;
  name: string;
  name_es: string | null;
  comarca_slug: string;
  province: string;
  population: number | null;
  in_zona_tensionada: boolean;
  has_hospital: boolean;
  has_university: boolean;
  transit_score: number | null;
  hut_moratorium_status: HutMoratoriumStatus;
  rent_index_eur_m2_mo: number | null;
  avg_sale_eur_m2: number | null;
  avg_rent_eur_m2_mo: number | null;
  lng: number;
  lat: number;
};

/** A row from the `public.comarques_geojson()` RPC. */
export type ComarcaGeo = {
  slug: string;
  name: string;
  province: string;
  population: number | null;
  in_zona_tensionada: boolean;
  /** GeoJSON Geometry as a JSON string — parse before handing to Mapbox. */
  geojson: string;
};

/** A single monthly price-history row, coerced to numbers. */
export type PricePoint = {
  month: string; // 'YYYY-MM'
  sale_eur_m2: number | null;
  rent_eur_m2_mo: number | null;
  rent_index_eur_m2_mo: number | null;
};

/** Catalonia-wide summary stats rendered in the Dossier. */
export type GlobalSummary = {
  cityCount: number;
  comarcaCount: number;
  zonaTensionadaCount: number;
  zonaTensionadaPct: number; // 0..100
  avgSaleEurM2: number | null;
  avgRentEurM2Mo: number | null;
};

/**
 * Slim shape for a public listing rendered on the COP map. Coordinates come
 * from the listing's city centroid (no per-listing lat/lng yet); the map
 * applies a deterministic hash-based jitter so multiple listings in the same
 * city fan out instead of stacking.
 */
export type ListingMarker = {
  id: string;
  city_slug: string;
  city_name: string;
  lng: number;
  lat: number;
  title: string;
  address: string | null;
  price_eur: number;
  m2: number | null;
  beds: number | null;
  in_zona_tensionada: boolean | null;
  yield_p50: number | null;
  photo: string | null;
  /** True if the current user already tracks this listing as a property. */
  tracked: boolean;
};

/** Selection state shared across map / dossier / right panel. */
export type SelectedScope =
  | { kind: 'comarca'; id: string }
  | { kind: 'city'; id: string }
  | { kind: 'listing'; id: string }
  | { kind: null; id: null };

/** Which layer the user is exploring on the COP map. */
export type MapMode = 'zones' | 'listings';

/** Coerce a Supabase numeric (string|null) to number|null. */
export function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Map a raw RPC city row (numeric → string) to typed `CityForMap`. */
export function rowToCity(r: Record<string, unknown>): CityForMap {
  return {
    slug: String(r.slug),
    name: String(r.name),
    name_es: (r.name_es as string | null) ?? null,
    comarca_slug: String(r.comarca_slug),
    province: String(r.province),
    population: num(r.population),
    in_zona_tensionada: r.in_zona_tensionada === true,
    has_hospital: r.has_hospital === true,
    has_university: r.has_university === true,
    transit_score: num(r.transit_score),
    hut_moratorium_status:
      (r.hut_moratorium_status as HutMoratoriumStatus) ?? 'unknown',
    rent_index_eur_m2_mo: num(r.rent_index_eur_m2_mo),
    avg_sale_eur_m2: num(r.avg_sale_eur_m2),
    avg_rent_eur_m2_mo: num(r.avg_rent_eur_m2_mo),
    lng: num(r.lng) ?? 0,
    lat: num(r.lat) ?? 0,
  };
}

/** Coerce a `price_history` row (NUMERIC → string from supabase-js) to typed. */
export function rowToPricePoint(r: Pick<PriceHistory, 'month' | 'sale_eur_m2' | 'rent_eur_m2_mo' | 'rent_index_eur_m2_mo'>): PricePoint {
  return {
    month: r.month,
    sale_eur_m2: num(r.sale_eur_m2),
    rent_eur_m2_mo: num(r.rent_eur_m2_mo),
    rent_index_eur_m2_mo: num(r.rent_index_eur_m2_mo),
  };
}

/** Compute Catalonia-wide summary from city + comarca data + latest prices. */
export function computeGlobalSummary(
  cities: CityForMap[],
  comarcaCount: number,
  latestByCity: Map<string, PricePoint>,
): GlobalSummary {
  const cityCount = cities.length;
  const tens = cities.filter((c) => c.in_zona_tensionada).length;
  const sales: number[] = [];
  const rents: number[] = [];
  for (const c of cities) {
    const lp = latestByCity.get(c.slug);
    if (lp?.sale_eur_m2 != null) sales.push(lp.sale_eur_m2);
    if (lp?.rent_eur_m2_mo != null) rents.push(lp.rent_eur_m2_mo);
  }
  const avg = (xs: number[]) =>
    xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    cityCount,
    comarcaCount,
    zonaTensionadaCount: tens,
    zonaTensionadaPct: cityCount === 0 ? 0 : (tens / cityCount) * 100,
    avgSaleEurM2: avg(sales),
    avgRentEurM2Mo: avg(rents),
  };
}

/** Linearly-interpolated percentile from a sorted ascending array. */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const w = idx - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

/** Gross annual yield (%) from per-m² sale and monthly rent. */
export function grossYieldPct(
  saleEurM2: number | null,
  rentEurM2Mo: number | null,
): number | null {
  if (saleEurM2 == null || rentEurM2Mo == null || saleEurM2 <= 0) return null;
  return ((rentEurM2Mo * 12) / saleEurM2) * 100;
}

/** Yield range (P25/P50/P75) over a set of (sale, rent) pairs. */
export function yieldRange(
  pairs: { sale: number; rent: number }[],
): { p25: number | null; p50: number | null; p75: number | null } {
  const ys = pairs
    .map((x) => grossYieldPct(x.sale, x.rent))
    .filter((y): y is number => y != null)
    .sort((a, b) => a - b);
  return {
    p25: percentile(ys, 0.25),
    p50: percentile(ys, 0.5),
    p75: percentile(ys, 0.75),
  };
}

/** Year-over-year change (%) from the last point and the one ~12 months back. */
export function yoyPct(
  series: { month: string; value: number | null }[],
): number | null {
  if (series.length < 2) return null;
  const last = [...series].reverse().find((p) => p.value != null);
  if (!last || last.value == null) return null;
  const lastDate = new Date(`${last.month}-01`);
  // Find the closest point ≥ 11 months before `last`.
  let best: { month: string; value: number | null } | null = null;
  let bestDiff = Infinity;
  for (const p of series) {
    if (p.value == null) continue;
    const d = new Date(`${p.month}-01`);
    const months =
      (lastDate.getFullYear() - d.getFullYear()) * 12 +
      (lastDate.getMonth() - d.getMonth());
    if (months < 11) continue;
    const diff = Math.abs(months - 12);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
    }
  }
  if (!best || best.value == null || best.value === 0) return null;
  return ((last.value - best.value) / best.value) * 100;
}

/** Aggregated stats for cities inside a given comarca. */
export type ComarcaStats = {
  memberCount: number;
  population: number;
  zonaTensionadaCount: number;
  avgSaleEurM2: number | null;
  avgRentEurM2Mo: number | null;
  avgRentIndexEurM2Mo: number | null;
  yieldP25: number | null;
  yieldP50: number | null;
  yieldP75: number | null;
  /** Legal-ceiling gross yield % when avg rent is replaced by avg SERPAVI cap. */
  legalMaxYieldPct: number | null;
  /** Years to recover sale price at current avg rent (price-to-rent ratio). */
  perYears: number | null;
  /** % spread between avg real rent and avg SERPAVI ceiling (positive = above). */
  rentVsCeilingPct: number | null;
};

/** Aggregate the latest sale/rent for cities inside a given comarca. */
export function comarcaStats(
  comarcaSlug: string,
  cities: CityForMap[],
  latestByCity: Map<string, PricePoint>,
): ComarcaStats {
  const members = cities.filter((c) => c.comarca_slug === comarcaSlug);
  const sales: number[] = [];
  const rents: number[] = [];
  const ceilings: number[] = [];
  const pairs: { sale: number; rent: number }[] = [];
  let pop = 0;
  let tens = 0;
  for (const c of members) {
    pop += c.population ?? 0;
    if (c.in_zona_tensionada) tens += 1;
    const lp = latestByCity.get(c.slug);
    if (lp?.sale_eur_m2 != null) sales.push(lp.sale_eur_m2);
    if (lp?.rent_eur_m2_mo != null) rents.push(lp.rent_eur_m2_mo);
    if (c.rent_index_eur_m2_mo != null) ceilings.push(c.rent_index_eur_m2_mo);
    if (lp?.sale_eur_m2 != null && lp.rent_eur_m2_mo != null) {
      pairs.push({ sale: lp.sale_eur_m2, rent: lp.rent_eur_m2_mo });
    }
  }
  const avg = (xs: number[]) =>
    xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
  const avgSale = avg(sales);
  const avgRent = avg(rents);
  const avgCeiling = avg(ceilings);
  const yr = yieldRange(pairs);
  const legalMaxYieldPct = grossYieldPct(avgSale, avgCeiling);
  const perYears =
    avgSale != null && avgRent != null && avgRent > 0
      ? avgSale / (avgRent * 12)
      : null;
  const rentVsCeilingPct =
    avgRent != null && avgCeiling != null && avgCeiling > 0
      ? ((avgRent - avgCeiling) / avgCeiling) * 100
      : null;
  return {
    memberCount: members.length,
    population: pop,
    zonaTensionadaCount: tens,
    avgSaleEurM2: avgSale,
    avgRentEurM2Mo: avgRent,
    avgRentIndexEurM2Mo: avgCeiling,
    yieldP25: yr.p25,
    yieldP50: yr.p50,
    yieldP75: yr.p75,
    legalMaxYieldPct,
    perYears,
    rentVsCeilingPct,
  };
}

/** Per-month gross yield series for a city. */
export function cityYieldSeries(history: PricePoint[]): number[] {
  return history
    .map((p) => grossYieldPct(p.sale_eur_m2, p.rent_eur_m2_mo))
    .filter((y): y is number => y != null);
}

/** Yield range + PER + YoY + spread vs ceiling for a single city. */
export function cityInvestorStats(
  city: CityForMap,
  history: PricePoint[],
): {
  yieldP25: number | null;
  yieldP50: number | null;
  yieldP75: number | null;
  legalMaxYieldPct: number | null;
  perYears: number | null;
  saleYoYPct: number | null;
  rentYoYPct: number | null;
  rentVsCeilingPct: number | null;
} {
  const ys = cityYieldSeries(history).sort((a, b) => a - b);
  const last = [...history].reverse().find(
    (p) => p.sale_eur_m2 != null || p.rent_eur_m2_mo != null,
  );
  const lastSale = last?.sale_eur_m2 ?? city.avg_sale_eur_m2 ?? null;
  const lastRent = last?.rent_eur_m2_mo ?? city.avg_rent_eur_m2_mo ?? null;
  const ceiling = city.rent_index_eur_m2_mo;
  const perYears =
    lastSale != null && lastRent != null && lastRent > 0
      ? lastSale / (lastRent * 12)
      : null;
  return {
    yieldP25: percentile(ys, 0.25),
    yieldP50: percentile(ys, 0.5),
    yieldP75: percentile(ys, 0.75),
    legalMaxYieldPct: grossYieldPct(lastSale, ceiling),
    perYears,
    saleYoYPct: yoyPct(
      history.map((p) => ({ month: p.month, value: p.sale_eur_m2 })),
    ),
    rentYoYPct: yoyPct(
      history.map((p) => ({ month: p.month, value: p.rent_eur_m2_mo })),
    ),
    rentVsCeilingPct:
      lastRent != null && ceiling != null && ceiling > 0
        ? ((lastRent - ceiling) / ceiling) * 100
        : null,
  };
}
