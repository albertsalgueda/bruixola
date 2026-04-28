// apps/api/src/routes/tools.ts
//
// RPC handlers for OpenClaw agent. Same auth wall as REST routes.
// Each tool takes all params it needs and returns agent-ready answers.

import { Hono } from 'hono';
import { supabase } from '../db.ts';
import { BruixolaError } from '../errors.ts';

export const toolsRoutes = new Hono();

// ─────────────────────────────────────────────────────────────
// POST /tools/search — flexible filter search
// Body: same shape as openclaw/skills/bruixola.json#search_listings
// ─────────────────────────────────────────────────────────────
toolsRoutes.post('/tools/search', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  const limit = Math.min(Math.max(Number.parseInt(String(body.limit ?? 5), 10) || 5, 1), 10);
  const cursor = Number.parseInt(String(body.cursor ?? '0'), 10) || 0;

  let query = supabase
    .from('listings')
    .select(
      'id, platform, url, city_slug, address, price_eur, m2, beds, condition_label, in_zona_tensionada, gross_yield_pct_p25, gross_yield_pct_p50, gross_yield_pct_p75, gross_yield_pct_legal_max, hut_license_id, photos',
      { count: 'exact' },
    )
    .is('removed_at', null);

  if (typeof body.city === 'string') query = query.eq('city_slug', body.city);
  if (typeof body.condition === 'string') query = query.eq('condition_label', body.condition);
  if (typeof body.max_price_eur === 'number') query = query.lte('price_eur', body.max_price_eur);
  if (typeof body.min_price_eur === 'number') query = query.gte('price_eur', body.min_price_eur);
  if (typeof body.min_beds === 'number') query = query.gte('beds', body.min_beds);
  if (typeof body.max_beds === 'number') query = query.lte('beds', body.max_beds);
  if (typeof body.min_m2 === 'number') query = query.gte('m2', body.min_m2);
  if (typeof body.max_m2 === 'number') query = query.lte('m2', body.max_m2);
  if (typeof body.lift === 'boolean') query = query.eq('lift', body.lift);
  if (typeof body.in_zona_tensionada === 'boolean') query = query.eq('in_zona_tensionada', body.in_zona_tensionada);
  if (typeof body.min_yield_p50_pct === 'number')
    query = query.gte('gross_yield_pct_p50', body.min_yield_p50_pct);
  if (body.hut_license_required === true) query = query.not('hut_license_id', 'is', null);

  query = query
    .order('gross_yield_pct_p50', { ascending: false, nullsFirst: false })
    .range(cursor, cursor + limit - 1);

  const { data, count, error } = await query;
  if (error) throw new BruixolaError('internal_error', `search failed: ${error.message}`, 500);

  const total = count ?? 0;
  const nextOffset = cursor + limit;
  const hasMore = nextOffset < total;

  if (total === 0) {
    return c.json({
      items: [],
      total: 0,
      has_more: false,
      cursor: null,
      note:
        'No listings matched your filter. Suggest the user widens price range, drops min_beds, or removes condition filter.',
    });
  }

  return c.json({
    items: data ?? [],
    total,
    has_more: hasMore,
    cursor: hasMore ? String(nextOffset) : null,
  });
});

// ─────────────────────────────────────────────────────────────
// POST /tools/yield-for — yield range + legal ceiling for one listing
// Body: { listing_id: "12-hex" }
// ─────────────────────────────────────────────────────────────
toolsRoutes.post('/tools/yield-for', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.listing_id === 'string' ? body.listing_id : '';
  if (!/^[0-9a-f]{12}$/.test(id)) {
    throw new BruixolaError(
      'invalid_listing_id',
      `listing_id must be 12 hex chars; got '${id}'.`,
      400,
    );
  }

  const { data, error } = await supabase
    .from('listings')
    .select(
      'id, url, city_slug, address, price_eur, m2, in_zona_tensionada, rent_index_ceiling_eur_m2_mo, gross_yield_pct_p25, gross_yield_pct_p50, gross_yield_pct_p75, gross_yield_pct_legal_max, yield_formula_version',
    )
    .eq('id', id)
    .is('removed_at', null)
    .maybeSingle();

  if (error) throw new BruixolaError('internal_error', error.message, 500);
  if (!data) throw new BruixolaError('not_found', `No live listing '${id}'.`, 404);

  return c.json({
    listing: {
      id: data.id,
      url: data.url,
      city: data.city_slug,
      address: data.address,
      price_eur: data.price_eur,
      m2: data.m2,
    },
    yield_range: {
      p25: data.gross_yield_pct_p25,
      p50: data.gross_yield_pct_p50,
      p75: data.gross_yield_pct_p75,
    },
    legal: {
      in_zona_tensionada: data.in_zona_tensionada,
      rent_ceiling_eur_m2_mo: data.rent_index_ceiling_eur_m2_mo,
      legal_max_yield_pct: data.gross_yield_pct_legal_max,
    },
    formula_version: data.yield_formula_version,
    note:
      data.gross_yield_pct_p50 === null
        ? 'Yield could not be computed — comp set too small for this address.'
        : data.in_zona_tensionada
          ? 'Yield is capped by SERPAVI índex de referència. P75 may not be lawfully achievable.'
          : 'Listing is outside any zona tensionada. No legal rent ceiling applies.',
  });
});

