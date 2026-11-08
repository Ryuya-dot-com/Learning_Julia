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

// focus()で飛ばさず、実際のTab順から操作できることを確認する。
async function tabTo(page, target, backwards = false) {
  for (let i = 0; i < 80; i += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(backwards ? "Shift+Tab" : "Tab");
  }
  await expect(target).toBeFocused();
}

test("キーボードで目次を飛ばし、教材・まとめ・ホームを移動できる", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "本文へ移動" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  const main = page.getByRole("main", { name: "本文" });
  await expect(main).toBeFocused();
  const notebookNames = await main.getByRole("link", { name: /演習ノート/ })
    .evaluateAll((links) => links.map((link) => link.getAttribute("aria-label")));
  expect(notebookNames).toHaveLength(8);
  expect(new Set(notebookNames).size).toBe(8);
  await tabTo(page, main.getByRole("button", { name: "レッスン1をはじめる" }));
  await page.keyboard.press("Enter");
  await expect(main.getByRole("heading", { name: "Juliaへようこそ" })).toBeFocused();
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Juliaってなに?");
  await expect(page).toHaveTitle("Juliaってなに? — はじめてのJulia");
  for (let i = 0; i < 6; i += 1) {
    await tabTo(page, main.getByRole("button", { name: /^(次へ →|まとめへ)$/ }));
    await page.keyboard.press("Enter");
    await expect(main.getByRole("heading", { level: 2 })).toBeFocused();
  }
  await expect(main.getByRole("heading", { name: "おつかれさまでした" })).toBeFocused();
  await tabTo(page, main.getByRole("button", { name: "練習問題 1 にもどる" }));
  await page.keyboard.press("Enter");
  await expect(main.getByRole("heading", { name: "練習問題 1 / 3" })).toBeFocused();
  await tabTo(page, main.getByRole("button", { name: "← レッスン一覧" }), true);
  await page.keyboard.press("Enter");
  await expect(main.getByRole("heading", { name: "はじめてのJulia", exact: true })).toBeFocused();
  await tabTo(page, main.getByRole("button", { name: "チートシート", exact: true }), true);
  await page.keyboard.press("Enter");
  await expect(main.getByRole("heading", { name: "Julia チートシート" })).toBeFocused();
  await expect(page).toHaveTitle("Julia チートシート — はじめてのJulia");
  await tabTo(page, main.getByRole("button", { name: "← もどる" }), true);
  await page.keyboard.press("Enter");
  await expect(main.getByRole("heading", { name: "はじめてのJulia", exact: true })).toBeFocused();
});

test("3形式の問題をキーボードで解き、ヒント・正解後にも操作位置を保つ", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: /探索の可視化/ }).click();
  for (let i = 0; i < 4; i += 1) await page.getByRole("button", { name: "次へ →" }).click();
  const status = page.getByRole("status");
  await tabTo(page, page.getByRole("button", { name: /折れ線グラフ/ }));
  await page.keyboard.press("Enter");
  await expect(status).toContainText("もう一度");
  await tabTo(page, page.getByRole("button", { name: "ヒントを見る" }));
  await page.keyboard.press("Enter");
  await expect(status).toBeFocused();
  await expect(status).toContainText("ヒント:");
  await tabTo(page, page.getByRole("button", { name: /ヒストグラム/ }), true);
  await page.keyboard.press("Enter");
  await expect(status).toBeFocused();
  await expect(page.getByText("クリア済み ✓")).toBeVisible();

  await tabTo(page, page.getByRole("button", { name: "次へ →" }));
  await page.keyboard.press("Enter");
  const answer = page.getByRole("textbox", { name: "関数名" });
  await expect(answer).toHaveAccessibleDescription(/条件ごとに反応時間/);
  await tabTo(page, answer);
  await page.keyboard.type("wrong");
  await page.keyboard.press("Enter");
  await expect(answer).toHaveAttribute("aria-invalid", "true");
  await expect(answer).toBeFocused();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("boxplot");
  await page.keyboard.press("Enter");
  await expect(answer).toBeDisabled();
  await expect(status).toBeFocused();
  await tabTo(page, page.getByRole("button", { name: "次へ →" }));
  await page.keyboard.press("Enter");

  for (let i = 1; i <= 3; i += 1) {
    const mark = page.getByRole("button", { name: `記述${i}を「${i === 3 ? "まちがい" : "正しい"}」にする` });
    await expect(mark).toHaveAccessibleDescription(/箱ひげ図|列名|軸ラベル/);
    await tabTo(page, mark);
    await page.keyboard.press("Space");
    await expect(mark).toHaveAttribute("aria-pressed", "true");
  }
  await tabTo(page, page.getByRole("button", { name: "答え合わせ" }));
  await page.keyboard.press("Enter");
  await expect(status).toContainText("全問正解");
  await expect(status).toBeFocused();
  // クリア済み問題への再訪時は、通知ではなく見出しから読める。
  await tabTo(page, page.getByRole("button", { name: "← 前へ" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "練習問題 2 / 3" })).toBeFocused();
});

