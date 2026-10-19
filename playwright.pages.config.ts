import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'github-pages.e2e.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: 'test-results/github-pages-artifacts',
  use: { baseURL: 'http://127.0.0.1:4173/podcast-web/', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm run build -- --mode pages-test && node scripts/serve-pages.mjs',
    url: 'http://127.0.0.1:4173/podcast-web/',
    timeout: 120_000,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
  ],
})
