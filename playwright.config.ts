import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
  },
  webServer: {
    command: 'node scripts/dev-server.mjs',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  },
});
