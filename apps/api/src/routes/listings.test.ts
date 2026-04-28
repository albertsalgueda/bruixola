// apps/api/src/routes/listings.test.ts
//
// Integration tests against a running Brúixola API on :3001 backed by the
// seeded Supabase DB. The suite skips itself (without failing) if the API
// is not reachable, so `bun test` is safe to run on a fresh checkout.
//
// Run: from apps/api, `bun --env-file=../../.env test`.

import { test, expect, beforeAll, describe } from 'bun:test';

const API = process.env.API_BASE ?? 'http://localhost:3001';
const TOKEN = process.env.BRUIXOLA_API_TOKEN ?? '';

let apiReady = false;

async function authedGet(path: string): Promise<Response> {
  return fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
}

beforeAll(async () => {
  try {
    const res = await fetch(`${API}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    apiReady = res.ok;
  } catch {
    apiReady = false;
  }
  if (!apiReady) {
    // eslint-disable-next-line no-console
    console.warn(`[listings.test] API unreachable at ${API}; skipping suite.`);
  }
  if (!TOKEN) {
    // eslint-disable-next-line no-console
    console.warn('[listings.test] BRUIXOLA_API_TOKEN missing; auth-protected tests will skip.');
  }
});

describe('GET /listings', () => {
  test('without auth → 401 auth_required', async () => {
    if (!apiReady) return;
    const res = await fetch(`${API}/listings`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('auth_required');
  });

  test('with auth → 200 with items + cursor + total + has_more', async () => {
    if (!apiReady || !TOKEN) return;
    const res = await authedGet('/listings?limit=5');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('cursor');
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('has_more');
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('city filter — only that city in items', async () => {
    if (!apiReady || !TOKEN) return;
    // Pick a city that almost certainly has listings: probe via /cities first.
    const citiesRes = await authedGet('/cities');
    if (!citiesRes.ok) return;
    const cities = (await citiesRes.json()) as { items: Array<{ slug: string }> };
    if (!cities.items.length) return;

    // Try each city until we find one with listings.
    for (const city of cities.items) {
      const res = await authedGet(`/listings?city=${encodeURIComponent(city.slug)}&limit=10`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: Array<{ city_slug: string }> };
      if (body.items.length === 0) continue;
      for (const item of body.items) {
        expect(item.city_slug).toBe(city.slug);
      }
      return;
    }
  });

  test('max_price_eur=200000 → all items ≤ 200000', async () => {
    if (!apiReady || !TOKEN) return;
    const res = await authedGet('/listings?max_price_eur=200000&limit=50');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ price_eur: number | null }> };
    for (const item of body.items) {
      if (item.price_eur === null) continue;
      expect(item.price_eur).toBeLessThanOrEqual(200000);
    }
  });

  test('min_yield_p50=6 → all items ≥ 6 (nulls filtered out by Supabase gte)', async () => {
    if (!apiReady || !TOKEN) return;
    const res = await authedGet('/listings?min_yield_p50=6&limit=50');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ gross_yield_pct_p50: number | null }>;
    };
    for (const item of body.items) {
      // Supabase .gte excludes nulls; defensive check anyway.
      if (item.gross_yield_pct_p50 === null) continue;
      expect(item.gross_yield_pct_p50).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('GET /listings/:id', () => {
  test('valid 12-hex returns the listing', async () => {
    if (!apiReady || !TOKEN) return;
    // Pull one real id off the listing index.
    const idxRes = await authedGet('/listings?limit=1');
    if (!idxRes.ok) return;
    const idx = (await idxRes.json()) as { items: Array<{ id: string }> };
    if (!idx.items.length) return;
    const id = idx.items[0]!.id;

    const res = await authedGet(`/listings/${id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(id);
  });

  test('bad format → 400 invalid_listing_id', async () => {
    if (!apiReady || !TOKEN) return;
    const res = await authedGet('/listings/not-a-hex');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('invalid_listing_id');
  });

  test('non-existent 12-hex → 404 not_found', async () => {
    if (!apiReady || !TOKEN) return;
    const res = await authedGet('/listings/000000000000');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('not_found');
  });
});

describe('GET /cities', () => {
  test('returns at least 1 city', async () => {
    if (!apiReady || !TOKEN) return;
    const res = await authedGet('/cities');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ slug: string; name: string }> };
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items[0]).toHaveProperty('slug');
    expect(body.items[0]).toHaveProperty('name');
  });
});

describe('GET /strategies', () => {
  test('returns at least 1 strategy with avg_yield_pct_p50 numeric (or null)', async () => {
    if (!apiReady || !TOKEN) return;
    const res = await authedGet('/strategies');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    // The route orders by avg_yield_pct_p50 desc nullsLast — first item should
    // either be a number or undefined/null. We assert the field exists.
    const first = body.items[0]!;
    expect(first).toHaveProperty('avg_yield_pct_p50');
    if (first.avg_yield_pct_p50 !== null && first.avg_yield_pct_p50 !== undefined) {
      expect(typeof first.avg_yield_pct_p50).toBe('number');
    }
  });
});
