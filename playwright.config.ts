import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 30000, workers: 1, fullyParallel: false,
  reporter: [['list'], ['json', { outputFile: 'artifacts/browser/results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4319', viewport: { width: 1440, height: 1000 },
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node server/index.ts', url: 'http://127.0.0.1:4319/api/status',
    env: { PORT: '4319', HENGJU_DATA_DIR: 'data/e2e', MODEL_API_KEY: '', MODEL_NAME: '', MODEL_BASE_URL: '' },
    reuseExistingServer: false, timeout: 20000,
  },
});
