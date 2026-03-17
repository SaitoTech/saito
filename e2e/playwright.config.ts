import { defineConfig } from "@playwright/test";
import path from "path";

export default defineConfig({
  testDir: "./tests",
  // Tests must be run sequentially — each test set spawns real node processes
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  // No browser — all tests are pure HTTP/API
  use: {
    trace: "on-first-retry",
  },
  // Warn if the Rust binary is missing before the suite starts
  globalSetup: path.resolve(__dirname, "./tests/global-setup.ts"),
  timeout: 120_000,
});
