import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PAGES_PORT) || 4175;

export default defineConfig({
  testDir: "./tests",
  testMatch: "pages.spec.js",
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}/RainFlix/`,
    reducedMotion: "reduce",
    // Keep production asset/routing checks deterministic; worker fetches bypass page mocks.
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/preview-pages.mjs",
    url: `http://127.0.0.1:${port}/RainFlix/`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
