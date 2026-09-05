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
  expect(notebookNames).toHaveLength(6);
  expect(new Set(notebookNames).size).toBe(6);
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
  await expect(page.getByText(/番号付き全37レッスン＋補講9本/)).toBeVisible();
  await expect(page.getByText(/R・Stan連携4本/)).toBeVisible();

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
  for (let i = 0; i < 7; i += 1) {
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

  const bridgeNotebook = page.getByRole("link", { name: "演習ノート ↓" }).nth(5);
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
