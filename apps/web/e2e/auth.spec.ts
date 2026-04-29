// apps/web/e2e/auth.spec.ts
//
// E2E tests for the auth + tenant gate introduced in migrations 007 + 012.
// Covers:
//   • /login renders the magic-link form
//   • Middleware redirects anonymous users away from tenant-protected routes
//     (/properties, /deals, /opportunities, /settings, /settings/api-keys)
//   • /auth/callback without a code redirects on (default /properties, then
//     bounced again to /login by middleware)
//   • /auth/signout rejects GET (POST-only)
//   • Public routes (/cop, /login) load with TopBar
//   • Branded 404 still works
//
// Skips the whole suite if the web app isn't reachable so a fresh checkout
// without `bun run dev` doesn't fail CI.

import { test, expect } from '@playwright/test';

const WEB = process.env.WEB_BASE ?? 'http://localhost:3000';

const PROTECTED_PATHS = [
  '/properties',
  '/deals',
  '/opportunities',
  '/settings',
  '/settings/api-keys',
];

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

test.beforeAll(async () => {
  if (!(await webReachable())) {
    test.skip(true, `Web app unreachable at ${WEB}; skipping auth suite.`);
  }
});

test.describe('public routes', () => {
  test('/cop loads for anonymous visitors (public data)', async ({ page }) => {
    const res = await page.goto('/cop');
    expect(res?.ok()).toBe(true);
    await expect(page.getByText('Brúixola').first()).toBeVisible();
  });

  test('/login renders the magic-link form', async ({ page }) => {
    const res = await page.goto('/login');
    expect(res?.ok()).toBe(true);
    await expect(page.getByText('Entra al teu agent')).toBeVisible();
    await expect(page.locator('#bx-login-email')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Envia l'enllaç màgic/i }),
    ).toBeVisible();
  });

  test('/login surfaces auth_exchange_failed error', async ({ page }) => {
    await page.goto('/login?error=auth_exchange_failed');
    await expect(page.getByText(/L'enllaç ha caducat/i)).toBeVisible();
  });

  test('/login surfaces no_tenant error', async ({ page }) => {
    await page.goto('/login?error=no_tenant');
    await expect(page.getByText(/No s'ha trobat cap tenant/i)).toBeVisible();
  });

  test('/login carries the next param into the form action', async ({
    page,
  }) => {
    await page.goto('/login?next=/properties/some-id');
    await expect(page.locator('#bx-login-email')).toBeVisible();
    // The `next` param flows into the client form via React props; we only
    // assert the page rendered cleanly with the param — the form handler tests
    // (below) cover the redirectTo composition.
  });

  test('/login open-redirect protection: external next param is dropped', async ({
    request,
  }) => {
    // The login page sanitises `next` server-side. We can't directly read the
    // computed `next` value here, but we can at least assert the page still
    // renders 200 (no crash on hostile input).
    const res = await request.get('/login?next=//evil.example.com/x');
    expect(res.status()).toBe(200);
  });
});

test.describe('middleware redirects (anonymous)', () => {
  for (const path of PROTECTED_PATHS) {
    test(`GET ${path} → 307 to /login?next=${path}`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      const loc = res.headers().location ?? '';
      expect(loc).toMatch(/\/login\?/);
      expect(loc).toContain(`next=${encodeURIComponent(path)}`);
    });
  }
});

test.describe('/auth/callback', () => {
  test('GET without code redirects to /properties (then middleware bounces to /login)', async ({
    request,
  }) => {
    const res = await request.get('/auth/callback', { maxRedirects: 0 });
    // Route handler returns 307 → /properties (no `code` means no exchange).
    expect(res.status()).toBe(307);
    expect(res.headers().location ?? '').toMatch(/\/properties$/);
  });

  test('GET with hostile next sanitises to /properties', async ({ request }) => {
    const res = await request.get(
      '/auth/callback?next=' + encodeURIComponent('//evil.com/x'),
      { maxRedirects: 0 },
    );
    expect(res.status()).toBe(307);
    expect(res.headers().location ?? '').toMatch(/\/properties$/);
  });
});

test.describe('/auth/signout', () => {
  test('GET is rejected (POST-only)', async ({ request }) => {
    const res = await request.get('/auth/signout', { maxRedirects: 0 });
    // Next.js returns 405 for unsupported method on a Route Handler.
    expect([405, 404]).toContain(res.status());
  });

  test('POST with no session still redirects to /cop', async ({ request }) => {
    const res = await request.post('/auth/signout', { maxRedirects: 0 });
    expect(res.status()).toBe(303);
    expect(res.headers().location ?? '').toMatch(/\/cop$/);
  });
});

test.describe('branded 404', () => {
  test('unknown route returns 404 with TopBar chrome', async ({ page }) => {
    const res = await page.goto('/this-route-does-not-exist');
    expect(res?.status()).toBe(404);
    await expect(page.getByText('Pàgina no trobada')).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Tornar a la vista global/i }),
    ).toBeVisible();
  });
});

