// P2 research-only Web UI data contract. This module is not imported by the
// production app or lesson catalog.
// Official references checked 2026-08-09:
// https://www.w3.org/WAI/tutorials/forms/labels/
// https://www.w3.org/WAI/tutorials/forms/validation/
// https://react.dev/reference/react-dom/components/input
import { INTERVAL_REPORTS } from "./p2-selection-count-report.js";

export { INTERVAL_REPORTS };

export const DEFAULT_CONTRACT = Object.freeze({
  totalRecruited: 400,
  totalScreened: 400,
  selectedCount: 43,
  excludedOutside: 357,
  notScreened: 0,
  boundaryPrecommitted: true,
  sameBoundary: true,
  samePopulation: true,
  independentRows: true,
  exactSelectedValues: true,
  excludedConfirmedOutside: true,
});

export const COUNT_FIELDS = Object.freeze([
  { key: "totalRecruited", label: "募集総数", help: "研究へ募集した人数" },
  { key: "totalScreened", label: "screening総数 N", help: "同じ規則で実際に測定できた人数" },
  { key: "selectedCount", label: "選択数 m", help: "境界内で正確な値がある人数" },
  { key: "excludedOutside", label: "確認済み範囲外人数", help: "個々の値は使わないが範囲外と確認できた人数" },
  { key: "notScreened", label: "未測定人数", help: "未参加・故障・同意撤回など、範囲外とは確認できない人数" },
]);

export const BOOLEAN_FIELDS = Object.freeze([
  { key: "boundaryPrecommitted", label: "境界はdataを見る前に固定した" },
  { key: "sameBoundary", label: "全員へ同じ境界を使った" },
  { key: "samePopulation", label: "全員が同じ解析対象集団に属する" },
  { key: "independentRows", label: "同一人物を複数の独立人数として数えていない" },
  { key: "exactSelectedValues", label: "選択された人には境界値ではなく正確な値がある" },
  { key: "excludedConfirmedOutside", label: "N−m人は全員、範囲外だったと確認できる" },
]);

const issue = (code, message, nextAction) => ({ code, message, nextAction });

export function auditSelectionContract(contract) {
  const issues = [];
  const notes = [];
  const counts = COUNT_FIELDS.map(({ key }) => contract[key]);
  const validIntegerCounts = counts.every(
    (value) => Number.isInteger(value) && typeof value !== "boolean"
  );

  if (!validIntegerCounts) {
    issues.push(issue(
      "count_type",
      "人数は空欄や小数ではなく、0以上の整数で記録してください。",
      "各人数欄を原記録と照合し、整数へ修正して再監査します。"
    ));
  } else if (counts.some((value) => value < 0)) {
    issues.push(issue(
      "negative_count",
      "人数に負の値は使えません。",
      "集計式と符号を確認し、元の件数から作り直します。"
    ));
  } else {
    if (contract.totalRecruited !== contract.totalScreened + contract.notScreened) {
      issues.push(issue(
        "recruitment_count_mismatch",
        "募集総数がscreening総数と未測定人数の和に一致しません。",
        "募集台帳、測定記録、未測定理由を突合します。"
      ));
    }
    if (contract.totalScreened !== contract.selectedCount + contract.excludedOutside) {
      issues.push(issue(
        "screening_count_mismatch",
        "Nが選択数mと確認済み範囲外人数の和に一致しません。",
        "選択flagの重複・欠落を調べ、N = m + 範囲外人数を再集計します。"
      ));
    }
    if (contract.selectedCount < 2) {
      issues.push(issue(
        "too_few_selected",
        "parameter識別には選択値が少なくとも2件必要です。",
        "区間を返さず、選択規則または標本設計を見直します。"
      ));
    }
    if (contract.notScreened > 0) {
      notes.push(
        `未測定${contract.notScreened}人は範囲外人数へ混ぜず、N=${contract.totalScreened}からも除いています。`
      );
    }
  }

  const booleanChecks = [
    ["boundaryPrecommitted", "boundary_posthoc", "dataを見た後で決めた境界です。", "事前規則を復元できなければ、選択手順自体を別モデルとして扱います。"],
    ["sameBoundary", "heterogeneous_boundary", "施設・時点で境界が異なります。", "境界ごとのN、m、選択値へ層別し、単純合算を止めます。"],
    ["samePopulation", "population_mismatch", "異なる解析対象集団を一つのNへ合算しています。", "対象集団を定義し直し、集団別の集計を残します。"],
    ["independentRows", "dependent_rows", "同一人物の反復測定を独立な人数として数えています。", "個人IDと時点を復元し、依存構造を持つ別モデルを検討します。"],
    ["exactSelectedValues", "censoring_confusion", "選択値が境界値へ置換されています。", "truncationではなくcensoringのflagと尤度へ切り替えます。"],
    ["excludedConfirmedOutside", "missingness_confusion", "範囲外と未測定・故障・同意撤回が混ざっています。", "除外理由を分離し、範囲外と確認できた人数だけをN−mへ入れます。"],
  ];
  for (const [key, code, message, nextAction] of booleanChecks) {
    if (contract[key] !== true) issues.push(issue(code, message, nextAction));
  }

  return {
    status: issues.length === 0 ? "ready" : "stop",
    issues,
    notes,
  };
}

