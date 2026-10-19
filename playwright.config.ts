import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Bound concurrent scenarios sharing one local Miniflare/D1 instance.
  // The 100-request contention inside individual scenarios remains unchanged.
  workers: 2,
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
