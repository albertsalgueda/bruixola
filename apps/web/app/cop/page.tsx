import { createClient } from '@/lib/supabase/server';
import { Cockpit } from '@/components/cop/cockpit';
import { getActivityCount24h } from '@/lib/activity';
import {
  computeGlobalSummary,
  rowToCity,
  rowToPricePoint,
  type CityForMap,
  type ComarcaGeo,
  type PricePoint,
} from '@/lib/market';

// COP — Common Operating Picture (public-market view).
//
// Server component. Fetches:
//   - All 178 Catalan cities with extracted lng/lat (RPC cities_for_map)
//   - All 41 comarques with their polygon as GeoJSON (RPC comarques_geojson)
//   - Latest-month price_history rows per scope_id (city) for the choropleth
//     and right-panel summaries
// Hands everything to the <Cockpit/> client wrapper which owns selection
// state and orchestrates the map / dossier / market panel triptych.
export default async function CopPage() {
  const supabase = await createClient();

  const [citiesRes, comarquesRes, priceRes, activityCount] = await Promise.all([
    supabase.rpc('cities_for_map'),
    supabase.rpc('comarques_geojson'),
    // 64 months × 40 cities = 2,560 rows. Order by month asc so the right
    // panel can render time-series directly without re-sorting client-side.
    supabase
      .from('price_history')
      .select('scope_id, scope_kind, month, sale_eur_m2, rent_eur_m2_mo, rent_index_eur_m2_mo')
      .eq('scope_kind', 'city')
      .order('month', { ascending: true }),
    getActivityCount24h(),
  ]);

  const cities: CityForMap[] = (citiesRes.data ?? []).map((r) =>
    rowToCity(r as unknown as Record<string, unknown>),
  );
  const comarques: ComarcaGeo[] = (comarquesRes.data ?? []) as ComarcaGeo[];

  // Bucket price-history rows by city slug, ordered ascending.
  // Cast — supabase-js narrows .eq('scope_kind','city') in a way that nukes
  // the inferred row type when the column is part of a discriminated union.
  type PriceRow = {
    scope_id: string;
    scope_kind: string;
    month: string;
    sale_eur_m2: number | string | null;
    rent_eur_m2_mo: number | string | null;
    rent_index_eur_m2_mo: number | string | null;
  };
  const priceRows = (priceRes.data ?? []) as unknown as PriceRow[];
  const priceHistoryByCity = new Map<string, PricePoint[]>();
  for (const row of priceRows) {
    const arr = priceHistoryByCity.get(row.scope_id) ?? [];
    arr.push(
      rowToPricePoint({
        month: row.month,
        sale_eur_m2: (row.sale_eur_m2 as unknown) as null,
        rent_eur_m2_mo: (row.rent_eur_m2_mo as unknown) as null,
        rent_index_eur_m2_mo: (row.rent_index_eur_m2_mo as unknown) as null,
      }),
    );
    priceHistoryByCity.set(row.scope_id, arr);
  }

  // Latest-point-per-city map for the choropleth + summary aggregates.
  const latestByCity = new Map<string, PricePoint>();
  for (const [slug, points] of priceHistoryByCity) {
    if (points.length > 0) latestByCity.set(slug, points[points.length - 1]!);
  }

  const summary = computeGlobalSummary(cities, comarques.length, latestByCity);

  // Plain-object form of the lookup map — Maps don't survive the
  // server-component → client-component boundary, but Records do.
  const priceHistoryRecord: Record<string, PricePoint[]> = {};
  for (const [slug, points] of priceHistoryByCity) {
    priceHistoryRecord[slug] = points;
  }
  const latestByCityRecord: Record<string, PricePoint> = {};
  for (const [slug, point] of latestByCity) {
    latestByCityRecord[slug] = point;
  }

  return (
    <Cockpit
      cities={cities}
      comarques={comarques}
      priceHistoryByCity={priceHistoryRecord}
      latestByCity={latestByCityRecord}
      summary={summary}
      activityCount={activityCount}
    />
  );
}