// ─────────────────────────────────────────────────────────────
// POST /tools/compare — side-by-side
// Body: { listing_ids: ["...", ...] }  // 2-5 ids
// ─────────────────────────────────────────────────────────────
toolsRoutes.post('/tools/compare', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const ids = Array.isArray(body.listing_ids) ? (body.listing_ids as unknown[]) : [];
  if (ids.length < 2 || ids.length > 5) {
    throw new BruixolaError('invalid_input', 'listing_ids must contain 2–5 ids.', 400);
  }
  const allHex = ids.every((x) => typeof x === 'string' && /^[0-9a-f]{12}$/.test(x));
  if (!allHex) {
    throw new BruixolaError('invalid_listing_id', 'All ids must be 12 hex chars.', 400);
  }

  const { data, error } = await supabase
    .from('listings')
    .select(
      'id, url, city_slug, address, price_eur, m2, beds, baths, lift, condition_label, in_zona_tensionada, gross_yield_pct_p25, gross_yield_pct_p50, gross_yield_pct_p75, gross_yield_pct_legal_max, walk_to_metro_min, walk_to_hospital_min, distance_to_beach_m, hut_license_id',
    )
    .in('id', ids as string[])
    .is('removed_at', null);

  if (error) throw new BruixolaError('internal_error', error.message, 500);
  return c.json({ items: data ?? [] });
});

// ─────────────────────────────────────────────────────────────
// POST /tools/neighborhood — deterministic neighborhood/city brief
// Body: { city: "slug", neighborhood?: "name" }
// ─────────────────────────────────────────────────────────────
toolsRoutes.post('/tools/neighborhood', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const citySlug = typeof body.city === 'string' ? body.city : '';
  if (!citySlug) throw new BruixolaError('invalid_city', 'city is required.', 400);

  const { data: city, error: cErr } = await supabase
    .from('cities')
    .select('*')
    .eq('slug', citySlug)
    .maybeSingle();
  if (cErr) throw new BruixolaError('internal_error', cErr.message, 500);
  if (!city) {
    // Try to suggest similar cities
    const { data: similar } = await supabase
      .from('cities')
      .select('slug, name')
      .ilike('name', `%${citySlug.replace(/-/g, '%')}%`)
      .limit(5);
    throw new BruixolaError(
      'invalid_city',
      `Unknown city '${citySlug}'.`,
      404,
      { suggestions: (similar ?? []).map((s) => s.slug) },
    );
  }

  // Aggregate listing stats for this city
  const { data: stats } = await supabase
    .from('listings')
    .select('price_eur, m2, gross_yield_pct_p50, condition_label, in_zona_tensionada')
    .eq('city_slug', citySlug)
    .is('removed_at', null);

  const items = stats ?? [];
  const n = items.length;
  const sortedPrice = items
    .map((r) => r.price_eur)
    .filter((x): x is number => typeof x === 'number')
    .sort((a, b) => a - b);
  const sortedYield = items
    .map((r) => r.gross_yield_pct_p50)
    .filter((x): x is number => typeof x === 'number' && !Number.isNaN(x))
    .sort((a, b) => a - b);
  const median = (xs: number[]) => (xs.length ? xs[Math.floor(xs.length / 2)] : null);

  return c.json({
    city: {
      slug: city.slug,
      name: city.name,
      comarca_slug: city.comarca_slug,
      population: city.population,
      in_zona_tensionada: city.in_zona_tensionada,
      has_hospital: city.has_hospital,
      has_university: city.has_university,
      transit_score: city.transit_score,
      hut_moratorium_status: city.hut_moratorium_status,
    },
    market: {
      avg_sale_eur_m2: city.avg_sale_eur_m2,
      avg_rent_eur_m2_mo: city.avg_rent_eur_m2_mo,
      rent_index_ceiling_eur_m2_mo: city.rent_index_eur_m2_mo,
    },
    listings: {
      count: n,
      median_price_eur: median(sortedPrice),
      median_yield_p50_pct: median(sortedYield),
    },
  });
});

// ─────────────────────────────────────────────────────────────
// POST /tools/agency-for — verified agencies in a city
// ─────────────────────────────────────────────────────────────
toolsRoutes.post('/tools/agency-for', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const citySlug = typeof body.city === 'string' ? body.city : '';
  const limit = Math.min(Math.max(Number.parseInt(String(body.limit ?? 5), 10) || 5, 1), 10);
  if (!citySlug) throw new BruixolaError('invalid_city', 'city is required.', 400);

  let query = supabase.from('agencies').select('*').eq('city_slug', citySlug);
  if (typeof body.specialty === 'string') {
    query = query.contains('specialty', [body.specialty]);
  }
  query = query.order('verified_at', { ascending: false }).limit(limit);

  const { data, error } = await query;
  if (error) throw new BruixolaError('internal_error', error.message, 500);
  return c.json({
    items: data ?? [],
    note:
      (data ?? []).length === 0
        ? `No agencies known in '${citySlug}'. Manual curation pending.`
        : undefined,
  });
});
