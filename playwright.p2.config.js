import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:43922/Learning_Julia/validation/p2-likelihood/ui-preview.html";

export default defineConfig({
  testDir: "./e2e-research",
  testMatch: "p2-selection-count-preview.spec.js",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? "line" : "line",
  expect: { timeout: 5_000 },
  use: {
    baseURL,
    browserName: "chromium",
    headless: true,
    locale: "ja-JP",
    viewport: { width: 900, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "vite --host 127.0.0.1 --port 43922 --strictPort",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