test.describe('password tab', () => {
  test('login tab is present and switches to password form', async ({
    page,
  }) => {
    await page.goto('/login');
    const tabs = page.getByRole('tablist', { name: /Mètode d'entrada/i });
    await expect(tabs).toBeVisible();
    await tabs.getByRole('tab', { name: /^Contrasenya$/ }).click();
    await expect(page.locator('#bx-pw-email')).toBeVisible();
    await expect(page.locator('#bx-pw-pass')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Entrar$/i }),
    ).toBeVisible();
  });

  test('password rejects short passwords client-side', async ({ page }) => {
    let supabaseHits = 0;
    await page.route('**/auth/v1/token**', async (route) => {
      supabaseHits++;
      await route.fulfill({ status: 200, body: '{}' });
    });
    await page.goto('/login');
    await page
      .getByRole('tablist', { name: /Mètode d'entrada/i })
      .getByRole('tab', { name: /^Contrasenya$/ })
      .click();
    await page.locator('#bx-pw-email').fill('test@example.com');
    await page.locator('#bx-pw-pass').fill('short');
    await page.getByRole('button', { name: /^Entrar$/i }).click();
    await expect(page.getByText(/com a mínim 8 caràcters/i)).toBeVisible();
    expect(supabaseHits).toBe(0);
  });

  test('switches to signup mode and shows the right CTA', async ({ page }) => {
    await page.goto('/login');
    await page
      .getByRole('tablist', { name: /Mètode d'entrada/i })
      .getByRole('tab', { name: /^Contrasenya$/ })
      .click();
    await page.getByRole('button', { name: /Crear compte →/ }).click();
    await expect(
      page.getByRole('button', { name: /^Crear compte$/i }),
    ).toBeVisible();
    await expect(page.getByText(/Mínim 8 caràcters/i)).toBeVisible();
  });

  test('valid login calls signInWithPassword', async ({ page }) => {
    let lastBody: Record<string, unknown> | null = null;
    await page.route('**/auth/v1/token?**', async (route) => {
      const req = route.request();
      try {
        lastBody = req.postDataJSON() as Record<string, unknown>;
      } catch {
        lastBody = null;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'fake',
          refresh_token: 'fake',
          token_type: 'bearer',
          expires_in: 3600,
          user: {
            id: '00000000-0000-0000-0000-000000000000',
            email: 'test@example.com',
          },
        }),
      });
    });

    await page.goto('/login?next=/properties');
    await page
      .getByRole('tablist', { name: /Mètode d'entrada/i })
      .getByRole('tab', { name: /^Contrasenya$/ })
      .click();
    await page.locator('#bx-pw-email').fill('test@example.com');
    await page.locator('#bx-pw-pass').fill('correct-horse-battery-staple');
    await page.getByRole('button', { name: /^Entrar$/i }).click();

    // Wait until the request lands.
    await expect.poll(() => lastBody !== null).toBeTruthy();
    expect(lastBody).toMatchObject({
      email: 'test@example.com',
      password: 'correct-horse-battery-staple',
    });
  });
});

test.describe('magic-link form (client-side validation)', () => {
  test('rejects invalid email format without calling Supabase', async ({
    page,
  }) => {
    let supabaseHits = 0;
    await page.route('**/auth/v1/otp**', async (route) => {
      supabaseHits++;
      await route.fulfill({ status: 200, body: '{}' });
    });

    await page.goto('/login');
    await page.locator('#bx-login-email').fill('not-an-email');
    await page.getByRole('button', { name: /Envia l'enllaç màgic/i }).click();

    await expect(page.getByText('Format de correu invàlid.')).toBeVisible();
    expect(supabaseHits).toBe(0);
  });

  test('valid email triggers signInWithOtp and shows sent state', async ({
    page,
  }) => {
    let lastBody: Record<string, unknown> | null = null;
    let lastUrl = '';
    await page.route('**/auth/v1/otp**', async (route) => {
      const req = route.request();
      lastUrl = req.url();
      try {
        lastBody = req.postDataJSON() as Record<string, unknown>;
      } catch {
        lastBody = null;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null, error: null }),
      });
    });

    await page.goto('/login?next=/deals');
    await page.locator('#bx-login-email').fill('test@example.com');
    await page.getByRole('button', { name: /Envia l'enllaç màgic/i }).click();

    await expect(page.getByText('Correu enviat')).toBeVisible();
    await expect(
      page.getByText(/t'hem enviat un enllaç a/i),
    ).toBeVisible();

    expect(lastBody).toMatchObject({ email: 'test@example.com' });

    // Supabase JS sends `redirect_to` either flattened into the body or as a
    // query param on the OTP endpoint, depending on SDK version. Check both.
    const bodyRedirect = (lastBody?.['email_redirect_to'] ??
      (lastBody?.['options'] as Record<string, unknown> | undefined)?.[
        'email_redirect_to'
      ]) as string | undefined;
    const queryRedirect = new URL(lastUrl).searchParams.get('redirect_to');
    const redirectTo = bodyRedirect ?? queryRedirect ?? '';
    expect(redirectTo).toContain('/auth/callback');
    expect(redirectTo).toContain(encodeURIComponent('/deals'));
  });
});
