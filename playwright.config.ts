import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: 'list',
  projects: [
    { name: 'chrome', use: { headless: true } },
    {
      name: 'chrome-headed',
      use: { headless: false },
      grep: /Pin opens|Immersive/,
    },
  ],
});
