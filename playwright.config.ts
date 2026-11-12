import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a local Supabase stack (`npx supabase start`) and
 * the production build served by `vite preview`.
 */
// BASE_PATH=/Jubilate/ runs the suite against the GitHub Pages layout.
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:4173${base}`,
    locale: 'it-IT',
    trace: 'off',
  },
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: `http://localhost:4173${base}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
