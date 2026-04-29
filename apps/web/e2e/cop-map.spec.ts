// apps/web/e2e/cop-map.spec.ts
//
// E2E tests for the consolidated /cop map: Zones/Anuncis mode toggle, the
// listing miniature drawer, deep-link via ?map=anuncis, and the legacy
// /listings?view=map redirect.

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

async function waitForMapCanvas(page: import('@playwright/test').Page) {
  await page
    .locator('canvas.maplibregl-canvas, canvas.mapboxgl-canvas')
    .first()
    .waitFor({ timeout: 15_000 });
}

test.beforeAll(async () => {
  if (!(await webReachable())) {
    test.skip(true, `Web app unreachable at ${WEB}; skipping COP map suite.`);
  }
});

test.describe('/cop — Zones / Anuncis mode toggle', () => {
  test('Mode toggle is present with both options', async ({ page }) => {
    await page.goto('/cop');
    const toggle = page.locator('[aria-label="Mode del mapa"]');
    await expect(toggle).toBeVisible();
    await expect(
      toggle.getByRole('tab', { name: /^Zones$/ }),
    ).toBeVisible();
    await expect(
      toggle.getByRole('tab', { name: /^Anuncis$/ }),
    ).toBeVisible();
  });

  test('Default mode is Zones (no ?map= param)', async ({ page }) => {
    await page.goto('/cop');
    const toggle = page.locator('[aria-label="Mode del mapa"]');
    await expect(
      toggle.getByRole('tab', { name: /^Zones$/, selected: true }),
    ).toBeVisible();
  });

  test('?map=anuncis deep-link selects the Anuncis mode', async ({ page }) => {
    await page.goto('/cop?map=anuncis');
    const toggle = page.locator('[aria-label="Mode del mapa"]');
    await expect(
      toggle.getByRole('tab', { name: /^Anuncis$/, selected: true }),
    ).toBeVisible();
  });

  test('Clicking Anuncis switches mode and updates URL', async ({ page }) => {
    await page.goto('/cop');
    await page
      .locator('[aria-label="Mode del mapa"]')
      .getByRole('tab', { name: /^Anuncis$/ })
      .click();
    await expect(
      page
        .locator('[aria-label="Mode del mapa"]')
        .getByRole('tab', { name: /^Anuncis$/, selected: true }),
    ).toBeVisible();
    // history.replaceState updates the URL without navigating.
    await expect.poll(() => page.url()).toMatch(/[?&]map=(anuncis|listings)/);
  });

  test('Map canvas mounts in both modes', async ({ page }) => {
    await page.goto('/cop');
    await waitForMapCanvas(page);
    await page.goto('/cop?map=anuncis');
    await waitForMapCanvas(page);
  });
});

test.describe('/cop — Anuncis drawer', () => {
  test('Empty drawer shows "Selecciona una comarca o un municipi" in Zones mode', async ({
    page,
  }) => {
    await page.goto('/cop');
    await expect(
      page.getByText(/Selecciona una comarca o un municipi/i),
    ).toBeVisible();
  });
});

test.describe('legacy redirects', () => {
  test('/listings?view=map → /cop?map=anuncis', async ({ request }) => {
    const res = await request.get('/listings?view=map', {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(307);
    expect(res.headers().location ?? '').toMatch(/\/cop\?map=anuncis$/);
  });
});

test.describe('/cop — mobile triptych', () => {
  test.use({ viewport: { width: 375, height: 720 } });

  test('Mobile bottom tab bar is visible', async ({ page }) => {
    await page.goto('/cop');
    const bar = page.getByRole('navigation', { name: /Panells/i });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('button', { name: /Mapa/i })).toBeVisible();
    await expect(bar.getByRole('button', { name: /Dossier/i })).toBeVisible();
    await expect(bar.getByRole('button', { name: /Detall/i })).toBeVisible();
  });

  test('Tapping Dossier swaps the visible panel', async ({ page }) => {
    await page.goto('/cop');
    await page
      .getByRole('navigation', { name: /Panells/i })
      .getByRole('button', { name: /Dossier/i })
      .click();
    // Dossier should now be visible (mobile renders one panel at a time).
    await expect(
      page.locator('aside[aria-label="Dossier de la situació"]'),
    ).toBeVisible();
  });
});

test.describe('TopBar — mobile drawer', () => {
  test.use({ viewport: { width: 375, height: 720 } });

  test('Hamburger toggles a drawer with the tab list', async ({ page }) => {
    await page.goto('/cop');
    const trigger = page.getByRole('button', { name: /Obre menú/i });
    await expect(trigger).toBeVisible();
    await trigger.click();

    // Drawer is the navigation labelled "Navegació mòbil".
    const drawer = page.getByRole('navigation', { name: /Navegació mòbil/i });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(/^Vista global$/i)).toBeVisible();
    await expect(drawer.getByText(/^Anuncis$/i)).toBeVisible();
  });

  test('Drawer closes on backdrop tap', async ({ page }) => {
    await page.goto('/cop');
    await page.getByRole('button', { name: /Obre menú/i }).click();
    await expect(
      page.getByRole('navigation', { name: /Navegació mòbil/i }),
    ).toBeVisible();
    // Click the dimmed backdrop that closes the drawer.
    await page
      .getByRole('button', { name: /Tanca menú/i })
      .last()
      .click();
    await expect(
      page.getByRole('navigation', { name: /Navegació mòbil/i }),
    ).toHaveCount(0);
  });
});
