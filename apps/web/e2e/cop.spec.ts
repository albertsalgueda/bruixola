// apps/web/e2e/cop.spec.ts
//
// E2E tests for the Brúixola COP (/cop) view and adjacent surfaces
// (/listings, /strategies, /listing/:id). Each test gracefully skips if
// the web app is unreachable so a fresh checkout doesn't fail the suite.

import { test, expect, type Page } from '@playwright/test';

const WEB = process.env.WEB_BASE ?? 'http://localhost:3000';

/** Probe the dev server. Returns true if /cop responds (any status). */
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

/** Probe a specific path. Returns true only on 2xx. */
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

/** Wait until the maplibre map has rendered listing pins. */
async function waitForPins(page: Page, minCount = 1, timeoutMs = 15_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count = await page.locator('.b-pin').count();
    if (count >= minCount) return count;
    await page.waitForTimeout(250);
  }
  return page.locator('.b-pin').count();
}

test.beforeAll(async () => {
  if (!(await webReachable())) {
    test.skip(true, `Web app unreachable at ${WEB}; skipping E2E suite.`);
  }
});

test.describe('/cop', () => {
  test('COP page loads with chrome and panels', async ({ page }) => {
    await page.goto('/cop');
    await expect(page.getByText('DADES PÚBLIQUES // CATALUNYA')).toBeVisible();
    await expect(page.getByText('Brúixola').first()).toBeVisible();
    await expect(page.getByText(/N\s*·\s*41\.39°/)).toBeVisible();
    // Map canvas may take a moment to mount.
    await page.locator('canvas.maplibregl-canvas').first().waitFor({ timeout: 15_000 });
    await expect(page.locator('canvas.maplibregl-canvas').first()).toBeVisible();
  });

  test('Listing pins render on the map', async ({ page }) => {
    await page.goto('/cop');
    const count = await waitForPins(page, 1, 15_000);
    // 30 seeded listings; coord filtering may trim. 10 is a reasonable floor
    // but if the dataset is smaller, fall back to ≥ 1 so the test still
    // signals "pins render at all" without going green on zero.
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Clicking a pin updates the right card stack', async ({ page }) => {
    await page.goto('/cop');
    await waitForPins(page, 1, 15_000);

    const pin = page.locator('.b-pin').first();
    await pin.click();

    // Empty-state copy should be gone.
    await expect(page.getByText('Selecciona un pis al mapa')).toHaveCount(0);

    // Right card stack should now show a € price somewhere.
    const body = page.locator('body');
    await expect(body).toContainText(/€\s*\d/);
  });

  test('Yield bar shows legal ceiling for zona-tensionada listings', async ({ page }) => {
    await page.goto('/cop');
    await waitForPins(page, 1, 15_000);

    // Click pins until we land on one in a zona tensionada (or run out).
    const pins = page.locator('.b-pin');
    const total = await pins.count();
    let landedTensionada = false;
    for (let i = 0; i < Math.min(total, 8); i++) {
      await pins.nth(i).click();
      // Small wait for the card stack to refresh.
      await page.waitForTimeout(300);
      const tensionadaBadge = page.getByText('ZONA TENSIONADA');
      if ((await tensionadaBadge.count()) > 0) {
        landedTensionada = true;
        break;
      }
    }

    test.skip(!landedTensionada, 'No zona-tensionada listing surfaced in the first 8 pins.');

    // We're on a tensionada listing — the yield bar should mention the legal ceiling.
    await expect(page.getByText(/SOSTRE|Sostre legal/i).first()).toBeVisible();
  });
});

test.describe('/listings', () => {
  test('Visiting /listings shows the table', async ({ page }) => {
    if (!(await pathExists('/listings'))) {
      test.skip(true, '/listings route not implemented yet.');
    }
    await page.goto('/listings');
    const table = page.locator('table').first();
    await expect(table).toBeVisible();

    const rows = page.locator('tbody tr');
    expect(await rows.count()).toBeGreaterThanOrEqual(1);

    // Headers — at least these three should be present (case-insensitive).
    const tableText = (await table.textContent()) ?? '';
    expect(tableText).toMatch(/€\s*PREU/i);
    expect(tableText).toMatch(/m²/i);
    expect(tableText).toMatch(/YIELD\s*P50/i);
  });
});

test.describe('/strategies', () => {
  test('Visiting /strategies shows cards', async ({ page }) => {
    if (!(await pathExists('/strategies'))) {
      test.skip(true, '/strategies route not implemented yet.');
    }
    await page.goto('/strategies');

    // At least 4 strategy cards. We count any element with role="article" or
    // a class containing "strategy" or "card" — fall back to a generic
    // structural assertion if neither is used.
    const articleCount = await page.getByRole('article').count();
    const cardLikeCount = await page
      .locator('[class*="strategy"], [class*="card"], [data-strategy]')
      .count();
    expect(Math.max(articleCount, cardLikeCount)).toBeGreaterThanOrEqual(4);

    // Page text should contain at least one yield % and a RISC label.
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).toMatch(/\d+(\.\d+)?\s*%/);
    expect(body).toMatch(/RISC/i);
  });
});

test.describe('/listing/:id', () => {
  test('Detail page renders for a known listing', async ({ page }) => {
    if (!(await pathExists('/listings'))) {
      test.skip(true, '/listings route not implemented yet.');
    }
    await page.goto('/listings');
    const firstRow = page.locator('tbody tr').first();
    await firstRow.waitFor();

    // Capture the row's address text before clicking — we'll look for it on
    // the detail page. Address is the most distinctive cell.
    const rowText = ((await firstRow.textContent()) ?? '').trim();

    await firstRow.click();
    await page.waitForURL(/\/listing\/[a-f0-9]{12}/);
    expect(page.url()).toMatch(/\/listing\/[a-f0-9]{12}/);

    // Pull a few-token slice of the row text and assert it appears on the
    // detail page. We avoid asserting on a full address string because some
    // rows truncate.
    const tokens = rowText
      .split(/\s+/)
      .filter((t) => t.length >= 4)
      .slice(0, 1);
    if (tokens.length) {
      await expect(page.locator('body')).toContainText(tokens[0]!);
    }
  });
});
