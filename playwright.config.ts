import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://127.0.0.1:4173/gc/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'allow',
  },
  webServer: {
    env: { __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: 'pocket.test' },
    command:
      'VITE_BASE_PATH=/gc/ npm run build && VITE_BASE_PATH=/gc/ npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/gc/',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