export const CONTRACT_PRESETS = Object.freeze({
  ready: {
    label: "固定合成例",
    contract: { ...DEFAULT_CONTRACT },
  },
  validUnmeasured: {
    label: "未測定を分離",
    contract: { ...DEFAULT_CONTRACT, totalRecruited: 500, notScreened: 100 },
  },
  missingness: {
    label: "欠測を混同",
    contract: { ...DEFAULT_CONTRACT, excludedConfirmedOutside: false },
  },
  posthoc: {
    label: "境界を後付け",
    contract: { ...DEFAULT_CONTRACT, boundaryPrecommitted: false },
  },
  heterogeneous: {
    label: "施設で境界違い",
    contract: { ...DEFAULT_CONTRACT, sameBoundary: false },
  },
  repeated: {
    label: "反復測定を人数化",
    contract: { ...DEFAULT_CONTRACT, independentRows: false },
  },
  censored: {
    label: "境界値へ置換",
    contract: { ...DEFAULT_CONTRACT, exactSelectedValues: false },
  },
});

export function matchesFixedTeachingContract(contract) {
  return contract.totalScreened === 400 &&
    contract.selectedCount === 43 &&
    contract.excludedOutside === 357 &&
    BOOLEAN_FIELDS.every(({ key }) => contract[key] === true);
}

export const FIXED_FIT_COMPARISON = Object.freeze([
  { method: "simulationの真値", mu: 37, sigma: 1.7, status: "reference" },
  { method: "選択後43件だけ", mu: -344332.488, sigma: 536.734, status: "catastrophic" },
  { method: "selection-count", mu: 36.038, sigma: 0.928, status: "fit" },
]);

export function intervalReportFeedback(report) {
  if (report.status === "review_profile_and_bootstrap") {
    return {
      tone: "review",
      label: "要比較: 自動採用なし",
      messages: [
        "Waldは局所近似です。profileとbootstrapを並べます。",
        "計算成功率だけでなく、反復coverageの根拠を確認します。",
      ],
    };
  }
  if (report.status === "unresolved_profile") {
    return {
      tone: "stop",
      label: "区間なし: profile未解決",
      messages: [
        "profile端点を探索範囲内で確定できませんでした。",
        "Waldやbootstrapを自動fallbackとして採用しません。",
      ],
    };
  }
  if (report.status === "unresolved_bootstrap") {
    return {
      tone: "stop",
      label: "区間なし: bootstrap有効fit率不足",
      messages: [
        "bootstrap有効fit率が事前の最低値へ届きませんでした。",
        "missing区間は効果0ではなく、報告不能を表します。",
      ],
    };
  }
  throw new Error(`未登録のinterval statusです: ${report.status}`);
}

