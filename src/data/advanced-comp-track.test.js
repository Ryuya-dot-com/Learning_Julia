import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LESSONS } from "./lessons/eager.js";
import { CHEATS } from "./cheats.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");

describe("上級編（動的モデル・MCMC・計算統計）トラック", () => {
  it("番号付き37本を動かさず、8本の任意トラックとして公開する", () => {
    const advanced = LESSONS.filter((lesson) => lesson.section === "advanced-comp");

    expect(LESSONS.filter((lesson) => lesson.num != null)).toHaveLength(37);
    expect(advanced.map((lesson) => lesson.id)).toEqual([
      "ode-dynamical-simulation",
      "evidence-accumulation-ddm",
      "state-space-kalman-filter",
      "mcmc-metropolis-hmc",
      "hierarchical-ordinal-choice",
      "correspondence-analysis-mca",
      "em-neural-sciml",
      "diagnostic-phase-visualization",
    ]);
    expect(advanced.map((lesson) => lesson.numInSection)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(advanced.every((lesson) => lesson.num === null)).toBe(true);
    for (const lesson of advanced) {
      expect(lesson.pages.length).toBeGreaterThanOrEqual(5);
      expect(lesson.ex).toHaveLength(4);
    }
  });

  it("RK4・DDM・カルマンフィルタ・Leapfrog HMC・階層順序求積／IIA・CA／MCAの核心概念と反例を網羅する", () => {
    const text = JSON.stringify(LESSONS.filter((lesson) => lesson.section === "advanced-comp"));

    for (const concept of [
      "solve_rk4",
      "sir_rhs!",
      "ODEProblem",
      "sqrt(dt)",
      "simulate_ddm",
      "ddm_upper_prob",
      "kalman_filter_1d",
      "予測誤差分解",
      "run_rwmh_2d",
      "run_hmc_2d",
      "ess_1d",
      "divergent",
      "Turing.jl",
      "SymTridiagonal",
      "gauss_hermite_std",
      "clmm_loglik",
      "OrderedLogistic",
      "simple_ca",
      "fit_mca",
      "Benzécri",
      "Guttman",
      "Procrustes",
      "fit_gmm1d_em",
      "sim_rk4_1d",
      "Lux.jl",
      "UDE",
      "ppc_min_band",
      "exact_auc",
      "rk4_2d",
      "streamplot!",
      "@lift",
    ]) {
      expect(text, `${concept} が上級編トラックにない`).toContain(concept);
    }
  });

  it("SVG図版6枚・チートシート・ロードマップ・NB8・数値検証と同期する", () => {
    for (const svg of [
      "public/figures/euler-vs-rk4.svg",
      "public/figures/rwmh-vs-hmc.svg",
      "public/figures/iia-vs-mixed-logit.svg",
      "public/figures/mca-biplot-arch.svg",
      "public/figures/sciml-hybrid-ude.svg",
      "public/figures/phase-portrait-calibration.svg",
    ]) {
      expect(existsSync(join(ROOT, svg)), `${svg} が存在しない`).toBe(true);
    }
    expect(CHEATS.some((c) => c.title === "微分方程式・確率過程・状態空間(上級)")).toBe(true);
    expect(CHEATS.some((c) => c.title === "MCMC・HMCと収束診断(上級)")).toBe(true);
    expect(CHEATS.some((c) => c.title === "順序・多項・離散選択(中級・上級)")).toBe(true);
    expect(CHEATS.some((c) => c.title === "カイ二乗・対数線形・コレスポンデンス分析(中級・上級)")).toBe(true);
    expect(CHEATS.some((c) => c.title === "機械学習・SciML・Python連携(中級・上級・橋)")).toBe(true);
    expect(CHEATS.some((c) => c.title === "多次元可視化・AoG・モデル診断図(中級・上級)")).toBe(true);

    const roadmap = read("public/roadmap.html");
    for (const title of [
      "微分方程式と動的システム",
      "確率過程と反応時間モデル（DDM）",
      "状態空間モデルとカルマンフィルタ",
      "MCMCとハミルトニアンモンテカルロの原理",
      "階層順序モデルと離散選択・IIA",
      "コレスポンデンス分析と多重コレスポンデンス分析（MCA）",
      "潜在クラスタEM・逆伝播と科学機械学習（SciML）",
      "計算統計・動的モデルの診断可視化：事後予測・較正・位相平面",
    ]) {
      expect(roadmap).toContain(`${title}(公開中)`);
    }

    const checker = read("scripts/advanced-comp-track-check.jl");
    const runner = read("scripts/run-numeric-checks.jl");
    const nb = read("public/notebooks/nb8-advanced-comp.jl");
    const nbExec = read("scripts/nb-exec-check.jl");
    const nbSmoke = read("scripts/run-notebook-smoke.jl");
    expect(checker).toContain("ADVANCED_COMP_TRACK_CHECK_PASS");
    expect(runner).toContain('"scripts/advanced-comp-track-check.jl"');
    expect(nb).toContain("NB8: 上級編（動的モデル・MCMC・計算統計）の演習ノート");
    expect(nbExec).toContain('"nb8-advanced-comp.jl" => 8');
    expect(nbSmoke).toContain('"public/notebooks/nb8-advanced-comp.jl"');
  });
});
