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
  price_eur: number | null;
  m2: number | null;
  in_zona_tensionada: boolean | null;
  yield_p50: number | null;
};

/** Selection state shared across map / dossier / right panel. */
export type SelectedScope =
  | { kind: 'comarca'; id: string }
  | { kind: 'city'; id: string }
  | { kind: null; id: null };

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

/** Aggregate the latest sale/rent for cities inside a given comarca. */
export function comarcaStats(
  comarcaSlug: string,
  cities: CityForMap[],
  latestByCity: Map<string, PricePoint>,
): {
  memberCount: number;
  population: number;
  zonaTensionadaCount: number;
  avgSaleEurM2: number | null;
  avgRentEurM2Mo: number | null;
} {
  const members = cities.filter((c) => c.comarca_slug === comarcaSlug);
  const sales: number[] = [];
  const rents: number[] = [];
  let pop = 0;
  let tens = 0;
  for (const c of members) {
    pop += c.population ?? 0;
    if (c.in_zona_tensionada) tens += 1;
    const lp = latestByCity.get(c.slug);
    if (lp?.sale_eur_m2 != null) sales.push(lp.sale_eur_m2);
    if (lp?.rent_eur_m2_mo != null) rents.push(lp.rent_eur_m2_mo);
  }
  const avg = (xs: number[]) =>
    xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    memberCount: members.length,
    population: pop,
    zonaTensionadaCount: tens,
    avgSaleEurM2: avg(sales),
    avgRentEurM2Mo: avg(rents),
  };
}
