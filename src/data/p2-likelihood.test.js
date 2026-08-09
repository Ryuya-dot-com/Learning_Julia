import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");

describe("P2 尤度feasibilityの研究境界", () => {
  const checker = read("scripts/p2-likelihood-check.jl");
  const contracts = read("scripts/p2-likelihood-contracts.jl");
  const stress = read("scripts/p2-likelihood-stress-check.jl");
  const identification = read("scripts/p2-identification-profile-check.jl");
  const generalization = read("scripts/p2-generalization-engine-check.jl");
  const twoSided = read("scripts/p2-two-sided-identification-check.jl");
  const selectionCount = read("scripts/p2-selection-count-check.jl");
  const teachingDraft = read("validation/p2-likelihood/SELECTION_COUNT_TEACHING_DRAFT.md");
  const scipyReference = read("scripts/p2-scipy-reference.py");
  const scipyRequirements = read("validation/p2-scipy/requirements.txt");
  const implementation = `${checker}\n${contracts}`;
  const project = read("validation/p2-likelihood/Project.toml");
  const manifest = read("validation/p2-likelihood/Manifest.toml");
  const decision = read("validation/p2-likelihood/README.md");

  it("本編から隔離した4つの直接依存とcompatを固定する", () => {
    for (const dependency of ["ADTypes", "Distributions", "ForwardDiff", "Optim"]) {
      expect(project).toContain(`${dependency} =`);
      expect(manifest).toContain(`[[deps.${dependency}]]`);
    }
    expect(project).toContain('julia = "1.12"');
    expect(project).toContain('Optim = "~2.2.1"');
    expect(read("validation/Project.toml")).not.toContain("Optim =");
  });

  it("現行Optim 2.xのAutoForwardDiff APIと公式資料を使う", () => {
    expect(implementation).toContain("using ADTypes: AutoForwardDiff");
    expect(implementation).toContain("using ForwardDiff");
    expect(implementation).toContain("autodiff = AutoForwardDiff()");
    expect(implementation).not.toContain("autodiff = :forward");
    for (const url of [
      "juliastats.org/Distributions.jl/stable/censored",
      "juliastats.org/Distributions.jl/stable/truncate",
      "julianlsolvers.github.io/Optim.jl/stable/examples/generated/maxlikenlm",
    ]) {
      expect(checker).toContain(url);
    }
  });

  it("左右打切りとtruncationの尤度項・入力失敗を分離する", () => {
    for (const contract of [
      "logcdf(distribution, lower)",
      "logccdf(distribution, upper)",
      "log1p(-exp(logcdf(distribution, lower) - log_upper))",
      "log1p(-exp(logccdf(distribution, upper) - log_lower))",
      "log1p(-(cdf(distribution, lower) + ccdf(distribution, upper)))",
      "同じ観測を左右同時に打切りにはできません",
      "通常観測が少なくとも2件必要です",
      "初期scaleを識別できる変動がありません",
      "observed Hessianが正定値ではありません",
    ]) {
      expect(implementation).toContain(contract);
    }
  });

  it("18条件のstress行列で収束flagとparameter回復を分ける", () => {
    for (const contract of [
      "sample_size) in enumerate((40, 120, 400))",
      "censor_fraction) in enumerate((0.2, 0.6, 0.9))",
      "retained_fraction) in enumerate((0.8, 0.5, 0.1))",
      "catastrophic_recoveries",
      "bounded_recovery_rate",
      "attempt_coverage_mu",
      "initial_raw = initial",
      "P2_LIKELIHOOD_STRESS_CHECK_PASS",
    ]) {
      expect(stress).toContain(contract);
    }
    expect(decision).toContain("計2,880試行");
    expect(decision).toContain("23/160");
    expect(decision).toContain("開始値への局所的な頑健性は、parameter回復の十分条件ではありません");
  });

  it("naive反例・parameter回復・coverage・予測診断を検証する", () => {
    for (const contract of [
      "naive_censored",
      "naive_selected",
      "repetitions = 240",
      "wald_intervals",
      "0.89 <= rate <= 0.99",
      "fit後の観測過程へ予測を戻す",
      "ForwardDiff.hessian",
      "P2_LIKELIHOOD_CHECK_PASS",
      "feasibility-only; not a public censored-data estimation API",
    ]) {
      expect(checker).toContain(contract);
    }
  });

  it("別parameter・片側/両側切断とSciPy独立engineを外部検証する", () => {
    for (const contract of [
      "GENERALIZATION_REPETITIONS = 120",
      "GENERALIZATION_TRUTHS = (Normal(-2, 0.35), Normal(1200, 250))",
      "GENERALIZATION_DESIGNS = (:left80, :right50, :central50, :left10, :central10)",
      "result.fit_failures, two_sided) == 116",
      "result.catastrophic, two_sided) == 396",
      "result.catastrophic_warnings, two_sided) == 253",
      "P2_GENERALIZATION_ENGINE_CHECK_PASS",
      "docs.scipy.org/doc/scipy/reference/generated/scipy.stats.CensoredData.html",
      "docs.scipy.org/doc/scipy/reference/generated/scipy.stats.truncate.html",
      "docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.minimize.html",
    ]) {
      expect(generalization).toContain(contract);
    }
    expect(scipyReference).toContain("stats.CensoredData");
    expect(scipyReference).toContain("stats.norm.fit(data)");
    expect(scipyReference).toContain("stats.truncate(");
    expect(scipyReference).toContain('method="Nelder-Mead"');
    expect(scipyRequirements.trim().split("\n")).toEqual([
      "numpy==2.4.2",
      "scipy==1.17.1",
    ]);
    expect(decision).toContain("143件を見逃し");
    expect(decision).toContain("最大2.1×10⁻⁶");
  });

  it("data-only geometryをholdoutで評価しprofile未解決を保持する", () => {
    for (const contract of [
      "scaled_condition_number",
      "covariance_correlation",
      "relative_se_mu",
      "selection_probability_floor = 1e-2",
      "profile_likelihood_intervals",
      "skipped_weak_identification",
      "search_limit",
    ]) {
      expect(contracts).toContain(contract);
    }
    for (const contract of [
      "GEOMETRY_REPETITIONS = 160",
      "PROFILE_REPETITIONS = 80",
      "MIN_CHALLENGING_CATASTROPHIC_RATE = 0.02",
      "MAX_CHALLENGING_CATASTROPHIC_RATE = 0.08",
      "MAX_STABLE_WARNING_RATE = 0.01",
      "20261000 + 10i + j",
      "20262400 + 10i + j",
      "catastrophic_warnings",
      "gate.catastrophic_warnings == gate.catastrophic",
      "P2_IDENTIFICATION_PROFILE_CHECK_PASS",
      "julianlsolvers.github.io/Optim.jl/stable/user/config",
    ]) {
      expect(identification).toContain(contract);
    }
    expect(decision).toContain("holdout 9条件・各160反復");
    expect(decision).toContain("55件すべてを検出");
    expect(decision).toContain("coverageは`profile_ok`になった試行だけに条件づけたpilot値");
  });

  it("両側の広域scale競合を別seed holdoutで再評価する", () => {
    for (const contract of [
      "two_sided_scale_contrast",
      "two_sided_truncation_assessment",
      "reference_scale_factors = (1.0, 2.0, 4.0)",
      ":wide_scale_profile_compatible",
      "quantile(Chisq(1), level)",
    ]) {
      expect(contracts).toContain(contract);
    }
    for (const contract of [
      "CALIBRATION_TRUTHS = (Normal(-2, 0.35), Normal(1200, 250))",
      "HOLDOUT_TRUTHS = (Normal(37, 1.7), Normal(-15_000, 3_200))",
      "central99 = (0.005, 0.995)",
      "asymmetric50 = (0.1, 0.6)",
      "calibration.challenging.enhanced_catastrophic_warnings == 484",
      "holdout.challenging.enhanced_catastrophic_warnings == 436",
      "enhanced_catastrophic_warnings < challenging.catastrophic",
      "P2_TWO_SIDED_IDENTIFICATION_CHECK_PASS",
    ]) {
      expect(twoSided).toContain(contract);
    }
    expect(decision).toContain("307/446から436/446");
    expect(decision).toContain("安定条件480試行で誤warning 0");
    expect(decision).toContain("残る10件");
  });

  it("選別前総数と選択数で両側truncationを再同定しprofile区間を校正する", () => {
    for (const contract of [
      "fit_selection_count_normal",
      "normal_selection_count_nll",
      "validate_selection_count_sample",
      "log_complement_probability",
    ]) {
      expect(contracts).toContain(contract);
    }
    for (const contract of [
      "SELECTION_COUNT_REPETITIONS = 120",
      "SELECTION_COUNT_PROFILE_REPETITIONS = 80",
      "calibration.conditional_catastrophic == 463",
      "holdout.conditional_catastrophic == 446",
      "calibration.count_catastrophic == holdout.count_catastrophic == 0",
      "result.conditional_profile_coverage_mu -",
      "result.conditional_wald_coverage_mu > 0.4",
      "P2_SELECTION_COUNT_CHECK_PASS",
      "juliastats.org/Distributions.jl/latest/univariate",
    ]) {
      expect(selectionCount).toContain(contract);
    }
    expect(decision).toContain("selection-count likelihood");
    expect(decision).toContain("2,880試行");
    expect(decision).toContain("全480試行でprofile_ok");
    expect(decision).toContain("38.75%〜50.00%");
  });

  it("selection-countを直感・手計算・実装・反例・演習の研究教材へ変換する", () => {
    const stages = [
      "400人をscreening",
      "人数だけの小さな手計算",
      "条件付き密度と人数情報を掛ける",
      "Juliaで1回のscreeningを再現する",
      "なぜWald区間が狭くなりすぎるのか",
      "実データへ進む前の観測契約",
      "理解チェック",
    ];
    let previous = -1;
    for (const stage of stages) {
      const index = teachingDraft.indexOf(stage);
      expect(index, `${stage}の教材順序`).toBeGreaterThan(previous);
      previous = index;
    }
    for (const contract of [
      "research only / 公開レッスンではありません",
      "N - m",
      "欠測数",
      "`pᵐ`と`p⁻ᵐ`が相殺",
      "Wald mu:    35.768 -- 36.307",
      "profile mu: 35.705 -- 38.145",
      "fit失敗、`search_limit`、区間未解決を結果として残す",
      "Normal以外、境界誤指定、人数記録誤差",
    ]) {
      expect(teachingDraft, `${contract}が教材ドラフトにない`).toContain(contract);
    }
    expect(teachingDraft.match(/<details><summary>答えと理由<\/summary>/g)).toHaveLength(5);
    expect(selectionCount).toContain("selection_count_teaching_example");
    expect(selectionCount).toContain("P2_SELECTION_COUNT_TEACHING_EXAMPLE");
    expect(selectionCount).toContain("!interval_contains(teaching_example.wald.mu");
    expect(selectionCount).toContain("interval_contains(teaching_example.profile.mu");
    expect(read("src/data/lessons/catalog.js")).not.toContain("selection-count-likelihood");
    expect(decision).toContain("selection-count教材ドラフト");
  });

  it("CI・research roadmap・依存cost記録を同期する", () => {
    const runner = read("scripts/run-numeric-checks.jl");
    const deploy = read(".github/workflows/deploy.yml");
    const roadmap = read("public/roadmap.html");
    expect(runner).toContain('"scripts/p2-likelihood-check.jl"');
    expect(runner).toContain('"scripts/p2-likelihood-stress-check.jl"');
    expect(runner).toContain('"scripts/p2-identification-profile-check.jl"');
    expect(runner).toContain('"scripts/p2-generalization-engine-check.jl"');
    expect(runner).toContain('"scripts/p2-two-sided-identification-check.jl"');
    expect(runner).toContain('"scripts/p2-selection-count-check.jl"');
    expect(runner).toContain('"validation", "p2-likelihood"');
    expect(deploy).toContain("Run 26 numerical regression checks");
    expect(deploy).toContain("Install SciPy independent reference environment");
    expect(deploy).toContain("Instantiate P2 likelihood feasibility environment");
    expect(roadmap).toContain('data-strategy-status="research"');
    expect(roadmap).toContain("P2_LIKELIHOOD_CHECK_PASS");
    expect(roadmap).toContain("P2_LIKELIHOOD_STRESS_CHECK_PASS");
    expect(roadmap).toContain("P2_IDENTIFICATION_PROFILE_CHECK_PASS");
    expect(roadmap).toContain("P2_GENERALIZATION_ENGINE_CHECK_PASS");
    expect(roadmap).toContain("P2_TWO_SIDED_IDENTIFICATION_CHECK_PASS");
    expect(roadmap).toContain("P2_SELECTION_COUNT_CHECK_PASS");
    expect(roadmap).toContain("TEACHING_DRAFT");
    expect(decision).toContain("research only / not a public lesson API");
    expect(decision).toContain("83.4秒、142.5MB");
    expect(read("scripts/p2-clean-install-measure.jl")).toContain("mktempdir");
  });
});
