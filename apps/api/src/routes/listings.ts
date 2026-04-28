// apps/api/src/routes/listings.ts
//
// REST handlers for listings + cities + neighborhoods + agencies.
// All routes are gated by the bearer-token auth middleware in server.ts.

import { Hono } from 'hono';
import { supabase } from '../db.ts';
import { BruixolaError } from '../errors.ts';

export const listingsRoutes = new Hono();

// ─────────────────────────────────────────────────────────────
// GET /listings — filtered + paginated
// Query params:
//   city           string (slug)
//   comarca        string (slug)
//   max_price_eur  number
//   min_price_eur  number
//   min_beds       integer
//   min_m2         number
//   condition      condition_t
//   in_zona_tensionada  bool
//   min_yield_p50  number (percent)
//   limit          1-200, default 50
//   cursor         opaque (offset for now)
// ─────────────────────────────────────────────────────────────
listingsRoutes.get('/listings', async (c) => {
  const q = c.req.query();
  const limit = Math.min(Math.max(Number.parseInt(q.limit ?? '50', 10) || 50, 1), 200);
  const offset = Number.parseInt(q.cursor ?? '0', 10) || 0;

  let query = supabase
    .from('listings')
    .select(
      'id, platform, url, title, city_slug, neighborhood_id, address, price_eur, m2, beds, baths, lift, energy_cert, year_built, year_renovated, condition_label, okupa_risk, in_zona_tensionada, rent_index_ceiling_eur_m2_mo, gross_yield_pct_p25, gross_yield_pct_p50, gross_yield_pct_p75, gross_yield_pct_legal_max, walk_to_hospital_min, walk_to_metro_min, distance_to_beach_m, hut_license_id, photos, scraped_at, first_seen_at',
      { count: 'exact' },
    )
    .is('removed_at', null);

  if (q.city) query = query.eq('city_slug', q.city);
  if (q.condition) query = query.eq('condition_label', q.condition);

  const maxPrice = q.max_price_eur ? Number.parseFloat(q.max_price_eur) : null;
  if (maxPrice !== null && Number.isFinite(maxPrice)) query = query.lte('price_eur', maxPrice);

  const minPrice = q.min_price_eur ? Number.parseFloat(q.min_price_eur) : null;
  if (minPrice !== null && Number.isFinite(minPrice)) query = query.gte('price_eur', minPrice);

  const minBeds = q.min_beds ? Number.parseInt(q.min_beds, 10) : null;
  if (minBeds !== null && Number.isFinite(minBeds)) query = query.gte('beds', minBeds);

  const minM2 = q.min_m2 ? Number.parseFloat(q.min_m2) : null;
  if (minM2 !== null && Number.isFinite(minM2)) query = query.gte('m2', minM2);

  if (q.in_zona_tensionada === 'true') query = query.eq('in_zona_tensionada', true);
  if (q.in_zona_tensionada === 'false') query = query.eq('in_zona_tensionada', false);

  const minYield = q.min_yield_p50 ? Number.parseFloat(q.min_yield_p50) : null;
  if (minYield !== null && Number.isFinite(minYield)) query = query.gte('gross_yield_pct_p50', minYield);

  query = query.order('first_seen_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) {
    throw new BruixolaError('internal_error', `listings query failed: ${error.message}`, 500);
  }

  const total = count ?? 0;
  const nextOffset = offset + limit;
  const hasMore = nextOffset < total;

  return c.json({
    items: data ?? [],
    cursor: hasMore ? String(nextOffset) : null,
    total,
    has_more: hasMore,
  });
});

// ─────────────────────────────────────────────────────────────
// GET /listings/:id — single listing detail
// ─────────────────────────────────────────────────────────────
listingsRoutes.get('/listings/:id', async (c) => {
  const id = c.req.param('id');
  if (!/^[0-9a-f]{12}$/.test(id)) {
    throw new BruixolaError(
      'invalid_listing_id',
      `Listing id must be a 12-hex-character string; got '${id}'.`,
      400,
    );
  }

  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .is('removed_at', null)
    .maybeSingle();

  if (error) {
    throw new BruixolaError('internal_error', `listing detail failed: ${error.message}`, 500);
  }
  if (!data) {
    throw new BruixolaError('not_found', `No live listing with id '${id}'.`, 404);
  }

  return c.json(data);
});

// ─────────────────────────────────────────────────────────────
// GET /cities — list all cities (small ref table)
// ─────────────────────────────────────────────────────────────
listingsRoutes.get('/cities', async (c) => {
  const { data, error } = await supabase
    .from('cities')
    .select('slug, name, name_es, comarca_slug, province, population, in_zona_tensionada, has_hospital, has_university, transit_score, hut_moratorium_status')
    .order('name');
  if (error) throw new BruixolaError('internal_error', error.message, 500);
  return c.json({ items: data ?? [] });
});

// ─────────────────────────────────────────────────────────────
// GET /strategies — investment theses
// ─────────────────────────────────────────────────────────────
listingsRoutes.get('/strategies', async (c) => {
  const { data, error } = await supabase
    .from('strategies')
    .select('*')
    .order('avg_yield_pct_p50', { ascending: false, nullsFirst: false });
  if (error) throw new BruixolaError('internal_error', error.message, 500);
  return c.json({ items: data ?? [] });
});

// ─────────────────────────────────────────────────────────────
// GET /agencies — verified directory entries
// Query: ?city=<slug>
// ─────────────────────────────────────────────────────────────
listingsRoutes.get('/agencies', async (c) => {
  const city = c.req.query('city');
  let query = supabase.from('agencies').select('*').order('verified_at', { ascending: false });
  if (city) query = query.eq('city_slug', city);
  const { data, error } = await query;
  if (error) throw new BruixolaError('internal_error', error.message, 500);
  return c.json({ items: data ?? [] });
});
