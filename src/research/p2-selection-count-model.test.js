import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTRACT_PRESETS,
  DEFAULT_CONTRACT,
  INTERVAL_REPORTS,
  MISSPECIFICATION_FIXTURE,
  TEACHING_QUESTIONS,
  auditSelectionContract,
  evaluateTeachingAnswer,
  intervalReportFeedback,
  matchesFixedTeachingContract,
} from "./p2-selection-count-model.js";
import {
  REPORT_SCHEMA_ID,
  REPORT_SCHEMA_VERSION,
  SELECTION_COUNT_REPORT_FIXTURE,
  toWebIntervalReports,
  validateSelectionCountReportBundle,
} from "./p2-selection-count-report.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");

describe("P2 selection-count research UI contract", () => {
  it("固定例と未測定を分離した例だけを解析入口へ通す", () => {
    const ready = auditSelectionContract(DEFAULT_CONTRACT);
    expect(ready).toMatchObject({ status: "ready", issues: [] });
    expect(matchesFixedTeachingContract(DEFAULT_CONTRACT)).toBe(true);

    const unmeasured = CONTRACT_PRESETS.validUnmeasured.contract;
    const audited = auditSelectionContract(unmeasured);
    expect(audited.status).toBe("ready");
    expect(audited.notes).toEqual([
      "未測定100人は範囲外人数へ混ぜず、N=400からも除いています。",
    ]);
    expect(matchesFixedTeachingContract(unmeasured)).toBe(true);
  });

  it("観測過程の誤りを一つの入力エラーへ潰さない", () => {
    const expected = {
      missingness: "missingness_confusion",
      posthoc: "boundary_posthoc",
      heterogeneous: "heterogeneous_boundary",
      repeated: "dependent_rows",
      censored: "censoring_confusion",
    };
    for (const [preset, code] of Object.entries(expected)) {
      const result = auditSelectionContract(CONTRACT_PRESETS[preset].contract);
      expect(result.status, preset).toBe("stop");
      expect(result.issues, preset).toHaveLength(1);
      expect(result.issues[0].code, preset).toBe(code);
      expect(result.issues[0].nextAction.length, preset).toBeGreaterThan(10);
    }
  });

  it("人数の型・符号・二つの加法契約を別々に検査する", () => {
    expect(auditSelectionContract({ ...DEFAULT_CONTRACT, totalScreened: "400" }).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "count_type" })]));
    expect(auditSelectionContract({ ...DEFAULT_CONTRACT, notScreened: -1 }).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "negative_count" })]));
    expect(auditSelectionContract({ ...DEFAULT_CONTRACT, totalRecruited: 401 }).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "recruitment_count_mismatch" })]));
    expect(auditSelectionContract({ ...DEFAULT_CONTRACT, totalScreened: 401, totalRecruited: 401 }).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "screening_count_mismatch" })]));
  });

  it("三つのinterval状態で自動区間を常に空に保つ", () => {
    for (const report of Object.values(INTERVAL_REPORTS)) {
      expect(report.automaticInterval).toBeNull();
      const feedback = intervalReportFeedback(report);
      expect(feedback.messages.length).toBeGreaterThanOrEqual(2);
    }
    expect(intervalReportFeedback(INTERVAL_REPORTS.unresolvedProfile).label)
      .toBe("区間なし: profile未解決");
    expect(intervalReportFeedback(INTERVAL_REPORTS.unresolvedBootstrap).label)
      .toBe("区間なし: bootstrap有効fit率不足");
    expect(INTERVAL_REPORTS.unresolvedProfile.methods.profile.mu).toBeNull();
    expect(INTERVAL_REPORTS.unresolvedBootstrap.methods.bootstrap.sigma).toBeNull();
    expect(INTERVAL_REPORTS.review.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
    expect(INTERVAL_REPORTS.unresolvedBootstrap.methods.bootstrap.totalScreened).toBe(10);
  });

  it("Julia生成fixtureをversioned schemaで検査してWeb表へ変換する", () => {
    expect(validateSelectionCountReportBundle(SELECTION_COUNT_REPORT_FIXTURE)).toBe(true);
    expect(SELECTION_COUNT_REPORT_FIXTURE.schema_id).toBe(REPORT_SCHEMA_ID);
    const reports = toWebIntervalReports(SELECTION_COUNT_REPORT_FIXTURE);
    expect(Object.keys(reports)).toEqual(["review", "unresolvedProfile", "unresolvedBootstrap"]);
    expect(reports.review.methods.bootstrap).toMatchObject({
      repetitions: 499,
      successes: 499,
      successRate: 1,
    });
    expect(reports.unresolvedProfile.methods.profile).toMatchObject({
      status: "search_limit",
      mu: null,
      sigma: null,
    });
  });

  it("schema version・自動選択・未解決端点の改変を拒否する", () => {
    const clone = () => JSON.parse(JSON.stringify(SELECTION_COUNT_REPORT_FIXTURE));
    const wrongVersion = clone();
    wrongVersion.schema_version = "2.0.0";
    expect(() => validateSelectionCountReportBundle(wrongVersion)).toThrow("未対応schema_version");

    const automatic = clone();
    automatic.reports[0].automatic_interval = "wald";
    expect(() => validateSelectionCountReportBundle(automatic)).toThrow("automatic_interval");

    const zeroFilled = clone();
    zeroFilled.reports[1].methods[1].intervals[0] = { parameter: "mu", lower: 0, upper: 0 };
    expect(() => validateSelectionCountReportBundle(zeroFilled)).toThrow("null");
  });

  it("数値成功とcoverageを分ける誤答別feedbackを持つ", () => {
    for (const question of TEACHING_QUESTIONS) {
      expect(question.options.filter((option) => option.correct)).toHaveLength(1);
      for (const option of question.options) {
        expect(option.code.length).toBeGreaterThan(5);
        expect(option.feedback.length).toBeGreaterThan(10);
        expect(option.nextAction.length).toBeGreaterThan(10);
      }
    }
    expect(evaluateTeachingAnswer("bootstrap-coverage", "auto-bootstrap"))
      .toMatchObject({ correct: false, code: "success_coverage_confusion" });
    expect(evaluateTeachingAnswer("bootstrap-coverage", "compare"))
      .toMatchObject({ correct: true, code: "correct_interval_review" });
  });

  it("family誤指定fixtureは選択率一致とsupport破綻を同時に保持する", () => {
    expect(Math.abs(
      MISSPECIFICATION_FIXTURE.observedSelectionRate -
      MISSPECIFICATION_FIXTURE.fittedSelectionRate
    )).toBeLessThan(0.001);
    expect(MISSPECIFICATION_FIXTURE.probabilityBelowZero).toBeGreaterThan(0.05);
    expect(MISSPECIFICATION_FIXTURE.q95Ratio).toBeLessThan(0.7);
    expect(MISSPECIFICATION_FIXTURE.status).toBe("family_misspecification_visible");
  });

  it("previewをproduction entry・公開catalog・public directoryから隔離する", () => {
    expect(read("src/main.jsx")).not.toContain("p2-selection-count-preview");
    expect(read("src/data/lessons/catalog.js")).not.toContain("selection-count-likelihood");
    expect(read("src/index.css")).toContain('@source not "./research";');
    const html = read("validation/p2-likelihood/ui-preview.html");
    expect(html).toContain('name="robots" content="noindex,nofollow"');
    expect(html).toContain("/src/research/p2-selection-count-preview-main.jsx");
    const previewMain = read("src/research/p2-selection-count-preview-main.jsx");
    expect(previewMain).toContain('import "./p2-preview.css";');
    expect(previewMain).not.toContain('import "../index.css";');
    expect(previewMain).toContain("createRoot(root).render");
    expect(read("src/research/p2-preview.css")).toContain('@import "tailwindcss";');
  });
});
