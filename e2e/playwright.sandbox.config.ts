import { defineConfig, devices } from "@playwright/test";

/**
 * Browser sandbox iframe tests are self-contained (page.setContent + injected
 * sandbox-browser.js). They do not need the Saito node webServer.
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/sandbox-iframe.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
