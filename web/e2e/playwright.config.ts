import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const ROOT = __dirname;
const AUTH_FILE = path.join(ROOT, ".auth", "customer.json");

export default defineConfig({
  testDir: path.join(ROOT, "specs"),
  globalSetup: path.join(ROOT, "global-setup.ts"),
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: path.join(ROOT, "artifacts", "html-report") }],
    ["json", { outputFile: path.join(ROOT, "artifacts", "playwright-results.json") }],
  ],
  outputDir: path.join(ROOT, "artifacts", "test-output"),
  use: {
    baseURL: process.env.UX_BASE_URL ?? "https://cardscanner9000.com",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "desktop",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH_FILE,
      },
      testIgnore: /auth\.setup\.ts/,
    },
    {
      name: "mobile",
      dependencies: ["setup"],
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium",
        storageState: AUTH_FILE,
      },
      testMatch: /responsive\.spec\.ts/,
    },
  ],
});
