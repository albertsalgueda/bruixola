// apps/api/src/routes/tools.test.ts
//
// Integration tests for the /tools/* RPC surface (OpenClaw consumer).
// Same skip-if-unreachable contract as listings.test.ts.

import { test, expect, beforeAll, describe } from 'bun:test';

const API = process.env.API_BASE ?? 'http://localhost:3001';
const TOKEN = process.env.BRUIXOLA_API_TOKEN ?? '';

let apiReady = false;

async function authedPost(path: string, body: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

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
    console.warn(`[tools.test] API unreachable at ${API}; skipping suite.`);
  }
});

describe('POST /tools/search', () => {
  test('empty body → top items by yield_p50 desc', async () => {
    if (!apiReady || !TOKEN) return;
    const res = await authedPost('/tools/search', {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ gross_yield_pct_p50: number | null }>;
    };
    expect(Array.isArray(body.items)).toBe(true);
    // Verify descending yield order (skipping nulls — they're sorted last).
    const yields = body.items
      .map((i) => i.gross_yield_pct_p50)
      .filter((x): x is number => typeof x === 'number');
    for (let i = 1; i < yields.length; i++) {
      expect(yields[i - 1]!).toBeGreaterThanOrEqual(yields[i]!);
    }
  });

  test('city=reus → all items have city_slug==="reus" (or no matches)', async () => {
    if (!apiReady || !TOKEN) return;
    const res = await authedPost('/tools/search', { city: 'reus' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ city_slug: string }> };
    for (const item of body.items) {
      expect(item.city_slug).toBe('reus');
    }
  });

  test('hut_license_required=true → all items have hut_license_id non-null', async () => {
    if (!apiReady || !TOKEN) return;
    const res = await authedPost('/tools/search', { hut_license_required: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ hut_license_id: string | null }> };
    for (const item of body.items) {
      expect(item.hut_license_id).not.toBeNull();
    }
  });

  test('no matches → 200 with note about widening filter', async () => {
    if (!apiReady || !TOKEN) return;
    // Use a filter combination that guarantees zero rows.
    const res = await authedPost('/tools/search', {
      city: 'no-such-city-slug-zzzz',
      max_price_eur: 1,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: unknown[];
      total: number;
      note?: string;
    };
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
    expect(typeof body.note).toBe('string');
    expect(body.note).toMatch(/widen|filter/i);
  });
});

describe('POST /tools/yield-for', () => {
  test('valid id → listing/yield_range/legal/formula_version/note', async () => {
    if (!apiReady || !TOKEN) return;
    const idxRes = await authedGet('/listings?limit=1');
    if (!idxRes.ok) return;
    const idx = (await idxRes.json()) as { items: Array<{ id: string }> };
    if (!idx.items.length) return;
    const id = idx.items[0]!.id;

    const res = await authedPost('/tools/yield-for', { listing_id: id });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('listing');
    expect(body).toHaveProperty('yield_range');
    expect(body).toHaveProperty('legal');
    expect(body).toHaveProperty('formula_version');
    expect(body).toHaveProperty('note');
  });

  test('invalid id format → 400 invalid_listing_id', async () => {
    if (!apiReady || !TOKEN) return;
    const res = await authedPost('/tools/yield-for', { listing_id: 'not-hex' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('invalid_listing_id');
  });
});

describe('POST /tools/compare', () => {
  test('1 id → 400 invalid_input', async () => {
    if (!apiReady || !TOKEN) return;
    const res = await authedPost('/tools/compare', {
      listing_ids: ['000000000000'],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('invalid_input');
  });

  test('2 valid ids → items array', async () => {
    if (!apiReady || !TOKEN) return;
    const idxRes = await authedGet('/listings?limit=2');
    if (!idxRes.ok) return;
    const idx = (await idxRes.json()) as { items: Array<{ id: string }> };
    if (idx.items.length < 2) return;
    const ids = idx.items.slice(0, 2).map((i) => i.id);

    const res = await authedPost('/tools/compare', { listing_ids: ids });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(1);
  });
});

describe('POST /tools/neighborhood', () => {
  test('no city → 400 invalid_city', async () => {
    if (!apiReady || !TOKEN) return;
    const res = await authedPost('/tools/neighborhood', {});
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('invalid_city');
  });

  test('bogus city → 404 invalid_city + suggestions array', async () => {
    if (!apiReady || !TOKEN) return;
    const res = await authedPost('/tools/neighborhood', { city: 'xyzzy-not-a-city' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as {
      error?: { code?: string; suggestions?: unknown };
    };
    expect(body.error?.code).toBe('invalid_city');
    expect(Array.isArray(body.error?.suggestions)).toBe(true);
  });
});

describe('POST /tools/agency-for', () => {
  test('city=reus → items array', async () => {
    if (!apiReady || !TOKEN) return;
    const res = await authedPost('/tools/agency-for', { city: 'reus' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; note?: string };
    expect(Array.isArray(body.items)).toBe(true);
  });
});
