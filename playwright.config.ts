import { defineConfig, devices } from "@playwright/test";

// End-to-end user flows for Beats. Starts its own Vite server on port 5299.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5299",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "pnpm exec vite --port 5299 --strictPort",
    url: "http://localhost:5299/beats.html",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
