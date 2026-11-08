import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LESSONS } from "./lessons/eager.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const ID = "distribution-fit-diagnostics";

describe("分布の推定と予測診断の学習契約", () => {
  it("番号付き37本を動かさず、8本目の補講として公開する", () => {
    const lesson = LESSONS.find((item) => item.id === ID);
    expect(LESSONS.filter((item) => item.num != null)).toHaveLength(37);
    expect(lesson.section).toBe("extra");
    expect(lesson.num).toBeNull();
    expect(lesson.numInSection).toBe(8);
    expect(lesson.pages).toHaveLength(15);
    expect(lesson.ex).toHaveLength(6);
  });

  it("入力監査・fit API・対応範囲・点推定の境界を扱う", () => {
    const text = JSON.stringify(LESSONS.find((item) => item.id === ID));
    for (const concept of [
      "fit(D, x)",
      "fit_mle(D, x)",
      "params(d)",
      "insupport",
      "NaN",
      "Inf",
      "点推定",
      "bootstrap",
      "NegativeBinomial",
      "対応一覧",
    ]) {
      expect(text, `${concept}が分布推定補講にない`).toContain(concept);
    }
  });

  it("replicate dataを0・SD・分位点・最大値の予測診断へ戻す", () => {
    const text = JSON.stringify(LESSONS.find((item) => item.id === ID));
    for (const concept of [
      "rand(rng, d, n, R)",
      "replicate data",
      "zero_rate",
      "below_350",
      "q50",
      "q95",
      "maximum",
      "Exponential",
      "Poisson",
      "QQ",
      "PIT",
      "parameter不確かさ",
    ]) {
      expect(text, `${concept}が予測診断契約にない`).toContain(concept);
    }
  });

  it("Julia検証が正常系・誤model・失敗例を性質で固定する", () => {
    const checker = read("scripts/distribution-fit-check.jl");
    const runner = read("scripts/run-numeric-checks.jl");
    const deploy = read(".github/workflows/deploy.yml");
    for (const contract of [
      "fit_checked",
      "fit_mle",
      "bootstrap_means",
      "replicate_summaries",
      "predictive_interval",
      "平均だけ合う誤model",
      "過分散countをPoisson",
      "@test_throws ArgumentError",
      "DISTRIBUTION_FIT_CHECK_PASS",
    ]) {
      expect(checker, `${contract}がJulia検証にない`).toContain(contract);
    }
    expect(runner).toContain('"scripts/distribution-fit-check.jl"');
    expect(deploy).toContain("scripts/run-numeric-checks.jl --public");
  });

  it("公式文書・L19・NB2・ロードマップ・READMEを同期する", () => {
    const lessonSource = read("src/data/lessons/extra/x08-distribution-fit-diagnostics.js");
    const probability = read("src/data/lessons/3-stats/l19-probability.js");
    const notebook = read("public/notebooks/nb2-stats.jl");
    const notebookChecker = read("scripts/nb-exec-check.jl");
    const roadmap = read("public/roadmap.html");
    const readme = read("README.md");

    expect(lessonSource).toContain("https://juliastats.org/Distributions.jl/stable/fit/");
    expect(lessonSource).toContain("https://docs.julialang.org/en/v1/stdlib/Random/");
    expect(probability).toContain("分布の推定と予測診断");
    expect(notebook).toContain("課題7: 観測dataへLogNormal分布を当てはめる");
    expect(notebook).toContain("課題8: 同じ標本サイズのreplicate dataを2000回作る");
    expect(notebook).toContain("課題9: q95と最大値を予測区間へ戻す");
    expect(notebook).toContain("predictive_check = missing");
    expect(notebookChecker).toContain('"nb2-stats.jl" => 12');
    expect(roadmap).toContain("分布の推定と予測診断(公開中)");
    expect(roadmap).toContain("分布を当てはめ、予測で反証する(公開中)");
    expect(roadmap).toContain("拡充スプリント・P0〜P1完了");
    expect(readme).toContain("分布選択・推定・予測診断");
  });
});
