import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './.stage6f_runtime',
  testMatch: '**/*.e2e.ts',
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: '../rag/.runtime/stage6f_playwright_results.json' }]],
  outputDir: '../rag/.runtime/stage6f_playwright_artifacts',
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: '.\\.venv\\Scripts\\python.exe -m uvicorn podcast_rag.api:app --host 127.0.0.1 --port 8001', cwd: '../rag', env: { ...process.env, PODCAST_LLM_PROVIDER: 'mock' }, url: 'http://127.0.0.1:8001/api/health', timeout: 120_000, reuseExistingServer: false },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort', env: { ...process.env, VITE_API_PROXY_TARGET: 'http://127.0.0.1:8001' }, url: 'http://127.0.0.1:5174', timeout: 120_000, reuseExistingServer: false },
  ],
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
  ],
})
