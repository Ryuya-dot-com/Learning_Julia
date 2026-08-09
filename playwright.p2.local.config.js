import { defineConfig } from "@playwright/test";

const uiURL = "http://127.0.0.1:43922/Learning_Julia/validation/p2-likelihood/ui-preview.html";
const apiHealthURL = "http://127.0.0.1:43923/Learning_Julia/api/research/p2/health";

export default defineConfig({
  testDir: "./e2e-research",
  testMatch: "p2-local-api.spec.js",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? "line" : "line",
  expect: { timeout: 30_000 },
  timeout: 120_000,
  use: {
    baseURL: uiURL,
    browserName: "chromium",
    headless: true,
    locale: "ja-JP",
    viewport: { width: 900, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "julia --startup-file=no --project=validation/p2-likelihood scripts/run-p2-selection-count-local-server.jl --port=43923 --allowed-origin=http://127.0.0.1:43922",
      url: apiHealthURL,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "env P2_LOCAL_API_TARGET=http://127.0.0.1:43923 vite --host 127.0.0.1 --port 43922 --strictPort",
      url: uiURL,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
