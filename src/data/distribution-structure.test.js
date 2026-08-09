import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LESSONS } from "./lessons/eager.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const ID = "observation-boundaries-dependence";

describe("観測境界・依存・混合分布の学習契約", () => {
  it("番号付き37本を動かさず、9本目の補講として公開する", () => {
    const lesson = LESSONS.find((item) => item.id === ID);
    expect(LESSONS.filter((item) => item.num != null)).toHaveLength(37);
    expect(lesson.section).toBe("extra");
    expect(lesson.num).toBeNull();
    expect(lesson.numInSection).toBe(9);
    expect(lesson.pages).toHaveLength(15);
    expect(lesson.ex).toHaveLength(6);
  });

  it("truncationとcensoringを行数・境界質量・metadataで分離する", () => {
    const text = JSON.stringify(LESSONS.find((item) => item.id === ID));
    for (const concept of [
      "truncated",
      "censored",
      "clamp",
      "確率質量",
      "再正規化",
      "is_censored",
      "censor_side",
      "limit",
      "行数",
      "fit_mle",
    ]) {
      expect(text, `${concept}が観測境界契約にない`).toContain(concept);
    }
  });

  it("MvNormalの共分散・sample方向・joint eventを扱う", () => {
    const text = JSON.stringify(LESSONS.find((item) => item.id === ID));
    for (const concept of [
      "MvNormal",
      "共分散",
      "isposdef",
      "Symmetric",
      "正定値",
      "各列が1つの多変量観測",
      "joint",
      "2×5000",
    ]) {
      expect(text, `${concept}が多変量契約にない`).toContain(concept);
    }
  });

  it("MixtureModelを生成・分解までに限定し、推定非対応を明記する", () => {
    const text = JSON.stringify(LESSONS.find((item) => item.id === ID));
    for (const concept of [
      "MixtureModel",
      "components(d)",
      "probs(d)",
      "ncomponents(d)",
      "within",
      "between",
      "component間の谷",
      "推定機能を提供しない",
      "label switching",
      "既知parameterからの生成",
    ]) {
      expect(text, `${concept}が混合分布契約にない`).toContain(concept);
    }
  });

  it("Julia検証が境界・共分散・mixture反例と失敗例を固定する", () => {
    const checker = read("scripts/distribution-structure-check.jl");
    const runner = read("scripts/run-numeric-checks.jl");
    const deploy = read(".github/workflows/deploy.yml");
    for (const contract of [
      "truncatedとcensoredは別の観測過程",
      "除外と測定限界をsimulationで復元する",
      "checked_mvnormal",
      "joint",
      "weighted_mixture_variance",
      "!applicable(fit_mle, MixtureModel",
      "@test_throws PosDefException",
      "DISTRIBUTION_STRUCTURE_CHECK_PASS",
    ]) {
      expect(checker, `${contract}がJulia検証にない`).toContain(contract);
    }
    expect(runner).toContain('"scripts/distribution-structure-check.jl"');
    expect(deploy).toContain("Run 32 numerical regression checks");
  });

  it("公式文書・P0-C・NB2・ロードマップ・READMEを同期する", () => {
    const source = read("src/data/lessons/extra/x09-observation-boundaries-dependence.js");
    const fitting = read("src/data/lessons/extra/x08-distribution-fit-diagnostics.js");
    const notebook = read("public/notebooks/nb2-stats.jl");
    const notebookChecker = read("scripts/nb-exec-check.jl");
    const roadmap = read("public/roadmap.html");
    const readme = read("README.md");

    for (const url of [
      "https://juliastats.org/Distributions.jl/stable/truncate/",
      "https://juliastats.org/Distributions.jl/stable/censored/",
      "https://juliastats.org/Distributions.jl/stable/multivariate/",
      "https://juliastats.org/Distributions.jl/stable/mixture/",
    ]) {
      expect(source).toContain(url);
    }
    expect(fitting).toContain("観測境界・依存・混合分布");
    expect(notebook).toContain("課題10: truncationとcensoringを別の観測分布にする");
    expect(notebook).toContain("課題11: 共分散を持つ2変数を同時生成する");
    expect(notebook).toContain("課題12: 既知componentの混合分布から生成する");
    expect(notebookChecker).toContain('"nb2-stats.jl" => 12');
    expect(roadmap).toContain("観測境界・依存・混合分布(公開中)");
    expect(roadmap).toContain("観測境界と依存を分布へ戻す(公開中)");
    expect(roadmap).toContain("拡充スプリント・P0〜P1完了");
    expect(readme).toContain("観測境界・依存・混合生成");
  });
});
