// apps/web/e2e/cop.spec.ts
//
// E2E tests for the public Brúixola COP (`/cop`) view after the
// multi-tenant pivot:
//  - Map is now a choropleth (comarca polygons) + city dot circles drawn on
//    a Mapbox GL canvas. There is no longer a DOM-marker `.b-pin` per pin.
//  - The right "card stack" was replaced by the Dossier (left) +
//    MarketPanel (right) triptych.
//  - `/listings` is still mounted as a public diagnostic table; rows may
//    be 0 after the fake-data wipe, so we only assert chrome.
//  - `/strategies` is unchanged.
//
// Tests skip cleanly if the dev server isn't reachable.

import { test, expect } from '@playwright/test';

const WEB = process.env.WEB_BASE ?? 'http://localhost:3000';

async function webReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${WEB}/cop`, {
      signal: AbortSignal.timeout(2_000),
    });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    const res = await fetch(`${WEB}${path}`, {
      signal: AbortSignal.timeout(2_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

test.beforeAll(async () => {
  if (!(await webReachable())) {
    test.skip(true, `Web app unreachable at ${WEB}; skipping E2E suite.`);
  }
});

test.describe('/cop', () => {
  test('COP page loads with TopBar chrome', async ({ page }) => {
    await page.goto('/cop');
    // Brand and tabs are part of the TopBar.
    await expect(page.getByText('BRÚIXOLA').first()).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Vista global/i }).first(),
    ).toBeVisible();
  });

  test('COP renders the three-column triptych (dossier · map · market)', async ({
    page,
  }) => {
    await page.goto('/cop');
    await expect(page.locator('aside[aria-label="Dossier de la situació"]'))
      .toBeVisible();
    await expect(page.locator('section[aria-label="Mapa de Catalunya"]'))
      .toBeVisible();
    await expect(
      page.locator('aside[aria-label="Detall del territori seleccionat"]'),
    ).toBeVisible();
  });

  test('Map canvas mounts on /cop', async ({ page }) => {
    await page.goto('/cop');
    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ timeout: 15_000 });
    await expect(canvas).toBeVisible();
  });

  test('Anonymous TopBar shows ENTRAR (logged-out state)', async ({ page }) => {
    await page.goto('/cop');
    await expect(
      page.getByRole('link', { name: /^Entrar$/i }).first(),
    ).toBeVisible();
  });
});

test.describe('/listings (public diagnostic table)', () => {
  test('Visiting /listings renders the page chrome', async ({ page }) => {
    if (!(await pathExists('/listings'))) {
      test.skip(true, '/listings route not implemented.');
    }
    const res = await page.goto('/listings');
    expect(res?.ok()).toBe(true);
    // Brand chrome is enough — the table may have 0 rows after the fake-
    // data wipe (multi-tenant pivot truncated the seed data set).
    await expect(page.getByText('BRÚIXOLA').first()).toBeVisible();
  });
});

test.describe('/strategies', () => {
  test('Strategies cards render with yield + RISC labels', async ({ page }) => {
    if (!(await pathExists('/strategies'))) {
      test.skip(true, '/strategies route not implemented yet.');
    }
    await page.goto('/strategies');
    const articleCount = await page.getByRole('article').count();
    const cardLikeCount = await page
      .locator('[class*="strategy"], [class*="card"], [data-strategy]')
      .count();
    expect(Math.max(articleCount, cardLikeCount)).toBeGreaterThanOrEqual(4);

    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).toMatch(/\d+(\.\d+)?\s*%/);
    expect(body).toMatch(/RISC/i);
  });
});
