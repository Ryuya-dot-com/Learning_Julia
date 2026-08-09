import { expect, test } from "@playwright/test";

const APP_ORIGIN = "http://127.0.0.1:43921";
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
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === APP_ORIGIN && response.status() >= 400) {
      failures.push(`http ${response.status()}: ${response.url()}`);
    }
  });
});

test.afterEach(async ({ page }) => {
  expect(failuresByPage.get(page), "ブラウザ実行時エラーや失敗した通信がない").toEqual([]);
});

test("ホームから教材を遅延読込し、解答と進捗反映まで操作できる", async ({ page }) => {
  const lessonChunks = [];
  page.on("response", (response) => {
    if (/\/assets\/l01-intro-[^/]+\.js$/.test(new URL(response.url()).pathname)) {
      lessonChunks.push(response.url());
    }
  });

  await page.goto("./");
  await expect(page).toHaveTitle(/はじめてのJulia/);
  await expect(page.getByRole("heading", { level: 1, name: "はじめてのJulia" })).toBeVisible();
  await expect(page.getByText(/番号付き全37レッスン＋補講9本/)).toBeVisible();

  await page.getByRole("button", { name: "レッスン1をはじめる" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Juliaへようこそ" })).toBeVisible();
  expect(lessonChunks, "選択した教材だけのproduction chunkを取得する").toHaveLength(1);

  await page.getByRole("button", { name: "次へ →" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "はじめてのコード" })).toBeVisible();
  await page.getByRole("button", { name: "次へ →" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "対話しながら実行する" })).toBeVisible();
  await page.getByRole("button", { name: "次へ →" }).click();

  await expect(page.getByText("練習問題 1 / 3")).toBeVisible();
  await page.getByRole("button", { name: /println/ }).click();
  await expect(page.getByRole("status")).toContainText("println");

  await page.getByRole("button", { name: "← レッスン一覧" }).click();
  await expect(page.getByText(/1 \/ \d+ 問/)).toBeVisible();
});

test("意図的なMethodErrorは教材として表示し、実行時エラーにはしない", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: /データの型/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "データには「種類」がある" })).toBeVisible();

  await page.getByRole("button", { name: "次へ →" }).click();
  await page.getByRole("button", { name: "次へ →" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "型を知るとエラーに強くなる" })).toBeVisible();
  await expect(page.getByText(/ERROR: MethodError: no method matching/)).toBeVisible();
  await expect(page.getByText(/String型 と Int64型/)).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("ロードマップとNotebook配布リンクがPagesのbase pathで到達できる", async ({ page }) => {
  await page.goto("./");

  const notebook = page.getByRole("link", { name: "演習ノート ↓" }).first();
  await expect(notebook).toHaveAttribute("href", "/Learning_Julia/notebooks/nb1-data.jl");
  const notebookHref = await notebook.getAttribute("href");
  const notebookResponse = await page.request.get(new URL(notebookHref, page.url()).href);
  expect(notebookResponse.ok()).toBe(true);
  expect(await notebookResponse.text()).toContain("### A Pluto.jl notebook ###");

  await page.getByRole("link", { name: "この先の学習ロードマップを見る" }).click();
  await expect(page).toHaveURL(/\/Learning_Julia\/roadmap\.html$/);
  await expect(page.getByRole("heading", { level: 1, name: "学習ロードマップ" })).toBeVisible();
  const nextExpansion = page.locator("#next-expansion");
  await expect(nextExpansion.getByText("拡充スプリント・P0〜P1完了")).toBeVisible();
  await expect(nextExpansion.locator('[data-roadmap-status="published"]')).toHaveCount(4);
  await expect(nextExpansion.locator('[data-roadmap-status="planned"]')).toHaveCount(0);
  await expect(nextExpansion.getByRole("heading", { name: "共通の公開ゲート" })).toBeVisible();
  const strategy = page.locator("#strategic-horizons");
  await expect(strategy.getByText("長期運用ロードマップ・判断規準")).toBeVisible();
  for (const horizon of ["now", "next", "later", "hold"]) {
    await expect(strategy.locator(`[data-strategy-horizon="${horizon}"]`)).toHaveCount(1);
  }
  await expect(strategy.locator('[data-strategy-status="research"]')).toHaveCount(1);
  await expect(strategy.getByRole("heading", { name: "観測過程を尤度へ入れる検証トラック(研究中・参加者previewのみ公開)" })).toBeVisible();
  await expect(strategy.getByText("P2_LIKELIHOOD_STRESS_CHECK_PASS", { exact: true })).toBeVisible();
  await expect(strategy.getByText("P2_IDENTIFICATION_PROFILE_CHECK_PASS", { exact: true })).toBeVisible();
  await expect(strategy.getByText("P2_SELECTION_COUNT_UI_PREVIEW_PASS", { exact: true })).toBeVisible();
  await expect(strategy.getByText("P2_SELECTION_COUNT_REPORT_IO_CHECK_PASS", { exact: true })).toBeVisible();
  await expect(strategy.getByText("P2_SELECTION_COUNT_API_BOUNDARY_CHECK_PASS", { exact: true })).toBeVisible();
  await expect(strategy.getByRole("heading", { name: "候補を公開教材へ昇格させる5つの問い" })).toBeVisible();
  await page.getByRole("link", { name: "← アプリにもどる" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "はじめてのJulia" })).toBeVisible();
});

