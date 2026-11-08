import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LESSONS } from "./lessons/eager.js";
import { CHEATS } from "./cheats.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");

describe("中級編（高速化・並列化・独自推定）トラック", () => {
  it("番号付き37本を動かさず、8本の任意トラックとして公開する", () => {
    const intermediate = LESSONS.filter((lesson) => lesson.section === "intermediate");

    expect(LESSONS.filter((lesson) => lesson.num != null)).toHaveLength(37);
    expect(intermediate.map((lesson) => lesson.id)).toEqual([
      "type-stability-allocation",
      "parallel-monte-carlo",
      "custom-likelihood-optimization",
      "streaming-chunked-aggregation",
      "ordinal-multinomial-mle",
      "chisq-loglinear-exact",
      "regularization-trees-cv",
      "makie-aog-multifacet",
    ]);
    expect(intermediate.map((lesson) => lesson.numInSection)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(intermediate.every((lesson) => lesson.num === null)).toBe(true);
    for (const lesson of intermediate) {
      expect(lesson.pages.length).toBeGreaterThanOrEqual(5);
      expect(lesson.ex).toHaveLength(4);
    }
  });

  it("型安定性・並列RNG・自動微分と自作尤度・分割集計・順序／多項・カイ二乗／対数線形の核心概念と反例を網羅する", () => {
    const text = JSON.stringify(LESSONS.filter((lesson) => lesson.section === "intermediate"));

    for (const concept of [
      "@code_warntype",
      "@allocated",
      "@views",
      "LocationEstimator",
      "Threads.@threads",
      "trial_rng",
      "BLAS.set_num_threads(1)",
      "Dual",
      "censored_exp_loglik_eta",
      "Chisq(1)",
      "RunningStats",
      "merge_stats",
      "CSV.Chunks",
      "Arrow.Table",
      "unpack_cutpoints",
      "logsumexp",
      "stable_softmax",
      "rps_1obs",
      "chisq_gof",
      "mc_exact_chisq",
      "trend_chisq",
      "ipf_no_3way",
      "ipf_quasi_indep",
      "soft_thresh",
      "fit_lasso_cd",
      "fit_reg_tree",
      "cv_r2_leak_vs_honest",
      "MLJ.jl",
      "GridLayout",
      "linkxaxes!",
      "ws_morey_se",
      "colorrange",
      "AlgebraOfGraphics",
    ]) {
      expect(text, `${concept} が中級編トラックにない`).toContain(concept);
    }
  });

  it("割当比較・プロファイル尤度・順序対多項・残差モザイク・Lassoリーク・Spaghetti対応図のSVG図版が実在し、チートシート・ロードマップ・数値検証と同期する", () => {
    for (const svg of [
      "public/figures/allocation-views.svg",
      "public/figures/profile-vs-wald.svg",
      "public/figures/ordinal-vs-multinomial.svg",
      "public/figures/contingency-mosaic-residuals.svg",
      "public/figures/lasso-path-leakage.svg",
      "public/figures/unimodal-vs-bimodal-raincloud.svg",
      "public/figures/paired-spaghetti-linkband.svg",
    ]) {
      expect(existsSync(join(ROOT, svg)), `${svg} が存在しない`).toBe(true);
    }
    expect(CHEATS.some((c) => c.group === "高速化・並列・独自推定")).toBe(true);
    expect(CHEATS.some((c) => c.title === "順序・多項・離散選択(中級・上級)")).toBe(true);
    expect(CHEATS.some((c) => c.title === "カイ二乗・対数線形・コレスポンデンス分析(中級・上級)")).toBe(true);
    expect(CHEATS.some((c) => c.title === "機械学習・SciML・Python連携(中級・上級・橋)")).toBe(true);
    expect(CHEATS.some((c) => c.title === "多次元可視化・AoG・モデル診断図(中級・上級)")).toBe(true);

    const roadmap = read("public/roadmap.html");
    for (const title of [
      "型安定性とメモリ割当",
      "並列モンテカルロと乱数設計",
      "自作対数尤度と数値最適化",
      "大規模データの分割読込と省メモリ集計",
      "順序・多項ロジットの尤度実装と推定",
      "カイ二乗分析の深化：適合度・正確検定・対数線形モデル",
      "予測機械学習と検証：Lasso・決定木・リーク防止CV",
      "多次元・反復データの可視化設計：MakieレイアウトとAlgebraOfGraphics",
    ]) {
      expect(roadmap).toContain(`${title}(公開中)`);
    }

    const checker = read("scripts/intermediate-track-check.jl");
    const runner = read("scripts/run-numeric-checks.jl");
    const nb = read("public/notebooks/nb7-intermediate.jl");
    const nbExec = read("scripts/nb-exec-check.jl");
    const nbSmoke = read("scripts/run-notebook-smoke.jl");
    expect(checker).toContain("INTERMEDIATE_TRACK_CHECK_PASS");
    expect(runner).toContain('"scripts/intermediate-track-check.jl"');
    expect(nb).toContain("NB7: 中級編（高速化・並列化・独自推定）の演習ノート");
    expect(nbExec).toContain('"nb7-intermediate.jl" => 8');
    expect(nbSmoke).toContain('"public/notebooks/nb7-intermediate.jl"');
  });
});
