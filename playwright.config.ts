import { defineConfig } from '@playwright/test';

const existingServer = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: existingServer || 'http://127.0.0.1:3017', headless: true },
  webServer: existingServer ? undefined : {
    command: 'npm run dev -- --port 3017',
    url: 'http://127.0.0.1:3017',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
