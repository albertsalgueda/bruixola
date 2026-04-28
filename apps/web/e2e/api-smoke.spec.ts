// apps/web/e2e/api-smoke.spec.ts
//
// Standalone Playwright smoke test that hits apps/api directly via
// `request.fetch`. Validates the auth wall + tool endpoints from a
// browser-equivalent context. Skips if the API is not reachable on :3001.

import { test, expect } from '@playwright/test';

const API = process.env.API_BASE ?? 'http://localhost:3001';
const TOKEN = process.env.BRUIXOLA_API_TOKEN ?? '';

async function apiReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

test.beforeAll(async () => {
  if (!(await apiReachable())) {
    test.skip(true, `API unreachable at ${API}; skipping smoke suite.`);
  }
});

test.describe('API smoke (from Playwright context)', () => {
  test('GET /health is public and ok', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe('bruixola-api');
  });

  test('GET /listings without auth → 401 auth_required', async ({ request }) => {
    const res = await request.get(`${API}/listings`);
    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('auth_required');
  });

  test('GET /listings with auth → 200 with items', async ({ request }) => {
    if (!TOKEN) test.skip(true, 'BRUIXOLA_API_TOKEN missing.');
    const res = await request.get(`${API}/listings?limit=3`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('POST /tools/search without auth → 401', async ({ request }) => {
    const res = await request.post(`${API}/tools/search`, {
      data: {},
    });
    expect(res.status()).toBe(401);
  });

  test('POST /tools/search with auth → 200', async ({ request }) => {
    if (!TOKEN) test.skip(true, 'BRUIXOLA_API_TOKEN missing.');
    const res = await request.post(`${API}/tools/search`, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      data: { limit: 3 },
    });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('POST /tools/yield-for with bad id → 400 invalid_listing_id', async ({ request }) => {
    if (!TOKEN) test.skip(true, 'BRUIXOLA_API_TOKEN missing.');
    const res = await request.post(`${API}/tools/yield-for`, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      data: { listing_id: 'not-hex' },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('invalid_listing_id');
  });
});
