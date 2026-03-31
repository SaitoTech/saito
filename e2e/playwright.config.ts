import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://127.0.0.1:12101",
    trace: "on-first-retry",
    headless: true,
  },
  webServer: {
    command: "npm run start",
    cwd: "../node",
    url: "http://127.0.0.1:12101",
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});