export const MISSPECIFICATION_FIXTURE = Object.freeze({
  trueFamily: "LogNormal(0, 0.8)",
  fittedFamily: "Normal専用fit",
  selected: 414,
  observedSelectionRate: 0.1035,
  fittedSelectionRate: 0.103529,
  probabilityBelowZero: 0.169437,
  q95Ratio: 0.456689,
  status: "family_misspecification_visible",
});

export const TEACHING_QUESTIONS = Object.freeze([
  {
    id: "denominator",
    prompt: "500人を募集し、100人は未測定、測定できた400人中43人が範囲内でした。この尤度のNは？",
    options: [
      {
        id: "all-recruited",
        label: "500",
        correct: false,
        code: "missingness_confusion",
        feedback: "未測定100人を範囲外だったとみなしています。",
        nextAction: "N=400とし、未測定100人は別の理由として保存します。",
      },
      {
        id: "screened",
        label: "400",
        correct: true,
        code: "correct_denominator",
        feedback: "同じ規則で実際にscreeningできた400人がNです。",
        nextAction: "m=43、確認済み範囲外=357との整合も確認します。",
      },
      {
        id: "selected",
        label: "43",
        correct: false,
        code: "selected_count_confusion",
        feedback: "43は選択数mで、選別前総数Nではありません。",
        nextAction: "N、m、N−mを別々の列へ記録します。",
      },
    ],
  },
  {
    id: "bootstrap-coverage",
    prompt: "bootstrap fitは100%成功しましたが、sigmaの95%区間coverageは61.25%でした。どう扱いますか？",
    options: [
      {
        id: "auto-bootstrap",
        label: "成功率100%なのでbootstrap区間を自動採用する",
        correct: false,
        code: "success_coverage_confusion",
        feedback: "数値を返せた割合と、真値を含んだ割合を混同しています。",
        nextAction: "coverage結果を併記し、automatic intervalを空のままにします。",
      },
      {
        id: "compare",
        label: "profileと並べ、どちらも自動採用しない",
        correct: true,
        code: "correct_interval_review",
        feedback: "計算状態と反復校正を分けた判断です。",
        nextAction: "未解決statusとdesign別coverageを結果表へ残します。",
      },
      {
        id: "zero-effect",
        label: "coverage不足は効果が0という意味なので区間を0にする",
        correct: false,
        code: "missing_zero_confusion",
        feedback: "未校正やmissingは、parameterが0という結論ではありません。",
        nextAction: "区間なしと効果なしを別statusで保存します。",
      },
    ],
  },
  {
    id: "family-support",
    prompt: "LogNormal dataへのNormal fitが選択率を再現した一方、負値へ16.9%を予測しました。何が必要ですか？",
    options: [
      {
        id: "accept-rate",
        label: "選択率が合ったのでNormalを採用する",
        correct: false,
        code: "selection_rate_only",
        feedback: "観測範囲への一致だけで、潜在supportとtailを保証しています。",
        nextAction: "未観測領域のsupport、分位点、tail予測を診断します。",
      },
      {
        id: "diagnose-family",
        label: "Normal専用scopeを停止し、familyとsupportを再検討する",
        correct: true,
        code: "correct_family_review",
        feedback: "正値supportを破る予測はfamily誤指定の具体的反例です。",
        nextAction: "別familyは独立したparameter回復試験を通してから追加します。",
      },
      {
        id: "clamp-negative",
        label: "予測した負値だけ0へ置換する",
        correct: false,
        code: "posthoc_prediction_clamp",
        feedback: "出力だけを後からclampすると、fitした確率モデルとは別物になります。",
        nextAction: "supportを満たす生成分布からモデルを組み直します。",
      },
    ],
  },
]);

export function evaluateTeachingAnswer(questionId, optionId) {
  const question = TEACHING_QUESTIONS.find((candidate) => candidate.id === questionId);
  if (!question) throw new Error(`未登録のquestionです: ${questionId}`);
  const option = question.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new Error(`未登録のoptionです: ${optionId}`);
  return option;
}
