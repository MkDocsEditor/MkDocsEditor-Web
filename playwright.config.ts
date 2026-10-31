import { defineConfig, devices } from '@playwright/test'

import { BACKEND_PORT, WEB_PORT } from './e2e/ports'

/**
 * End-to-end tests against a real MkDocsEditor backend. `e2e/global-setup.ts` builds and starts
 * the backend with a throwaway wiki; see the README for the environment variables.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
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
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx vite --port ${WEB_PORT} --strictPort`,
    url: `http://localhost:${WEB_PORT}`,
    reuseExistingServer: !process.env.CI,
    env: { VITE_BACKEND_URL: `http://127.0.0.1:${BACKEND_PORT}` },
    timeout: 120_000,
  },
})