for (const [width, fontPercent] of [[320, 100], [640, 200], [320, 200]]) {
  test(`本文・解答欄・早見表が収まり、コードをキーで横スクロールできる (${width}px・文字${fontPercent}%)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("./");
    await page.evaluate((percent) => { document.documentElement.style.fontSize = `${percent}%`; }, fontPercent);
    const fits = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await fits();
    await page.getByRole("button", { name: /探索の可視化/ }).click();
    await page.getByRole("button", { name: "次へ →" }).click();
    await fits();
    const code = page.getByRole("region", { name: "Juliaコード" });
    await tabTo(page, code);
    await expect(code).toBeFocused();
    await expect(code).toHaveCSS("outline-color", "rgb(255, 255, 255)");
    await expect(code).toHaveCSS("outline-style", "solid");
    await expect(code).toHaveCSS("outline-offset", "-3px");
    expect(await code.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    for (let i = 0; i < 4; i += 1) await page.getByRole("button", { name: "次へ →" }).click();
    await fits();
    const answer = page.getByRole("textbox", { name: "関数名" });
    const bounds = await answer.boundingBox();
    expect(bounds.width).toBeGreaterThan(60);
    await answer.fill("boxplot");
    await page.getByRole("button", { name: "答え合わせ" }).click();
    await expect(page.getByText("クリア済み ✓")).toBeVisible();
    await page.getByRole("button", { name: "次へ →" }).click();
    await fits();
    await page.getByRole("button", { name: "← レッスン一覧" }).click();
    await page.getByRole("button", { name: "チートシート", exact: true }).click();
    await fits();
  });
}

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
  await expect(page.getByText(/番号付き全37レッスン＋補講12本/)).toBeVisible();
  await expect(page.getByText(/R・Stan・Python連携5本/)).toBeVisible();

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

for (const width of [900, 390]) {
  test(`回帰診断の途中問題・復習・未解答への復帰を操作できる (${width}px)`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("./");
    await page.getByRole("button", { name: "回帰診断とVIF" }).click();
    for (let i = 0; i < 6; i += 1) await page.getByRole("button", { name: "次へ →" }).click();
    await expect(page.getByText("練習問題 1 / 6")).toBeVisible();

    const wrong = page.getByRole("button", { name: /VIFが高いと決めつけて説明変数を削除/ });
    await wrong.click();
    const review = page.locator("details");
    const summary = review.locator("summary");
    await expect(review).not.toHaveAttribute("open", "");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(review).toHaveAttribute("open", "");
    await expect(review.locator("pre").filter({ hasText: "hc3_vcov" })).toBeVisible();
    await expect(review.locator("pre").filter({ hasText: "0.534" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press("Enter");
    await expect(review).not.toHaveAttribute("open", "");
    await expect(wrong).toContainText("✕");
    await page.getByRole("button", { name: /分散モデルとHC3など分散不均一に頑健なSE/ }).click();
    await expect(page.getByText("クリア済み ✓")).toBeVisible();

    for (let i = 0; i < 3; i += 1) await page.getByRole("button", { name: "次へ →" }).click();
    await expect(page.getByText("練習問題 2 / 6")).toBeVisible();
    const answer = page.getByRole("textbox", { name: "R²を取り出す式" });
    await answer.fill("r2(a");
    await summary.click();
    await expect(review.locator("pre").filter({ hasText: "aux_x1" })).toBeVisible();
    await summary.click();
    await expect(answer).toHaveValue("r2(a");
    await answer.fill("r2(aux)");
    await answer.press("Enter");
    await expect(answer).toBeDisabled();

    for (let i = 0; i < 2; i += 1) await page.getByRole("button", { name: "次へ →" }).click();
    await expect(page.getByText("練習問題 3 / 6")).toBeVisible();
    const firstMark = page.getByRole("button", { name: "記述1を「まちがい」にする" });
    await firstMark.click();
    await page.getByRole("button", { name: "記述2を「正しい」にする" }).click();
    await summary.click();
    await summary.click();
    await expect(firstMark).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "記述2を「正しい」にする" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "記述3を「まちがい」にする" }).click();
    await page.getByRole("button", { name: "答え合わせ" }).click();
    await expect(page.getByText("クリア済み ✓")).toBeVisible();

    async function goToSummary() {
      const next = page.getByRole("button", { name: /^(次へ →|まとめへ)$/ });
      for (let i = 0; i < 30 && await next.count(); i += 1) await next.click();
      await expect(next).toHaveCount(0);
    }
    await goToSummary();
    await expect(page.getByText("未クリアの練習問題が 3 問あります。", { exact: false })).toBeVisible();
    for (const [number, question, correct] of [
      [4, "リッジ回帰の係数が一意に求まりました", "罰則に応じた係数は得られたが"],
      [5, "最後に独立したテスト標本で予測誤差を報告します", "各foldの訓練部分で平均・SDを求めて"],
      [6, "その変数だけでOLSを当て直しました", "変数選択を含む探索結果とし"],
    ]) {
      await page.getByRole("button", { name: `練習問題 ${number} にもどる` }).click();
      await expect(page.getByText(`練習問題 ${number} / 6`)).toBeVisible();
      await expect(page.getByText(question, { exact: false })).toBeVisible();
      await page.getByRole("button", { name: new RegExp(correct) }).click();
      await goToSummary();
    }
    await expect(page.getByText("練習問題 6 問、すべてクリアしました。", { exact: false })).toContainText("うち 5 問は一発クリア");
    await page.getByRole("button", { name: "レッスン一覧にもどる" }).click();
    await expect(page.getByText(/6 \/ \d+ 問/)).toBeVisible();
    await page.getByRole("button", { name: "回帰診断とVIF" }).click();
    for (let i = 0; i < 6; i += 1) await page.getByRole("button", { name: "次へ →" }).click();
    await expect(page.getByText("クリア済み ✓")).toBeVisible();
    await expect(page.getByRole("button", { name: /分散モデルとHC3など分散不均一に頑健なSE/ })).toBeDisabled();
  });
}

test("ロードマップとNotebook配布リンクがPagesのbase pathで到達できる", async ({ page }) => {
  await page.goto("./");

  await page.getByRole("button", { name: /R・Stanへ渡すデータの契約/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "連携の第一歩は、packageを入れることではない" })).toBeVisible();
  for (let i = 0; i < 11; i += 1) {
    await page.getByRole("button", { name: "次へ →" }).click();
  }
  await expect(page.getByRole("link", { name: "R・Stan bridge入り研究projectをdownload (.tar)" })).toHaveAttribute(
    "href",
    "/Learning_Julia/templates/reproducible-study-template.tar"
  );
  await page.getByRole("button", { name: "← レッスン一覧" }).click();

  const notebook = page.getByRole("link", { name: "演習ノート ↓" }).first();
  await expect(notebook).toHaveAttribute("href", "/Learning_Julia/notebooks/nb1-data.jl");
  const notebookHref = await notebook.getAttribute("href");
  const notebookResponse = await page.request.get(new URL(notebookHref, page.url()).href);
  expect(notebookResponse.ok()).toBe(true);
  const notebookText = await notebookResponse.text();
  expect(notebookText).toContain("### A Pluto.jl notebook ###");
  expect(notebookText).toContain("保存前後の値の一致");

  for (const [index, file, expectedTexts] of [
    [1, "nb2-stats.jl", ["finite_number_nb2", "same_plot_nb2", "このデータでは棒は4本になります"]],
    [2, "nb3-sim.jl", ["確認した刺激リストとの一致", "不正な値を描いた図は合格にしません"]],
    [3, "nb4-model.jl", ["欠測を「全員陰性」として数えることはしません", "valid_histogram_nb4"]],
  ]) {
    const link = page.getByRole("link", { name: "演習ノート ↓" }).nth(index);
    await expect(link).toHaveAttribute("href", `/Learning_Julia/notebooks/${file}`);
    const response = await page.request.get(new URL(await link.getAttribute("href"), page.url()).href);
    expect(response.ok()).toBe(true);
    const source = await response.text();
    for (const expectedText of expectedTexts) expect(source).toContain(expectedText);
  }

  const graduationNotebook = page.getByRole("link", { name: "演習ノート ↓" }).nth(4);
  await expect(graduationNotebook).toHaveAttribute("href", "/Learning_Julia/notebooks/nb5-advanced.jl");
  const graduationHref = await graduationNotebook.getAttribute("href");
  const graduationResponse = await page.request.get(new URL(graduationHref, page.url()).href);
  expect(graduationResponse.ok()).toBe(true);
  const graduationText = await graduationResponse.text();
  expect(graduationText).toContain("## 卒業制作: 研究計画書の採点基準");
  expect(graduationText).toContain("解析失敗と特異適合を別々に記録します");
  expect(graduationText).toContain("detection_rate_all");
  expect(graduationText).toContain("scripts/nb5-design-comparison.jl nb5-run-01");
  expect(graduationText).toContain("Notebook単体のダウンロードには");
  expect(graduationText).toContain("全8項目の通過率・修正済み相関を確認しました");
  expect(graduationText).toContain("範囲外の値や欠測は丸めて採点しません");

  const intermediateNotebook = page.getByRole("link", { name: "演習ノート ↓" }).nth(5);
  await expect(intermediateNotebook).toHaveAttribute("href", "/Learning_Julia/notebooks/nb7-intermediate.jl");
  const nb7Response = await page.request.get(new URL(await intermediateNotebook.getAttribute("href"), page.url()).href);
  expect(nb7Response.ok()).toBe(true);
  expect(await nb7Response.text()).toContain("NB7: 中級編（高速化・並列化・独自推定）の演習ノート");

  const advancedNotebook = page.getByRole("link", { name: "演習ノート ↓" }).nth(6);
  await expect(advancedNotebook).toHaveAttribute("href", "/Learning_Julia/notebooks/nb8-advanced-comp.jl");
  const nb8Response = await page.request.get(new URL(await advancedNotebook.getAttribute("href"), page.url()).href);
  expect(nb8Response.ok()).toBe(true);
  expect(await nb8Response.text()).toContain("NB8: 上級編（動的モデル・MCMC・計算統計）の演習ノート");

  const bridgeNotebook = page.getByRole("link", { name: "演習ノート ↓" }).nth(7);
  await expect(bridgeNotebook).toHaveAttribute("href", "/Learning_Julia/notebooks/nb6-r.jl");
  const bridgeHref = await bridgeNotebook.getAttribute("href");
  const bridgeResponse = await page.request.get(new URL(bridgeHref, page.url()).href);
  expect(bridgeResponse.ok()).toBe(true);
  const bridgeText = await bridgeResponse.text();
  expect(bridgeText).toContain("R・Stan連携の演習ノート");
  expect(bridgeText).toContain("64文字にするだけでは一致しません");

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

  for (let i = 0; i < 18; i += 1) {
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

  for (let i = 0; i < 19; i += 1) {
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

test("埋め込みSVG図版・チートシート絞り込み・URLハッシュ直リンクと履歴同期が動作する", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });

  // 1. ステップ指定のURLハッシュ直リンクで該当ページとSVG図版が描画される
  await page.goto("./#lesson/exploratory-visualization/2");
  await expect(page.getByRole("heading", { level: 2, name: "ヒストグラム: 分布のかたち" })).toBeVisible();
  const histImg = page.locator("figure img");
  await expect(histImg).toBeVisible();
  await expect(histImg).toHaveAttribute("src", /figures\/rt-hist\.svg$/);
  expect(await histImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  // 2. レッスン内の「次へ」は replaceState でハッシュを更新する
  await page.getByRole("button", { name: "次へ →" }).click();
  await expect(page).toHaveURL(/#lesson\/exploratory-visualization\/3$/);
  await page.getByRole("button", { name: "次へ →" }).click();
  await expect(page).toHaveURL(/#lesson\/exploratory-visualization\/4$/);
  const boxImg = page.locator("figure img");
  await expect(boxImg).toHaveAttribute("src", /figures\/rt-box\.svg$/);
  expect(await boxImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  // 3. チートシートへの遷移・カテゴリ絞り込み・ブラウザ戻るでの復帰
  await page.getByRole("button", { name: "← レッスン一覧" }).click();
  await expect(page).toHaveURL(/\/Learning_Julia\/$/);
  await page.getByRole("button", { name: "チートシート", exact: true }).click();
  await expect(page).toHaveURL(/#cheat$/);

  const filterGroup = page.getByRole("group", { name: "カテゴリ絞り込み" });
  await filterGroup.getByRole("button", { name: "可視化・統計・モデル" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "回帰・GLM・混合効果モデル" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "表示" })).toHaveCount(0);

  await filterGroup.getByRole("button", { name: "高速化・並列・独自推定" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "型安定性とメモリ割当(中級)" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "MCMC・HMCと収束診断(上級)" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "はじめてのJulia" })).toBeVisible();
  await expect(page.getByText(/中級編8本/)).toBeVisible();
  await expect(page.getByText(/上級編8本/)).toBeVisible();

  // 4. 中級編・上級編・順序多項・カイ二乗／MCA・機械学習／SciML・可視化／診断図へハッシュ直リンクし、埋め込みSVG図版を確認する
  await page.goto("./#lesson/custom-likelihood-optimization/5");
  await expect(
    page.getByRole("heading", { level: 2, name: "対称なWald区間と、非対称なプロファイル尤度区間" })
  ).toBeVisible();
  const profImg = page.locator("figure img");
  await expect(profImg).toHaveAttribute("src", /figures\/profile-vs-wald\.svg$/);
  expect(await profImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/mcmc-metropolis-hmc/3");
  await expect(
    page.getByRole("heading", { level: 2, name: "HMCとLeapfrog積分：対数事後密度の勾配に沿って遠くまで滑走する" })
  ).toBeVisible();
  const hmcImg = page.locator("figure img");
  await expect(hmcImg).toHaveAttribute("src", /figures\/rwmh-vs-hmc\.svg$/);
  expect(await hmcImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/categorical-outcomes/2");
  await expect(
    page.getByRole("heading", { level: 2, name: "二項、順序、多項を数式で見分ける" })
  ).toBeVisible();
  const ordImg = page.locator("figure img");
  await expect(ordImg).toHaveAttribute("src", /figures\/ordinal-vs-multinomial\.svg$/);
  expect(await ordImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/hierarchical-ordinal-choice/4");
  await expect(
    page.getByRole("heading", { level: 2, name: "多値離散選択のIIA仮定（赤バス・青バス問題）と混合ロジット" })
  ).toBeVisible();
  const iiaImg = page.locator("figure img");
  await expect(iiaImg).toHaveAttribute("src", /figures\/iia-vs-mixed-logit\.svg$/);
  expect(await iiaImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/scale-aware-association/10");
  await expect(
    page.getByRole("heading", { level: 2, name: "R×C表: 全体の関連と、どのセルが寄与したかを分ける" })
  ).toBeVisible();
  const mosaicImg = page.locator("figure img");
  await expect(mosaicImg).toHaveAttribute("src", /figures\/contingency-mosaic-residuals\.svg$/);
  expect(await mosaicImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/correspondence-analysis-mca/3");
  await expect(
    page.getByRole("heading", { level: 2, name: "MCAの落とし穴：馬蹄形効果（Guttman arch）と補助カテゴリの投影" })
  ).toBeVisible();
  const mcaImg = page.locator("figure img");
  await expect(mcaImg).toHaveAttribute("src", /figures\/mca-biplot-arch\.svg$/);
  expect(await mcaImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/regularization-trees-cv/2");
  await expect(
    page.getByRole("heading", { level: 2, name: "Lassoの共線性不安定と、分割前の事前スクリーニングが生むリーク" })
  ).toBeVisible();
  const lassoImg = page.locator("figure img");
  await expect(lassoImg).toHaveAttribute("src", /figures\/lasso-path-leakage\.svg$/);
  expect(await lassoImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/em-neural-sciml/3");
  await expect(
    page.getByRole("heading", { level: 2, name: "Juliaの独壇場：科学機械学習（SciML）とハイブリッド微分方程式（UDE）" })
  ).toBeVisible();
  const udeImg = page.locator("figure img");
  await expect(udeImg).toHaveAttribute("src", /figures\/sciml-hybrid-ude\.svg$/);
  expect(await udeImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/uncertainty-visualization/4");
  await expect(
    page.getByRole("heading", { level: 2, name: "同じ平均とSEでも、データは同じではない" })
  ).toBeVisible();
  const rainImg = page.locator("figure img");
  await expect(rainImg).toHaveAttribute("src", /figures\/unimodal-vs-bimodal-raincloud\.svg$/);
  expect(await rainImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/makie-aog-multifacet/2");
  await expect(
    page.getByRole("heading", { level: 2, name: "反復測定・対応データの可視化：群間エラーバーが隠す個人内変化" })
  ).toBeVisible();
  const spagImg = page.locator("figure img");
  await expect(spagImg).toHaveAttribute("src", /figures\/paired-spaghetti-linkband\.svg$/);
  expect(await spagImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/diagnostic-phase-visualization/3");
  await expect(
    page.getByRole("heading", { level: 2, name: "動的システムの位相平面（Phase Portrait）・ヌルクライン・セパラトリクス" })
  ).toBeVisible();
  const phaseImg = page.locator("figure img");
  await expect(phaseImg).toHaveAttribute("src", /figures\/phase-portrait-calibration\.svg$/);
  expect(await phaseImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/daily-workflow-tools/1");
  await expect(
    page.getByRole("heading", { level: 2, name: "初回実行待ち（TTFX）の正体と、Revise.jl による「再起動ゼロ」開発" })
  ).toBeVisible();
  const workflowImg = page.locator("figure img");
  await expect(workflowImg).toHaveAttribute("src", /figures\/workflow-revise-test-loop\.svg$/);
  expect(await workflowImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/julia-introduction/1");
  const introImg = page.locator("figure img");
  await expect(introImg).toHaveAttribute("src", /figures\/why-julia-two-language\.svg$/);
  expect(await introImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/why-julia-visualized/2");
  const fusionImg = page.locator("figure img");
  await expect(fusionImg).toHaveAttribute("src", /figures\/julia-loop-fusion-scaling\.svg$/);
  expect(await fusionImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/why-julia-visualized/3");
  const vcurveImg = page.locator("figure img");
  await expect(vcurveImg).toHaveAttribute("src", /figures\/julia-composability-ad-vcurve\.svg$/);
  expect(await vcurveImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  // 5. 新設した統計・混合モデル・DDM図版と長尺レッスンの段階的演習配置（「説明を読み直す」）を確認する
  await page.goto("./#lesson/sampling-distributions/4");
  const cltImg = page.locator("figure img");
  await expect(cltImg).toHaveAttribute("src", /figures\/sampling-clt-se\.svg$/);
  expect(await cltImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/mixed-models/7");
  await expect(page.locator("summary", { hasText: /説明を読み直す: 擬似反復は特にbetween効果を壊す/ })).toBeVisible();

  await page.goto("./#lesson/mixed-models/9");
  const lmmImg = page.locator("figure img");
  await expect(lmmImg).toHaveAttribute("src", /figures\/lmm-random-slopes-shrinkage\.svg$/);
  expect(await lmmImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/evidence-accumulation-ddm/3");
  const ddmImg = page.locator("figure img");
  await expect(ddmImg).toHaveAttribute("src", /figures\/ddm-paths-rt-dist\.svg$/);
  expect(await ddmImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/linear-model-unification/1");
  const glmImg = page.locator("figure img");
  await expect(glmImg).toHaveAttribute("src", /figures\/glm-unification-ttest-anova-lm\.svg$/);
  expect(await glmImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/reshape-import/1");
  const reshapeImg = page.locator("figure img");
  await expect(reshapeImg).toHaveAttribute("src", /figures\/wide-to-long-reshape\.svg$/);
  expect(await reshapeImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/arrays/2");
  const arrImg = page.locator("figure img");
  await expect(arrImg).toHaveAttribute("src", /figures\/arrays-1based-indexing-push\.svg$/);
  expect(await arrImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/groupby-join/2");
  const grpImg = page.locator("figure img");
  await expect(grpImg).toHaveAttribute("src", /figures\/groupby-combine-leftjoin\.svg$/);
  expect(await grpImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
});

test("ホームとチートシートで関数名・用語検索から遅延読込を保ったまま教材と構文へ到達できる", async ({ page }) => {
  const loadedLessonChunks = [];
  page.on("response", (response) => {
    const m = new URL(response.url()).pathname.match(
      /\/assets\/((?:l\d+|m0\d|a0\d|b0\d|x\d+)-[^/]+)-[A-Za-z0-9_-]+\.js$/
    );
    if (m) loadedLessonChunks.push(m[1]);
  });

  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("./");

  const homeSearch = page.getByRole("searchbox", { name: "教材・関数名・統計用語で探す" });
  await homeSearch.fill("@views");

  await expect(page.getByRole("status")).toContainText("レッスン 1 件・チートシート 1 件が一致");
  await expect(page.getByRole("button", { name: /型安定性とメモリ割当/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Juliaってなに\?/ })).toHaveCount(0);
  expect(loadedLessonChunks, "ホーム検索だけでは教材本文chunkを取得しない").toHaveLength(0);

  // 320px・文字200%でも検索バーと結果表示が横スクロールを起こさない
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.fontSize = "100%"; });
  await page.setViewportSize({ width: 900, height: 800 });

  // 検索語を引き継いでチートシートを開く
  await page.getByRole("button", { name: "チートシートで開く →" }).click();
  await expect(page).toHaveURL(/#cheat$/);
  const cheatSearch = page.getByRole("searchbox", { name: "関数名・書き方で絞り込み" });
  await expect(cheatSearch).toHaveValue("@views");
  await expect(page.getByRole("status")).toContainText("1 カード・1 行が一致");
  await expect(page.locator("code").filter({ hasText: "@views X[:, j]" })).toBeVisible();
  await expect(page.locator("code").filter({ hasText: "println(x)" })).toHaveCount(0);

  // クリアで全件復帰し、検索欄へフォーカスが戻る
  await page.getByRole("button", { name: "クリア" }).click();
  await expect(cheatSearch).toHaveValue("");
  await expect(cheatSearch).toBeFocused();
  await expect(page.locator("code").filter({ hasText: "println(x)" })).toBeVisible();

  // ホームへ戻り、検索結果から目的のレッスンだけを遅延読込する
  await page.getByRole("button", { name: "← もどる" }).click();
  const homeSearchAgain = page.getByRole("searchbox", { name: "教材・関数名・統計用語で探す" });
  await homeSearchAgain.fill("カルマン");
  await expect(page.getByRole("status")).toContainText("レッスン 1 件");
  await page.getByRole("button", { name: /状態空間モデルとカルマンフィルタ/ }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "時系列のギザギザは「本当に変化した」のか「測定誤差」なのか" })
  ).toBeVisible();
  expect(loadedLessonChunks).toEqual(["a03-state-space-kalman"]);
});

test("REPLプロンプト除去コピーと逆引き・スターターレシピ画面が320px・200%拡大を含め動作する", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("./#lesson/julia-introduction/3");

  const copyBtn = page.getByRole("button", { name: "Juliaコードをプロンプト除去してコピー" });
  await expect(copyBtn).toBeVisible();
  await copyBtn.click();
  await expect(page.getByRole("button", { name: "Juliaコードをコピー済み" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("1 + 1");

  // ホームからRの関数名(pivot_longer)で検索し、逆引き対訳へ遷移する
  await page.goto("./");
  const homeSearch = page.getByRole("searchbox", { name: "教材・関数名・統計用語で探す" });
  await homeSearch.fill("pivot_longer");
  await page.getByRole("button", { name: /逆引き対訳の一致を見る/ }).click();

  await expect(page).toHaveURL(/#toolkit$/);
  await expect(page.getByRole("heading", { level: 1, name: "Julia 逆引き・スターターレシピ" })).toBeFocused();
  await expect(page.getByRole("status")).toContainText("1 件の対訳が一致");
  await expect(
    page.getByRole("heading", { level: 2, name: "横持ち ⇄ 縦持ちの変換（pivot_longer / melt / stack）" })
  ).toBeVisible();

  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.fontSize = "100%"; });
  await page.setViewportSize({ width: 900, height: 800 });

  // 目的別スターターレシピへ切り替え、.jl保存リンクと320px・文字200%の横幅収まりを確認する
  await page.getByRole("button", { name: /目的別スターターレシピ/ }).click();
  await expect(page).toHaveURL(/#toolkit\/recipes$/);
  const dlLink = page.getByRole("link", { name: /starter_01_csv_summary\.jl/ });
  await expect(dlLink).toHaveAttribute("download", "starter_01_csv_summary.jl");

  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.fontSize = "100%"; });
  await page.setViewportSize({ width: 900, height: 800 });

  // 「なぜJulia？」対話プロットへ切り替え、タスク変更で誠実な比較ステータスとSVGが更新され320px・200%でも収まることを確認
  await page.getByRole("button", { name: "なぜJulia？（対話プロット）" }).click();
  await expect(page).toHaveURL(/#why-julia$/);
  await expect(page.getByRole("img", { name: /累積待ち時間比較プロット/ })).toBeVisible();
  await page.getByRole("button", { name: /既存C\/BLAS関数の1回呼び出し/ }).click();
  await expect(page.getByRole("status")).toContainText("【誠実な比較】");

  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.fontSize = "100%"; });
  await page.setViewportSize({ width: 900, height: 800 });

  // ホームの目的別コース絞り込みと、レッスン末尾からのスターターレシピ直結を確認する
  await page.getByRole("button", { name: "← もどる" }).click();
  const pathGroup = page.getByRole("group", { name: "目的別コース・進捗絞り込み" });
  await pathGroup.getByRole("button", { name: "最短・実データ入門 (12)" }).click();
  await expect(page.getByText(/（0 \/ 12 修了）/)).toBeVisible();
  await expect(page.getByRole("button", { name: /このコースを進める →/ })).toBeVisible();
  await pathGroup.getByRole("button", { name: "すべて (70)" }).click();

  await page.goto("./#lesson/julian-design-patterns/2");
  const mdImg = page.locator("figure img");
  await expect(mdImg).toHaveAttribute("src", /figures\/extra-multiple-dispatch-composability\.svg$/);
  expect(await mdImg.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.goto("./#lesson/logistic-regression/99");
  await expect(page.getByText("この単元の実践ツール・手元演習")).toBeVisible();
  await expect(page.getByRole("link", { name: /Pluto演習ノート \(nb4-model\.jl\)/ })).toBeVisible();
  await page.getByRole("button", { name: /スターターレシピ: starter_03_logistic_glm\.jl/ }).click();
  await expect(page).toHaveURL(/#toolkit\/recipes$/);
  await expect(
    page.getByRole("heading", { level: 2, name: "3. ロジスティック回帰・オッズ比・リンク尺度95%予測帯" })
  ).toBeVisible();
});
