import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 0 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:12101",
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // {
    //   name: "firefox",
    //   use: { ...devices["Desktop Firefox"] },
    // },
    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] },
    // },
    // {
    //   name: "consensus",
    //   use: {
    //     // used for consensus testing and server only tests
    //   },
    // },
  ],
  timeout: 30000,
  // Uncomment and adjust if you need to start a server as part of your tes
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:12101', // Adjust to match your server
  //   reuseExistingServer: !process.env.CI
  // },
});