test("再現可能project補講から実行可能Tarをdownloadできる", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: /再現可能な研究プロジェクト/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "再現性は、同じ数字が出たことだけではない" })).toBeVisible();

  for (let i = 0; i < 13; i += 1) {
    await page.getByRole("button", { name: "次へ →" }).click();
  }
  await expect(page.getByRole("heading", { level: 2, name: "実行可能templateを展開し、clean runする" })).toBeVisible();

  const download = page.getByRole("link", { name: /研究project templateをdownload/ });
  await expect(download).toHaveAttribute(
    "href",
    "/Learning_Julia/templates/reproducible-study-template.tar"
  );
  const href = await download.getAttribute("href");
  const response = await page.request.get(new URL(href, page.url()).href);
  expect(response.ok()).toBe(true);
  const archive = await response.body();
  expect(archive.length).toBeGreaterThan(10_000);
  expect(archive.toString("utf8")).toContain("reproducible-study/README.md");
});

test("Git補講を遅延読込し、公開境界つきTarへ到達できる", async ({ page }) => {
  const lessonChunks = [];
  page.on("response", (response) => {
    if (/\/assets\/x03-git-research-history-[^/]+\.js$/.test(new URL(response.url()).pathname)) {
      lessonChunks.push(response.url());
    }
  });

  await page.goto("./");
  await page.getByRole("button", { name: /Gitで研究履歴と公開境界を管理する/ }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Gitは監査可能な履歴であり、privacy装置ではない" })
  ).toBeVisible();
  expect(lessonChunks, "Git補講だけのproduction chunkを取得する").toHaveLength(1);

  for (let i = 0; i < 13; i += 1) {
    await page.getByRole("button", { name: "次へ →" }).click();
  }
  await expect(
    page.getByRole("heading", { level: 2, name: "配布templateで、公開前の停止条件を練習する" })
  ).toBeVisible();
  const download = page.getByRole("link", { name: /公開境界つき研究project templateをdownload/ });
  await expect(download).toHaveAttribute(
    "href",
    "/Learning_Julia/templates/reproducible-study-template.tar"
  );
});

test("追加補講6本をそれぞれ遅延読込できる", async ({ page }) => {
  const loaded = new Set();
  page.on("response", (response) => {
    const match = new URL(response.url()).pathname.match(
      /\/assets\/(x0[4-9]-(?:reading-errors|text-processing|distribution-catalog|batch-csv-io|distribution-fit-diagnostics|observation-boundaries-dependence))-[^/]+\.js$/
    );
    if (match) loaded.add(match[1]);
  });

  const cases = [
    ["エラーメッセージの読み方", "エラーは、止まった理由を返す観測データ"],
    ["文字列処理", "文字列を整える前に、意味と原文を分ける"],
    ["分布のカタログ", "分布名の暗記ではなく、候補を絞る地図を作る"],
    ["複数CSVと分析成果物の入出力", "一括読込は、ファイルを多く開くことではない"],
    ["分布の推定と予測診断", "fitは結論ではなく、反証できる予測を作る入口"],
    ["観測境界・依存・混合分布", "見えなかった値と、境界に記録された値は違う"],
  ];

  await page.goto("./");
  for (const [lesson, heading] of cases) {
    await page.getByRole("button", { name: lesson }).click();
    await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
    await page.getByRole("button", { name: "← レッスン一覧" }).click();
  }

  expect(loaded).toEqual(
    new Set([
      "x04-reading-errors",
      "x05-text-processing",
      "x06-distribution-catalog",
      "x07-batch-csv-io",
      "x08-distribution-fit-diagnostics",
      "x09-observation-boundaries-dependence",
    ])
  );
});

test("モバイル幅でもホームと教材を往復できる", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await expect(page.getByRole("navigation", { name: "レッスンの目次" })).toBeHidden();
  await page.getByRole("button", { name: "レッスン1をはじめる" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Juliaへようこそ" })).toBeVisible();
  await page.getByRole("button", { name: "← レッスン一覧" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "はじめてのJulia" })).toBeVisible();
});

test("参加者向けP2研究previewを非掲載・合成データ限定で配布できる", async ({ page }) => {
  const requestedOrigins = new Set();
  page.on("request", (request) => requestedOrigins.add(new URL(request.url()).origin));

  await page.goto("./validation/p2-likelihood/ui-preview.html");
  await expect(page).toHaveTitle(/P2研究UI preview/);
  await expect(
    page.getByRole("heading", { level: 1, name: "選ばれた値と人数を一緒に読む" })
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  await expect(page.getByRole("note", { name: "参加者向けデータ利用案内" })).toContainText(
    "外部への送信、保存、analytics、session replayは行いません"
  );
  await expect(page.getByText("公開教材未登録", { exact: true })).toBeVisible();
  await expect(page.getByText("実計算API未配備", { exact: true })).toBeVisible();

  for (const [name, expected] of [
    ["JSON fixture", "learning-julia.p2.selection-count-report"],
    ["CSV fixture", "report_id,report_status"],
  ]) {
    const href = await page.getByRole("link", { name }).getAttribute("href");
    const response = await page.request.get(new URL(href, page.url()).href);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain(expected);
  }

  await page.getByRole("button", { name: "合成requestで接続境界を確認" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "合成fixtureへ明示的に切り替え" })
  ).toContainText("api_not_configured");
  expect([...requestedOrigins], "previewが外部originへ通信しない").toEqual([APP_ORIGIN]);

  await page.goto("./");
  await expect(page.locator('a[href*="validation/p2-likelihood"]')).toHaveCount(0);
});
