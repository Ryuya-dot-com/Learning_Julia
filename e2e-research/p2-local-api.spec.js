import { expect, test } from "@playwright/test";

const API_PATH = "/Learning_Julia/api/research/p2/selection-count-report";
const SESSION_PATH = "/Learning_Julia/api/research/p2/session";
const HEALTH_PATH = "/Learning_Julia/api/research/p2/health";

test("browser→same-origin proxy→Julia server→期限付きJulia workerを往復する", async ({ page }) => {
  const failures = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    failures.push(`requestfailed: ${request.url()} (${request.failure()?.errorText || "unknown"})`);
  });
  await page.addInitScript(({ apiPath, sessionPath }) => {
    window.__P2_RESEARCH_API_CONFIG__ = {
      endpoint: apiPath,
      localSessionEndpoint: sessionPath,
    };
  }, { apiPath: API_PATH, sessionPath: SESSION_PATH });

  await page.goto("");
  const health = await page.request.get(HEALTH_PATH);
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({
    scope: "loopback_synthetic_fixture_only",
    endpoint_status: "local_research_only",
  });

  await expect(page.getByText("same-origin API候補あり", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "合成requestで接続境界を確認" }).click();
  const serverStatus = page.getByRole("status").filter({ hasText: "server responseを照合" });
  await expect(serverStatus).toBeVisible();
  await expect(serverStatus).toContainText("teaching-example-v1");
  await expect(serverStatus).toContainText("review_profile_and_bootstrap");
  await expect(serverStatus).not.toContainText("fixtureへ明示的に切り替え");

  // Session ID is HttpOnly; only the non-secret CSRF token was available to
  // the JavaScript client during the request.
  expect(await page.evaluate(() => document.cookie)).not.toContain("p2_session");
  expect(failures).toEqual([]);
});
