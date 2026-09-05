import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests against the built static export.
 *
 * One browser, one worker: the suite is a handful of smoke checks that the
 * page a stranger opens actually opens, reads a recipe book, and fails
 * politely. Everything finer-grained is a unit test.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:8740',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node apps/web/scripts/e2e-serve.mjs 8740',
    url: 'http://localhost:8740',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
