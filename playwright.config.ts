import { defineConfig, devices } from '@playwright/test'

import { WEB_PORT, webPort, WORKERS } from './e2e/ports'

/**
 * End-to-end tests against a real MkDocsEditor backend. `e2e/global-setup.ts` builds the backend
 * and starts one per worker with a throwaway wiki; see the README for the environment variables.
 *
 * Every worker loads this file again with its own `TEST_PARALLEL_INDEX`, so `baseURL` is the app
 * port of that worker, whose `config.json` points to the backend of that worker.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: WORKERS,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'phone',
      use: { ...devices['Pixel 7'] },
      // Sync does not depend on the screen, and these specs are the slowest. The web client is meant
      // for desktops; phones have the Android app. `editing.spec.ts` keeps a smoke test here.
      testIgnore: [
        '**/accountcopies.spec.ts',
        '**/collab.spec.ts',
        '**/epoch.spec.ts',
        '**/reconnect.spec.ts',
        '**/redirects.spec.ts',
      ],
    },
  ],
  webServer: {
    command: 'node e2e/web-server.ts',
    // the server opens the ports in order, so the last one means that all are up
    url: `http://localhost:${webPort(WORKERS - 1)}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
