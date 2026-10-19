import { defineConfig, devices } from '@playwright/test'

const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVERS === '1'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  testIgnore: 'github-pages.e2e.ts',
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  outputDir: 'test-results/artifacts',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: '.\\.venv\\Scripts\\python.exe -m uvicorn podcast_rag.api:app --host 127.0.0.1 --port 8000',
      cwd: '../rag',
      env: { ...process.env, PODCAST_LLM_PROVIDER: 'mock', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' },
      url: 'http://127.0.0.1:8000/api/health',
      timeout: 120_000,
      reuseExistingServer,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173',
      timeout: 120_000,
      reuseExistingServer,
    },
  ],
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
  ],
})
