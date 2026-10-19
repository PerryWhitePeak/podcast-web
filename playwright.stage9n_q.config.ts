import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e', testMatch: 'stage9n_q.e2e.ts', timeout: 60_000,
  expect: { timeout: 10_000 }, workers: 1, retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/stage9n-q-results.json' }]],
  outputDir: 'test-results/stage9n-q-artifacts',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5173', url: 'http://127.0.0.1:5173', timeout: 120_000 },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
  ],
})
