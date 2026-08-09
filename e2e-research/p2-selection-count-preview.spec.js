import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const API_RESPONSE_FIXTURE = JSON.parse(readFileSync(
  new URL("../validation/p2-likelihood/fixtures/selection-count-api-v1-response.json", import.meta.url),
  "utf8"
));
const API_PATH = "/Learning_Julia/api/research/p2/selection-count-report";
const RESPONSE_MEDIA_TYPE = "application/vnd.learning-julia.p2.selection-count-api-response+json";

const failuresByPage = new WeakMap();

test.beforeEach(async ({ page }) => {
  const failures = [];
  failuresByPage.set(page, failures);
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    failures.push(`requestfailed: ${request.url()} (${request.failure()?.errorText || "unknown"})`);
  });
});

test.afterEach(async ({ page }) => {
  expect(failuresByPage.get(page), "研究previewにbrowser errorがない").toEqual([]);
});

test("観測契約・fit比較・未解決区間・誤答別feedbackを操作できる", async ({ page }) => {
  await page.goto("");
  await expect(page).toHaveTitle(/P2研究UI preview/);
  await expect(page.getByRole("heading", { level: 1, name: "選ばれた値と人数を一緒に読む" })).toBeVisible();
  await expect(page.getByText("RESEARCH ONLY", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "解析入口を通過" })).toBeVisible();
  await expect(page.getByRole("table", { name: /固定seed合成例/ })).toContainText("-344,332.488");

  await page.getByRole("button", { name: "欠測を混同" }).click();
  const auditAlert = page.getByRole("alert").filter({ hasText: "missingness_confusion" });
  await expect(auditAlert).toBeVisible();
  await expect(auditAlert).toContainText("除外理由を分離");
  await expect(page.getByText(/このpreviewは任意入力でfitを実行しません/)).toBeVisible();

  await page.getByRole("button", { name: "未測定を分離" }).click();
  await expect(page.getByRole("status").filter({ hasText: "未測定100人" })).toBeVisible();
  await expect(page.getByRole("table", { name: /固定seed合成例/ })).toBeVisible();

  await page.getByRole("button", { name: "profile未解決" }).click();
  const profileAlert = page.getByRole("alert").filter({ hasText: "区間なし: profile未解決" });
  await expect(profileAlert).toBeVisible();
  await expect(profileAlert).toContainText("自動fallbackとして採用しません");

  await page.getByRole("button", { name: "bootstrap未解決" }).click();
  await expect(page.getByText("schema v1.0.0", { exact: false })).toBeVisible();
  await expect(page.getByText("bootstrap再生成N=10", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "JSON fixture" })).toHaveAttribute(
    "href", /selection-count-report-v1\.json/
  );
  await expect(page.getByRole("link", { name: "CSV fixture" })).toHaveAttribute(
    "href", /selection-count-report-v1\.csv/
  );

  await expect(page.getByText("実計算API未配備", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "合成requestで接続境界を確認" }).click();
  const fallbackStatus = page.getByRole("status").filter({ hasText: "合成fixtureへ明示的に切り替え" });
  await expect(fallbackStatus).toBeVisible();
  await expect(fallbackStatus).toContainText("api_not_configured");

  const denominatorQuestion = page.locator("article").filter({ hasText: "500人を募集" });
  await denominatorQuestion.getByRole("button", { name: "500", exact: true }).click();
  await expect(denominatorQuestion.getByRole("status")).toContainText("missingness_confusion");
  await expect(denominatorQuestion.getByRole("status")).toContainText("N=400");
});

test("same-origin API応答の版・request ID・SHAを照合してserver結果と表示する", async ({ page }) => {
  await page.addInitScript((path) => {
    window.__P2_RESEARCH_API_ENDPOINT__ = path;
  }, API_PATH);
  await page.route(`**${API_PATH}`, async (route) => {
    const request = route.request();
    expect(request.method()).toBe("POST");
    expect(request.headers()["x-learning-julia-api-version"]).toBe("1.0.0");
    expect(request.headers()["x-learning-julia-report-version"]).toBe("1.0.0");
    expect(request.headers().authorization).toBeUndefined();
    expect(request.postDataJSON().request_id).toBe("teaching-example-v1");
    await route.fulfill({
      status: 200,
      contentType: `${RESPONSE_MEDIA_TYPE}; version=1.0.0`,
      headers: {
        "X-Learning-Julia-API-Version": "1.0.0",
        "X-Learning-Julia-Report-Version": "1.0.0",
        "X-Request-ID": "teaching-example-v1",
      },
      body: JSON.stringify(API_RESPONSE_FIXTURE),
    });
  });

  await page.goto("");
  await expect(page.getByText("same-origin API候補あり", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "合成requestで接続境界を確認" }).click();
  const serverStatus = page.getByRole("status").filter({ hasText: "server responseを照合" });
  await expect(serverStatus).toBeVisible();
  await expect(serverStatus).toContainText("teaching-example-v1");
  await expect(serverStatus).toContainText("review_profile_and_bootstrap");
});

test("明示label・fieldsetとモバイル幅で入力監査を維持する", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("");
  const totalScreened = page.getByRole("spinbutton", { name: "screening総数 N" });
  await expect(totalScreened).toBeVisible();
  await totalScreened.fill("401");
  await page.getByRole("button", { name: "観測契約を監査" }).click();
  await expect(page.getByRole("alert")).toContainText("screening_count_mismatch");
  await expect(page.getByRole("group", { name: "観測規則" })).toBeVisible();
  await expect(page.getByText("参加者向けpreview", { exact: true })).toBeVisible();
  await expect(page.getByText("公開教材未登録", { exact: true })).toBeVisible();
});
