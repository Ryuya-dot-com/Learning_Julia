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
  const robustness = read("scripts/p2-selection-count-robustness-check.jl");
  const intervalReport = read("scripts/p2-selection-count-interval-check.jl");
  const reportIo = read("scripts/p2-selection-count-report-io.jl");
  const reportIoCheck = read("scripts/p2-selection-count-report-io-check.jl");
  const reportSchema = read("validation/p2-likelihood/selection-count-report-v1.schema.json");
  const reportIoDesign = read("validation/p2-likelihood/RESULT_IO_SCHEMA.md");
  const reportFixtureJson = read("validation/p2-likelihood/fixtures/selection-count-report-v1.json");
  const reportFixtureCsv = read("validation/p2-likelihood/fixtures/selection-count-report-v1.csv");
  const apiCore = read("scripts/p2-selection-count-api-core.jl");
  const apiCheck = read("scripts/p2-selection-count-api-boundary-check.jl");
  const apiWorker = read("scripts/p2-selection-count-api-worker.jl");
  const localServer = read("scripts/p2-selection-count-local-server.jl");
  const localServerCheck = read("scripts/p2-selection-count-local-server-check.jl");
  const localServerRunner = read("scripts/run-p2-selection-count-local-server.jl");
  const localApiE2e = read("e2e-research/p2-local-api.spec.js");
  const localApiPlaywright = read("playwright.p2.local.config.js");
  const usabilityCheck = read("scripts/p2-learner-usability-protocol-check.jl");
  const usabilityProtocol = read("validation/p2-likelihood/LEARNER_USABILITY_PROTOCOL.md");
  const usabilityObservationSchema = read("validation/p2-likelihood/learner-usability-observation-v1.schema.json");
  const usabilitySummarySchema = read("validation/p2-likelihood/learner-usability-round-summary-v1.schema.json");
  const usabilityObservationExample = read("validation/p2-likelihood/fixtures/learner-usability-observation-v1.example.json");
  const usabilitySummaryExample = read("validation/p2-likelihood/fixtures/learner-usability-round-summary-v1.example.json");
  const apiClient = read("src/research/p2-selection-count-api.js");
  const apiRequestSchema = read("validation/p2-likelihood/selection-count-api-request-v1.schema.json");
  const apiResponseSchema = read("validation/p2-likelihood/selection-count-api-response-v1.schema.json");
  const apiRequestFixture = read("validation/p2-likelihood/fixtures/selection-count-api-v1-request.json");
  const apiResponseFixture = read("validation/p2-likelihood/fixtures/selection-count-api-v1-response.json");
  const apiRegistry = read("validation/p2-likelihood/p2-api-version-registry.json");
  const apiDesign = read("validation/p2-likelihood/API_BOUNDARY_DESIGN.md");
  const teachingNotebook = read("validation/p2-likelihood/selection-count-teaching-notebook.jl");
  const notebookExec = read("scripts/p2-selection-count-notebook-exec.jl");
  const plutoWorkflow = read(".github/workflows/pluto-smoke.yml");
  const uiModel = read("src/research/p2-selection-count-model.js");
  const uiReport = read("src/research/p2-selection-count-report.js");
  const uiPreview = read("src/research/p2-selection-count-preview.jsx");
  const uiHtml = read("validation/p2-likelihood/ui-preview.html");
  const uiDesign = read("validation/p2-likelihood/WEB_UI_PREVIEW_DESIGN.md");
  const uiE2e = read("e2e-research/p2-selection-count-preview.spec.js");
  const productionE2e = read("e2e/learning-flow.spec.js");
  const viteConfig = read("vite.config.js");
  const teachingDraft = read("validation/p2-likelihood/SELECTION_COUNT_TEACHING_DRAFT.md");
  const robustnessDesign = read("validation/p2-likelihood/ROBUSTNESS_GATE_DESIGN.md");
  const intervalDesign = read("validation/p2-likelihood/INTERVAL_REPORT_DESIGN.md");
  const scipyReference = read("scripts/p2-scipy-reference.py");
  const scipyRequirements = read("validation/p2-scipy/requirements.txt");
  const implementation = `${checker}\n${contracts}`;
  const project = read("validation/p2-likelihood/Project.toml");
  const manifest = read("validation/p2-likelihood/Manifest.toml");
  const decision = read("validation/p2-likelihood/README.md");

  it("本編から隔離した7つの直接依存とcompatを固定する", () => {
    for (const dependency of ["ADTypes", "CSV", "Distributions", "ForwardDiff", "HTTP", "JSON3", "Optim"]) {
      expect(project).toContain(`${dependency} =`);
      expect(manifest).toContain(`[[deps.${dependency}]]`);
    }
    expect(project).toContain('julia = "1.12"');
    expect(project).toContain('Optim = "~2.2.1"');
    expect(project).toContain('HTTP = "~2.0.0"');
    expect(project).toContain('CSV = "~0.10"');
    expect(project).toContain('JSON3 = "~1.14"');
    expect(read("validation/Project.toml")).not.toContain("Optim =");
    expect(read("validation/Project.toml")).not.toContain("HTTP =");
    expect(read("validation/Project.toml")).not.toContain("JSON3 =");
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
      "MIN_ONE_SIDED_CATASTROPHIC_RATE = 0.03",
      "MAX_ONE_SIDED_CATASTROPHIC_RATE = 0.06",
      "MIN_TWO_SIDED_FIT_FAILURE_RATE = 0.10",
      "MAX_TWO_SIDED_FIT_FAILURE_RATE = 0.15",
      "MIN_TWO_SIDED_CATASTROPHIC_RATE = 0.40",
      "MAX_TWO_SIDED_CATASTROPHIC_RATE = 0.55",
      "MIN_TWO_SIDED_MISS_RATE = 0.30",
      "MAX_TWO_SIDED_MISS_RATE = 0.45",
      "one_sided_gate.catastrophic_warnings == one_sided_gate.catastrophic",
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
      "MIN_CHALLENGING_CATASTROPHIC_RATE = 0.20",
      "MAX_CHALLENGING_CATASTROPHIC_RATE = 0.30",
      "challenging.catastrophic / challenging.attempts",
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
      "MIN_CONDITIONAL_FIT_FAILURE_RATE = 0.10",
      "MAX_CONDITIONAL_FIT_FAILURE_RATE = 0.15",
      "MIN_CONDITIONAL_CATASTROPHIC_RATE = 0.28",
      "MAX_CONDITIONAL_CATASTROPHIC_RATE = 0.35",
      "summary.conditional_catastrophic / summary.attempts",
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

  it("family・境界・人数の誤指定を別々の公開blockerとして再現する", () => {
    for (const contract of [
      "ROBUSTNESS_REPETITIONS = 80",
      "ROBUSTNESS_TOTAL_SCREENED = 4_000",
      "LogNormal(0, 0.8)",
      "TDist(3)",
      "MAX_OBSERVED_SELECTION_RATE_GAP = 0.02",
      "MIN_LOGNORMAL_NEGATIVE_MASS = 0.05",
      "MIN_WIDE_BOUNDARY_SCALE_RATIO = 1.70",
      "MIN_LOW_COUNT_SCALE_RATIO = 0.75",
      "MIN_HIGH_COUNT_SCALE_RATIO = 1.08",
      "length(example_observed) - 1",
      "P2_SELECTION_COUNT_ROBUSTNESS_CHECK_PASS",
    ]) {
      expect(robustness).toContain(contract);
    }
    for (const url of [
      "juliastats.org/Distributions.jl/stable/truncate",
      "juliastats.org/Distributions.jl/stable/univariate",
      "juliastats.org/Distributions.jl/stable/fit",
      "julianlsolvers.github.io/Optim.jl/stable/user/config",
    ]) {
      expect(robustness).toContain(url);
      expect(robustnessDesign).toContain(url);
    }
    expect(decision).toContain("model misspecification robustness gate");
    expect(decision).toContain("負値への平均確率15.56%");
    expect(decision).toContain("境界幅を2倍に誤記録");
    expect(decision).toContain("頑健であることを意味しません");
  });

  it("Wald・profile・parametric bootstrapを未解決statusつきreportへ統合する", () => {
    for (const contract of [
      "parametric_bootstrap_selection_count_intervals",
      "selection_count_interval_report",
      "repetitions = 999",
      "status = success_rate >= minimum_success_rate ? :ok : :insufficient_success",
      "automatic_interval = nothing",
      ":profile_interval_unresolved",
      ":bootstrap_success_rate_too_low",
      "expected_tail_draws_per_side",
    ]) {
      expect(contracts).toContain(contract);
    }
    for (const contract of [
      "INTERVAL_OUTER_REPETITIONS = 80",
      "INTERVAL_BOOTSTRAP_REPETITIONS = 199",
      "MAX_CENTRAL_BOOTSTRAP_SIGMA_COVERAGE = 0.85",
      "MIN_STABLE_BOOTSTRAP_SIGMA_COVERAGE = 0.85",
      "20283000 + 100design_id",
      "P2_SELECTION_COUNT_INTERVAL_CONFIRMATION",
      "P2_SELECTION_COUNT_INTERVAL_UNRESOLVED_EXAMPLE",
      "P2_SELECTION_COUNT_INTERVAL_CHECK_PASS",
    ]) {
      expect(intervalReport).toContain(contract);
    }
    for (const url of [
      "juliastats.org/Distributions.jl/stable/univariate",
      "docs.julialang.org/en/v1/stdlib/Random",
      "docs.julialang.org/en/v1/stdlib/Statistics",
    ]) {
      expect(intervalReport).toContain(url);
      expect(intervalDesign).toContain(url);
    }
    expect(decision).toContain("profile and parametric bootstrap interval report");
    expect(decision).toContain("61.25%・71.25%");
    expect(decision).toContain("automatic_interval = nothing");
    expect(decision).toContain("bootstrapが常にprofileを代替できるという意味ではありません");
  });

  it("selection-countを直感・手計算・実装・反例・演習の研究教材へ変換する", () => {
    const stages = [
      "400人をscreening",
      "人数だけの小さな手計算",
      "条件付き密度と人数情報を掛ける",
      "Juliaで1回のscreeningを再現する",
      "なぜWald区間が狭くなりすぎるのか",
      "選択率が合っても、モデル全体が合うとは限らない",
      "Wald・profile・bootstrapを一つの表で読む",
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
      "`search_limit`、`insufficient_success`、区間未解決",
      "Normal以外、境界誤指定、人数記録誤差",
      "本当は存在しない負値へ平均15.56%を予測",
      "境界幅を2倍に誤記録",
      "bootstrap fitは100%成功",
      "`sigma`は61.25%・71.25%",
    ]) {
      expect(teachingDraft, `${contract}が教材ドラフトにない`).toContain(contract);
    }
    expect(teachingDraft.match(/<details><summary>答えと理由<\/summary>/g)).toHaveLength(7);
    expect(selectionCount).toContain("selection_count_teaching_example");
    expect(selectionCount).toContain("P2_SELECTION_COUNT_TEACHING_EXAMPLE");
    expect(selectionCount).toContain("!interval_contains(teaching_example.wald.mu");
    expect(selectionCount).toContain("interval_contains(teaching_example.profile.mu");
    expect(read("src/data/lessons/catalog.js")).not.toContain("selection-count-likelihood");
    expect(decision).toContain("selection-count教材ドラフト");
  });

  it("観測契約から未解決statusと誤指定反例までを研究用Pluto Notebookで実行する", () => {
    for (const contract of [
      "### A Pluto.jl notebook ###",
      "Pkg.activate(@__DIR__)",
      "audit_selection_count_contract",
      ":missingness_confusion",
      ":boundary_posthoc",
      ":heterogeneous_boundary",
      ":dependent_rows",
      ":censoring_confusion",
      "fit_truncated_normal",
      "fit_selection_count_normal",
      "selection_count_interval_report",
      "automatic_interval = report.automatic_interval",
      "区間なし: bootstrap有効fit率不足",
      "family_misspecification_visible",
      "P2_SELECTION_COUNT_NOTEBOOK_PASS",
    ]) {
      expect(teachingNotebook).toContain(contract);
    }
    for (const url of [
      "plutojl.org/en/docs/packages-advanced",
      "plutojl.org/en/docs/reactivity",
      "plutojl.org/en/docs/files-open",
    ]) {
      expect(teachingNotebook).toContain(url);
    }
    for (const contract of [
      "EXPECTED_CELLS = 31",
      "P2_SELECTION_COUNT_NOTEBOOK_PASS",
      "Pluto.SessionActions.open",
      "errored=",
      "P2_SELECTION_COUNT_NOTEBOOK_EXEC_PASS",
    ]) {
      expect(notebookExec).toContain(contract);
    }
    expect(plutoWorkflow).toContain("Instantiate P2 likelihood feasibility environment");
    expect(plutoWorkflow).toContain("scripts/p2-selection-count-notebook-exec.jl");
    expect(read("src/data/lessons/catalog.js")).not.toContain("selection-count-likelihood");
    expect(decision).toContain("Research Pluto notebook");
    expect(decision).toContain("P2_SELECTION_COUNT_NOTEBOOK_EXEC_PASS");
  });

  it("Notebookの停止理由と未解決statusを非掲載の参加者向けWeb UI previewへ移す", () => {
    for (const contract of [
      "auditSelectionContract",
      "missingness_confusion",
      "boundary_posthoc",
      "heterogeneous_boundary",
      "dependent_rows",
      "censoring_confusion",
      "unresolved_profile",
      "unresolved_bootstrap",
      "family_misspecification_visible",
      "success_coverage_confusion",
    ]) {
      expect(uiModel).toContain(contract);
    }
    for (const contract of [
      'REPORT_SCHEMA_VERSION = "1.0.0"',
      "automatic_interval !== null",
      "toWebIntervalReports",
      "bootstrap_total_screened",
    ]) {
      expect(`${uiReport}\n${reportFixtureCsv}`).toContain(contract);
    }
    for (const contract of [
      'role="alert"',
      'role="status"',
      "fieldset",
      "観測契約を監査",
      "このpreviewは任意入力でfitを実行しません",
      "自動選択: なし",
      "次の行動:",
      "RESEARCH ONLY",
    ]) {
      expect(uiPreview).toContain(contract);
    }
    expect(uiHtml).toContain('name="robots" content="noindex,nofollow"');
    expect(uiHtml).toContain('name="referrer" content="no-referrer"');
    expect(viteConfig).toContain("p2ResearchParticipantPreview");
    expect(viteConfig).toContain('"validation/p2-likelihood/ui-preview.html"');
    expect(read("src/main.jsx")).not.toContain("p2-selection-count-preview");
    expect(read("src/data/lessons/catalog.js")).not.toContain("selection-count-likelihood");
    expect(uiE2e).toContain("観測契約・fit比較・未解決区間・誤答別feedback");
    expect(uiE2e).toContain("モバイル幅");
    expect(productionE2e).toContain("参加者向けP2研究previewを非掲載・合成データ限定で配布できる");
    expect(productionE2e).toContain("previewが外部originへ通信しない");
    expect(productionE2e).toContain('a[href*="validation/p2-likelihood"]');
    for (const url of [
      "w3.org/WAI/tutorials/forms/labels",
      "w3.org/WAI/tutorials/forms/validation",
      "w3.org/WAI/ARIA/apg/patterns/alert",
      "react.dev/reference/react-dom/components/input",
    ]) {
      expect(uiDesign).toContain(url);
    }
    expect(uiDesign).toContain("P2_SELECTION_COUNT_UI_PREVIEW_PASS");
  });

  it("Julia-Web schemaと未解決行をJSON・CSVでround tripする", () => {
    for (const contract of [
      'SCHEMA_VERSION = "1.0.0"',
      "validate_report_bundle",
      "flatten_report_bundle",
      "missingstring = \"NA\"",
      "automatic_interval = missing",
      "既存成果物を上書きしません",
      "bootstrap_total_screened",
      "bytes2hex(open(sha256",
    ]) {
      expect(reportIo).toContain(contract);
    }
    for (const contract of [
      "P2_SELECTION_COUNT_REPORT_IO_CHECK_PASS",
      "length(restored_rows) == 18",
      "unresolved_rows",
      "read_report_json",
      "read_report_csv",
    ]) {
      expect(reportIoCheck).toContain(contract);
    }
    expect(reportSchema).toContain("https://json-schema.org/draft/2020-12/schema");
    expect(reportSchema).toContain('"additionalProperties": false');
    expect(reportFixtureJson).toContain('"automatic_interval": null');
    expect(reportFixtureJson).toContain('"schema_version": "1.0.0"');
    expect(reportFixtureCsv).toContain("unresolvedProfile,unresolved_profile,NA");
    expect(reportFixtureCsv).toContain("bootstrap,insufficient_success,mu,NA,NA,10,99,28");
    for (const url of [
      "json-schema.org/draft/2020-12",
      "quinnj.github.io/JSON3.jl/dev",
      "csv.juliadata.org/dev/writing",
      "csv.juliadata.org/stable/reading",
    ]) {
      expect(reportIoDesign).toContain(url);
    }
  });

  it("実計算APIのrequest・timeout・認証・version境界を研究fixtureで固定する", () => {
    for (const contract of [
      "validate_api_request",
      "selected_countとselected_valuesの長さが一致しません",
      "request_sha256",
      "manifest_sha256",
      "execute_api_request",
      "API responseにはrequestごとに1 report",
      "観測契約を確認できないrequestは実行しません",
    ]) {
      expect(apiCore).toContain(contract);
    }
    for (const contract of [
      "P2_SELECTION_COUNT_API_BOUNDARY_CHECK_PASS",
      "request.input_contract.selected_count == 43",
      "validate_api_exchange",
      "bootstrap_repetitions = 98",
      "generated_at_utc = \"2026-08-10\"",
    ]) {
      expect(apiCheck).toContain(contract);
    }
    for (const contract of [
      'credentials: "same-origin"',
      'mode: "same-origin"',
      'cache: "no-store"',
      'redirect: "error"',
      "DEFAULT_API_TIMEOUT_MS = 120_000",
      "MAX_RESPONSE_BYTES = 1_048_576",
      "auth_required",
      "forbidden_or_csrf",
      "unsupported_version",
      "rate_limited",
      "silent_fallback_for_unmatched_input_forbidden",
    ]) {
      expect(apiClient).toContain(contract);
    }
    expect(apiRequestSchema).toContain("selection-count-api-request:1");
    expect(apiRequestSchema).toContain('"selected_values"');
    expect(apiResponseSchema).toContain('"request_sha256"');
    expect(apiResponseSchema).toContain('"$ref": "selection-count-report-v1.schema.json"');
    expect(apiRequestFixture).toContain('"request_id":"teaching-example-v1"');
    expect(apiResponseFixture).toContain('"project_environment": "validation/p2-likelihood"');
    expect(apiRegistry).toContain('"endpoint_status": "local_research_only"');
    expect(apiRegistry).toContain('"minimum_successor_overlap_days_after_public_release": 180');
    for (const url of [
      "fetch.spec.whatwg.org",
      "dom.spec.whatwg.org/#interface-abortcontroller",
      "rfc-editor.org/rfc/rfc8594",
      "rfc-editor.org/rfc/rfc9110",
    ]) {
      expect(apiDesign).toContain(url);
    }
    expect(apiDesign).toContain("public endpoint not deployed");
  });

  it("loopback・合成fixture限定のHTTP経路を停止可能な別processで実行する", () => {
    for (const contract of [
      "HTTP.listen!",
      'host == "127.0.0.1"',
      "MAX_BODY_BYTES = 1_048_576",
      "max_header_bytes = 32 * 1024",
      "allowed_request_sha256",
      'HTTP.header(request, "Sec-Fetch-Site", nothing)',
      "constant_time_equal",
      "httponly = true",
      "samesite = :strict",
      "max_concurrent_jobs == 1",
      "timedwait",
      "Base.SIGKILL",
      "stderr = devnull",
      "mktempdir",
      "chmod(request_path, 0o600)",
      '"synthetic_fixture_only"',
    ]) {
      expect(localServer).toContain(contract);
    }
    expect(apiWorker).toContain("execute_api_request");
    expect(apiWorker).toContain("bytes = read(stdin)");
    expect(localServerRunner).toContain("allowed-originはloopback HTTP originに限定します");
    expect(localServerCheck).toContain("P2_SELECTION_COUNT_LOCAL_SERVER_CHECK_PASS");
    expect(localServerCheck).toContain("MAX_BODY_BYTES + 1");
    expect(localServerCheck).toContain("missing_fetch_metadata");
    expect(localServerCheck).toContain("worker timeout becomes 504");
    expect(localApiPlaywright).toContain("scripts/run-p2-selection-count-local-server.jl");
    expect(localApiPlaywright).toContain("P2_LOCAL_API_TARGET=http://127.0.0.1:43923");
    expect(localApiE2e).toContain("browser→same-origin proxy→Julia server→期限付きJulia worker");
    expect(localApiE2e).toContain("document.cookie");
    expect(localApiE2e).toContain('not.toContain("p2_session")');
    expect(apiClient).toContain("createLocalResearchSession");
    expect(apiClient).toContain('credentials: "same-origin"');
    expect(uiPreview).toContain("localSessionEndpoint");
  });

  it("初学者利用者テストを未実施のままprotocol・rubric・privacy境界だけ事前固定する", () => {
    for (const contract of [
      "protocol ready / no participant sessions completed / research only",
      "4〜8人",
      "formative round",
      "confirmation round",
      "今日はあなたではなく教材をテストします",
      "`missingness`または`unresolved_interval`でscore 2が100%未満",
      "実観察票をrepository／Dropboxへ保存しない",
      "external telemetry、analytics、session replayは導入しない",
    ]) {
      expect(usabilityProtocol).toContain(contract);
    }
    for (const url of [
      "gov.uk/service-manual/user-research/using-moderated-usability-testing",
      "w3.org/WAI/test-evaluate/involving-users",
      "w3.org/WAI/WCAG22/Understanding/labels-or-instructions",
      "w3.org/WAI/WCAG22/Understanding/error-identification",
    ]) {
      expect(usabilityProtocol).toContain(url);
    }
    expect(usabilityObservationSchema).toContain("learner-usability-observation:1");
    expect(usabilityObservationSchema).toContain('"recording": { "const": "none" }');
    expect(usabilityObservationSchema).toContain('"contains_direct_identifiers": { "const": false }');
    expect(usabilitySummarySchema).toContain("learner-usability-round-summary:1");
    expect(usabilitySummarySchema).toContain('"confirmation_candidate"');
    expect(usabilityObservationExample).toContain('"record_kind": "synthetic_example"');
    expect(usabilitySummaryExample).toContain('"decision": "revise_retest"');
    expect(usabilityCheck).toContain("actual_participant_records = count(");
    expect(usabilityCheck).toContain("@test actual_participant_records == 0");
    expect(usabilityCheck).toContain("P2_LEARNER_USABILITY_PROTOCOL_CHECK_PASS");
  });

  it("CI・research roadmap・依存cost記録を同期する", () => {
    const runner = read("scripts/run-numeric-checks.jl");
    const research = read(".github/workflows/p2-research.yml");
    const roadmap = read("public/roadmap.html");
    expect(runner).toContain('"scripts/p2-likelihood-check.jl"');
    expect(runner).toContain('"scripts/p2-likelihood-stress-check.jl"');
    expect(runner).toContain('"scripts/p2-identification-profile-check.jl"');
    expect(runner).toContain('"scripts/p2-generalization-engine-check.jl"');
    expect(runner).toContain('"scripts/p2-two-sided-identification-check.jl"');
    expect(runner).toContain('"scripts/p2-selection-count-check.jl"');
    expect(runner).toContain('"scripts/p2-selection-count-robustness-check.jl"');
    expect(runner).toContain('"scripts/p2-selection-count-interval-check.jl"');
    expect(runner).toContain('"scripts/p2-selection-count-report-io-check.jl"');
    expect(runner).toContain('"scripts/p2-selection-count-api-boundary-check.jl"');
    expect(runner).toContain('"scripts/p2-selection-count-local-server-check.jl"');
    expect(runner).toContain('"scripts/p2-learner-usability-protocol-check.jl"');
    expect(runner).toContain('"validation", "p2-likelihood"');
    expect(research).toContain("scripts/run-numeric-checks.jl --p2");
    expect(research).toContain("npm run test:p2-api");
    expect(research).toContain("Install SciPy independent reference environment");
    expect(research).toContain("Instantiate P2 likelihood feasibility environment");
    expect(roadmap).toContain('data-strategy-status="research"');
    expect(roadmap).toContain("P2_LIKELIHOOD_CHECK_PASS");
    expect(roadmap).toContain("P2_LIKELIHOOD_STRESS_CHECK_PASS");
    expect(roadmap).toContain("P2_IDENTIFICATION_PROFILE_CHECK_PASS");
    expect(roadmap).toContain("P2_GENERALIZATION_ENGINE_CHECK_PASS");
    expect(roadmap).toContain("P2_TWO_SIDED_IDENTIFICATION_CHECK_PASS");
    expect(roadmap).toContain("P2_SELECTION_COUNT_CHECK_PASS");
    expect(roadmap).toContain("P2_SELECTION_COUNT_ROBUSTNESS_CHECK_PASS");
    expect(roadmap).toContain("P2_SELECTION_COUNT_INTERVAL_CHECK_PASS");
    expect(roadmap).toContain("P2_SELECTION_COUNT_NOTEBOOK_EXEC_PASS");
    expect(roadmap).toContain("P2_SELECTION_COUNT_UI_PREVIEW_PASS");
    expect(roadmap).toContain("TEACHING_DRAFT");
    expect(decision).toContain("research only / unlisted participant preview public / not a public lesson API");
    expect(decision).toContain("98.8秒、250.1MB");
    expect(decision).toContain("Manifest entries: 96");
    expect(roadmap).toContain("P2_SELECTION_COUNT_REPORT_IO_CHECK_PASS");
    expect(roadmap).toContain("P2_SELECTION_COUNT_API_BOUNDARY_CHECK_PASS");
    expect(roadmap).toContain("P2_SELECTION_COUNT_LOCAL_SERVER_CHECK_PASS");
    expect(roadmap).toContain("P2_LEARNER_USABILITY_PROTOCOL_CHECK_PASS");
    expect(roadmap).toContain("P2_PARTICIPANT_PREVIEW_BUILD_PASS");
    expect(roadmap).toContain("USABILITY_PROTOCOL_READY");
    expect(roadmap).toContain("PARTICIPANT_PREVIEW_PUBLIC");
    expect(roadmap).toContain("NO_TELEMETRY");
    expect(read("scripts/p2-clean-install-measure.jl")).toContain("mktempdir");
  });
});
