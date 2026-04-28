// apps/web/playwright.config.ts
//
// Playwright config for Brúixola web E2E tests.
// We assume the dev server is already running on :3000 (no auto-start) so
// the test suite stays fast and developers can iterate against their own
// running stack. CI scripts must boot `bun run dev` separately before
// invoking `bun run test:e2e`.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.WEB_BASE ?? 'http://localhost:3000',
    locale: 'ca-ES',
    viewport: { width: 1600, height: 980 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
