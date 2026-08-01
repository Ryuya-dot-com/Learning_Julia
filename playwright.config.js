import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:43921/Learning_Julia/";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  // 公開ゲートでflakyな再試行成功を見逃さない。locatorの自動待機だけを使う。
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : "line",
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
    command: "vite preview --outDir .e2e-dist --host 127.0.0.1 --port 43921 --strictPort",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
