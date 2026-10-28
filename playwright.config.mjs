import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    channel: 'msedge',
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'edge' }],
  webServer: {
    command: 'npm run build && node scripts/serve.mjs',
    url: 'http://127.0.0.1:4174',
    env: { PORT: '4174' },
    reuseExistingServer: false
  }
});
