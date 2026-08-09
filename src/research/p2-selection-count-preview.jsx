import { useMemo, useState } from "react";
import { C, GLOBAL_CSS, JP, MONO } from "../theme.js";
import {
  BOOLEAN_FIELDS,
  CONTRACT_PRESETS,
  COUNT_FIELDS,
  DEFAULT_CONTRACT,
  FIXED_FIT_COMPARISON,
  INTERVAL_REPORTS,
  MISSPECIFICATION_FIXTURE,
  TEACHING_QUESTIONS,
  auditSelectionContract,
  evaluateTeachingAnswer,
  intervalReportFeedback,
  matchesFixedTeachingContract,
} from "./p2-selection-count-model.js";
import {
  API_REQUEST_FIXTURE,
  API_SCHEMA_VERSION,
  DEFAULT_API_TIMEOUT_MS,
  P2_API_VERSION_REGISTRY,
  REPORT_SCHEMA_VERSION,
  createLocalResearchSession,
  loadReportWithExplicitFixtureFallback,
} from "./p2-selection-count-api.js";
import reportJsonUrl from "../../validation/p2-likelihood/fixtures/selection-count-report-v1.json?url";
import reportCsvUrl from "../../validation/p2-likelihood/fixtures/selection-count-report-v1.csv?url";

const cardStyle = {
  background: "#FFFFFF",
  border: `1px solid ${C.line}`,
  boxShadow: "0 1px 2px rgba(42,39,51,0.04)",
};

function SectionCard({ title, eyebrow, children }) {
  return (
    <section className="rounded-2xl p-5 sm:p-7" style={cardStyle}>
      <p className="text-xs font-bold tracking-widest" style={{ color: C.purpleDeep, fontFamily: MONO }}>
        {eyebrow}
      </p>
      <h2 className="mt-1 text-xl font-bold" style={{ color: C.ink }}>{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function StatusBadge({ children, tone = "neutral" }) {
  const palette = tone === "stop"
    ? { background: C.redSoft, color: C.redText, border: C.red }
    : tone === "ready"
      ? { background: C.greenSoft, color: C.greenText, border: C.green }
      : { background: C.purpleSoft, color: C.purpleDeep, border: C.purple };
  return (
    <span
      className="inline-flex rounded-full px-3 py-1 text-xs font-bold"
      style={{ background: palette.background, color: palette.color, border: `1px solid ${palette.border}` }}
    >
      {children}
    </span>
  );
}

function AuditPanel({ audit }) {
  if (!audit) {
    return (
      <div role="status" className="mt-5 rounded-xl p-4" style={{ background: C.purpleSoft, color: C.purpleDeep }}>
        入力が変更されました。「観測契約を監査」を押して結果を更新してください。
      </div>
    );
  }
  if (audit.status === "ready") {
    return (
      <div role="status" aria-live="polite" className="mt-5 rounded-xl p-4" style={{ background: C.greenSoft, border: `1px solid ${C.green}` }}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone="ready">解析入口を通過</StatusBadge>
          <strong style={{ color: C.greenText }}>人数と観測規則の契約は整合しています。</strong>
        </div>
        {audit.notes.map((note) => <p key={note} className="mt-2 text-sm" style={{ color: "#2E5626" }}>{note}</p>)}
      </div>
    );
  }
  return (
    <div role="alert" className="mt-5 rounded-xl p-4" style={{ background: C.redSoft, border: `1px solid ${C.red}` }}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="stop">fit停止</StatusBadge>
        <strong style={{ color: C.redText }}>観測契約を修正するまで推定へ進みません。</strong>
      </div>
      <ul className="mt-3 space-y-3">
        {audit.issues.map((item) => (
          <li key={item.code} className="rounded-lg bg-white p-3 text-sm" style={{ border: `1px solid ${C.line}` }}>
            <code className="font-bold" style={{ color: C.redText }}>{item.code}</code>
            <p className="mt-1" style={{ color: C.body }}>{item.message}</p>
            <p className="mt-1" style={{ color: C.sub }}><strong>次の行動:</strong> {item.nextAction}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContractForm({ contract, setContract, audit, setAudit }) {
  const update = (key, value) => {
    setContract((current) => ({ ...current, [key]: value }));
    setAudit(null);
  };
  const usePreset = (preset) => {
    const next = { ...preset.contract };
    setContract(next);
    setAudit(auditSelectionContract(next));
  };
  return (
    <>
      <p className="text-sm leading-7" style={{ color: C.body }}>
        これは入力表の操作性を調べる試作です。入力は送信・保存されず、ブラウザ内で監査規則だけを実行します。
      </p>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="観測契約の例">
        {Object.values(CONTRACT_PRESETS).map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => usePreset(preset)}
            className="min-h-11 rounded-full px-4 py-2 text-sm font-bold"
            style={{ background: C.purpleSoft, color: C.purpleDeep, border: `1px solid ${C.purple}` }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <form
        className="mt-5 space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          setAudit(auditSelectionContract(contract));
        }}
      >
        <fieldset>
          <legend className="text-base font-bold" style={{ color: C.ink }}>人数の記録</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {COUNT_FIELDS.map((field) => (
              <div key={field.key}>
                <label htmlFor={`p2-${field.key}`} className="block text-sm font-bold" style={{ color: C.body }}>
                  {field.label}
                </label>
                <input
                  id={`p2-${field.key}`}
                  name={field.key}
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="0"
                  value={contract[field.key]}
                  onChange={(event) => update(
                    field.key,
                    event.target.value === "" ? "" : Number(event.target.value)
                  )}
                  aria-describedby={`p2-${field.key}-help`}
                  className="mt-1 min-h-11 w-full rounded-xl px-3 py-2 text-base"
                  style={{ border: `1.5px solid ${C.edge}`, color: C.ink, fontFamily: MONO }}
                />
                <p id={`p2-${field.key}-help`} className="mt-1 text-xs leading-5" style={{ color: C.sub }}>
                  {field.help}
                </p>
              </div>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-base font-bold" style={{ color: C.ink }}>観測規則</legend>
          <div className="mt-3 grid gap-2">
            {BOOLEAN_FIELDS.map((field) => (
              <label key={field.key} htmlFor={`p2-${field.key}`} className="flex min-h-11 items-start gap-3 rounded-xl p-3" style={{ border: `1px solid ${C.line}` }}>
                <input
                  id={`p2-${field.key}`}
                  name={field.key}
                  type="checkbox"
                  checked={contract[field.key]}
                  onChange={(event) => update(field.key, event.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0"
                />
                <span className="text-sm leading-6" style={{ color: C.body }}>{field.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="submit"
          className="min-h-11 rounded-xl px-5 py-3 text-sm font-bold text-white"
          style={{ background: C.purpleDeep }}
        >
          観測契約を監査
        </button>
      </form>
      <AuditPanel audit={audit} />
    </>
  );
}

const formatEstimate = (value) => Math.abs(value) >= 10_000
  ? value.toLocaleString("ja-JP", { maximumFractionDigits: 3 })
  : value.toFixed(3);

function FitComparison({ visible }) {
  if (!visible) {
    return (
      <div role="status" className="rounded-xl p-4" style={{ background: C.purpleSoft, color: C.purpleDeep }}>
        このpreviewは任意入力でfitを実行しません。固定合成例（N=400、m=43）の契約を通すと、検証済み結果表を表示します。
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
        <caption className="mb-3 text-left leading-6" style={{ color: C.sub }}>
          Normal(37, 1.7)から中央10%を選んだ固定seed合成例。ブラウザでは再推定していません。
        </caption>
        <thead>
          <tr style={{ borderBottom: `2px solid ${C.edge}` }}>
            <th className="px-3 py-2">方法</th><th className="px-3 py-2">mu</th><th className="px-3 py-2">sigma</th><th className="px-3 py-2">読み方</th>
          </tr>
        </thead>
        <tbody>
          {FIXED_FIT_COMPARISON.map((row) => (
            <tr key={row.method} style={{ borderBottom: `1px solid ${C.line}` }}>
              <th scope="row" className="px-3 py-3">{row.method}</th>
              <td className="px-3 py-3" style={{ fontFamily: MONO }}>{formatEstimate(row.mu)}</td>
              <td className="px-3 py-3" style={{ fontFamily: MONO }}>{formatEstimate(row.sigma)}</td>
              <td className="px-3 py-3">
                {row.status === "catastrophic" ? <StatusBadge tone="stop">破局的逸脱</StatusBadge> :
                  row.status === "fit" ? <StatusBadge tone="ready">人数情報あり</StatusBadge> :
                    <StatusBadge>simulationのみ</StatusBadge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const formatInterval = (interval) => interval ? `${interval[0].toFixed(3)} – ${interval[1].toFixed(3)}` : "—（区間なし）";

function IntervalPanel() {
  const [mode, setMode] = useState("review");
  const report = INTERVAL_REPORTS[mode];
  const feedback = intervalReportFeedback(report);
  const methods = [
    ["Wald", report.methods.wald],
    ["profile", report.methods.profile],
    ["parametric bootstrap", report.methods.bootstrap],
  ];
  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="区間reportの状態">
        {[
          ["review", "三方式を比較"],
          ["unresolvedProfile", "profile未解決"],
          ["unresolvedBootstrap", "bootstrap未解決"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={mode === key}
            onClick={() => setMode(key)}
            className="min-h-11 rounded-full px-4 py-2 text-sm font-bold"
            style={mode === key
              ? { background: C.purpleDeep, color: "#FFFFFF" }
              : { background: "#FFFFFF", color: C.purpleDeep, border: `1px solid ${C.purple}` }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role={feedback.tone === "stop" ? "alert" : "status"}
        className="mt-4 rounded-xl p-4"
        style={{
          background: feedback.tone === "stop" ? C.redSoft : C.purpleSoft,
          border: `1px solid ${feedback.tone === "stop" ? C.red : C.purple}`,
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={feedback.tone === "stop" ? "stop" : "neutral"}>{feedback.label}</StatusBadge>
          <code style={{ color: C.sub }}>{report.status}</code>
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm" style={{ color: C.body }}>
          {feedback.messages.map((message) => <li key={message}>{message}</li>)}
        </ul>
        <p className="mt-3 text-sm font-bold" style={{ color: C.redText }}>
          自動選択: なし（automaticInterval = null）
        </p>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <caption className="mb-3 text-left" style={{ color: C.sub }}>
            schema v{report.schemaVersion}で読み込んだ固定合成例の95%区間と計算status
          </caption>
          <thead><tr style={{ borderBottom: `2px solid ${C.edge}` }}><th className="px-3 py-2">方法</th><th className="px-3 py-2">mu</th><th className="px-3 py-2">sigma</th><th className="px-3 py-2">status</th></tr></thead>
          <tbody>
            {methods.map(([label, method]) => (
              <tr key={label} style={{ borderBottom: `1px solid ${C.line}` }}>
                <th scope="row" className="px-3 py-3">{label}</th>
                <td className="px-3 py-3" style={{ fontFamily: MONO }}>{formatInterval(method.mu)}</td>
                <td className="px-3 py-3" style={{ fontFamily: MONO }}>{formatInterval(method.sigma)}</td>
                <td className="px-3 py-3"><StatusBadge tone={method.status === "ok" ? "ready" : "stop"}>{method.status}</StatusBadge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {report.methods.bootstrap.totalScreened !== report.inputContract.totalScreened && (
        <p role="alert" className="mt-3 rounded-xl p-3 text-sm" style={{ background: C.redSoft, color: C.redText }}>
          この未解決fixtureは、fit時のN={report.inputContract.totalScreened}に対し、bootstrap再生成N={report.methods.bootstrap.totalScreened}へ意図的に縮小した失敗例です。二つのNを同じ値として報告しません。
        </p>
      )}
      <div className="mt-4 rounded-xl p-4 text-sm" style={{ background: C.greenSoft, color: C.greenText }}>
        <p className="font-bold">Juliaから書き出した同一schemaのfixture</p>
        <p className="mt-1 leading-6">JSONは階層構造、CSVは3方法×2parameter×3状態の18行です。未解決端点は削除せず、JSONではnull、CSVではNAとして残します。</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={reportJsonUrl}
            download
            className="min-h-11 rounded-full px-4 py-3 font-bold underline"
          >JSON fixture</a>
          <a
            href={reportCsvUrl}
            download
            className="min-h-11 rounded-full px-4 py-3 font-bold underline"
          >CSV fixture</a>
        </div>
      </div>
    </>
  );
}

function ApiBoundaryPanel() {
  const runtimeConfig = globalThis.__P2_RESEARCH_API_CONFIG__ || {};
  const endpoint = runtimeConfig.endpoint || globalThis.__P2_RESEARCH_API_ENDPOINT__;
  const localSessionEndpoint = runtimeConfig.localSessionEndpoint;
  const [state, setState] = useState({ status: "idle", loaded: null, error: null });
  const policy = P2_API_VERSION_REGISTRY.policy;

  const checkBoundary = async () => {
    setState({ status: "loading", loaded: null, error: null });
    try {
      let csrfToken = document.querySelector('meta[name="p2-csrf-token"]')?.content || undefined;
      if (localSessionEndpoint) {
        const session = await createLocalResearchSession({ endpoint: localSessionEndpoint });
        csrfToken = session.csrf_token;
      }
      const loaded = await loadReportWithExplicitFixtureFallback({
        endpoint,
        request: API_REQUEST_FIXTURE,
        timeoutMs: DEFAULT_API_TIMEOUT_MS,
        csrfToken,
        allowFixtureFallback: true,
      });
      setState({ status: "done", loaded, error: null });
    } catch (error) {
      setState({ status: "error", loaded: null, error });
    }
  };

  const report = state.loaded?.response.report_bundle.reports[0];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={endpoint ? "neutral" : "stop"}>
          {endpoint ? "same-origin API候補あり" : "実計算API未配備"}
        </StatusBadge>
        <code style={{ color: C.sub }}>API v{API_SCHEMA_VERSION} / report v{REPORT_SCHEMA_VERSION}</code>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          ["requestに必要", "N・m・境界・選択された正確な値43件・観測仮定"],
          ["timeout", `${DEFAULT_API_TIMEOUT_MS / 1000}秒で中止し、未解決状態として表示`],
          ["認証境界", "same-origin HttpOnly session想定。Bearer secretをbrowserへ置かない"],
          ["response照合", "request ID・本文SHA-256・API/report版・入力echo"],
          ["現在の提供状態", P2_API_VERSION_REGISTRY.endpoint_status],
          ["公開後の版移行", `後継版との重複提供を最低${policy.minimum_successor_overlap_days_after_public_release}日`],
        ].map(([term, value]) => (
          <div key={term} className="rounded-lg p-3" style={{ background: C.purpleSoft }}>
            <dt className="text-xs font-bold" style={{ color: C.sub }}>{term}</dt>
            <dd className="mt-1 text-sm font-bold leading-6" style={{ color: C.ink }}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm leading-7" style={{ color: C.body }}>
        この操作で使う43件はJuliaが固定seedで生成した合成値です。APIが未構成・失敗した場合も、入力がこの合成requestと完全一致するときだけfixtureへ切り替え、切替理由を隠しません。
      </p>
      <button
        type="button"
        onClick={checkBoundary}
        disabled={state.status === "loading"}
        className="mt-4 min-h-11 rounded-xl px-5 py-3 text-sm font-bold disabled:opacity-60"
        style={{ background: C.purpleDeep, color: "#FFFFFF" }}
      >
        {state.status === "loading" ? "接続境界を確認中…" : "合成requestで接続境界を確認"}
      </button>
      {state.status === "idle" && (
        <div role="status" className="mt-4 rounded-xl p-4 text-sm" style={{ background: C.purpleSoft, color: C.purpleDeep }}>
          まだnetwork requestは行っていません。未配備環境ではボタンを押しても外部originへ送信しません。
        </div>
      )}
      {state.status === "loading" && (
        <div role="status" aria-live="polite" className="mt-4 rounded-xl p-4 text-sm" style={{ background: C.purpleSoft, color: C.purpleDeep }}>
          request schemaと同一originを検査しています。
        </div>
      )}
      {state.status === "done" && (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 rounded-xl p-4 text-sm"
          style={{
            background: state.loaded.source === "server" ? C.greenSoft : "#FFF7E8",
            border: `1px solid ${state.loaded.source === "server" ? C.green : "#F1DFB8"}`,
            color: state.loaded.source === "server" ? C.greenText : "#82590F",
          }}
        >
          <p className="font-bold">
            {state.loaded.source === "server"
              ? "server responseを照合しました"
              : "APIを使わず、合成fixtureへ明示的に切り替えました"}
          </p>
          <p className="mt-1 leading-6">
            request ID: <code>{state.loaded.response.request_id}</code> ／ report status: <code>{report.status}</code>
          </p>
          {state.loaded.transportError && (
            <p className="mt-1 leading-6">
              transport code: <code>{state.loaded.transportError.code}</code> — {state.loaded.transportError.message}
            </p>
          )}
        </div>
      )}
      {state.status === "error" && (
        <div role="alert" className="mt-4 rounded-xl p-4 text-sm" style={{ background: C.redSoft, color: C.redText }}>
          <p className="font-bold">API境界で停止しました</p>
          <p className="mt-1"><code>{state.error.code || "unknown_error"}</code> — {state.error.message}</p>
          <p className="mt-1">任意入力へ固定fixtureを流用せず、入力・認証・版を確認してください。</p>
        </div>
      )}
    </>
  );
}

function MisspecificationPanel() {
  const item = MISSPECIFICATION_FIXTURE;
  return (
    <div className="rounded-xl p-4" style={{ background: "#FFF7E8", border: "1px solid #F1DFB8" }}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="stop">family誤指定が可視</StatusBadge>
        <code style={{ color: C.sub }}>{item.status}</code>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          ["真のfamily", item.trueFamily],
          ["適用したfit", item.fittedFamily],
          ["観測／予測選択率", `${(100 * item.observedSelectionRate).toFixed(2)}% / ${(100 * item.fittedSelectionRate).toFixed(2)}%`],
          ["存在しない負値への予測", `${(100 * item.probabilityBelowZero).toFixed(1)}%`],
          ["予測95%分位点／真値", `${(100 * item.q95Ratio).toFixed(1)}%`],
        ].map(([term, value]) => (
          <div key={term} className="rounded-lg bg-white p-3">
            <dt className="text-xs font-bold" style={{ color: C.sub }}>{term}</dt>
            <dd className="mt-1 text-sm font-bold" style={{ color: C.ink }}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm leading-7" style={{ color: "#7A5A1A" }}>
        選択率がほぼ一致しても、潜在supportとtailは壊れています。収束や一つの要約だけでNormal familyを採用しません。
      </p>
    </div>
  );
}

function DiagnosticQuestion({ question }) {
  const [selected, setSelected] = useState(null);
  const result = useMemo(
    () => selected ? evaluateTeachingAnswer(question.id, selected) : null,
    [question.id, selected]
  );
  return (
    <article className="rounded-xl p-4" style={{ border: `1px solid ${C.line}` }}>
      <h3 className="text-base font-bold leading-7" style={{ color: C.ink }}>{question.prompt}</h3>
      <div className="mt-3 grid gap-2">
        {question.options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected === option.id}
            onClick={() => setSelected(option.id)}
            className="min-h-11 rounded-xl px-4 py-3 text-left text-sm font-semibold"
            style={selected === option.id
              ? { background: option.correct ? C.greenSoft : C.redSoft, border: `1.5px solid ${option.correct ? C.green : C.red}`, color: option.correct ? C.greenText : C.redText }
              : { background: "#FFFFFF", border: `1.5px solid ${C.edge}`, color: C.body }}
          >
            {option.label}
          </button>
        ))}
      </div>
      {result && (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 rounded-xl p-4 text-sm"
          style={{ background: result.correct ? C.greenSoft : "#FFF7E8", border: `1px solid ${result.correct ? C.green : "#F1DFB8"}` }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <strong style={{ color: result.correct ? C.greenText : "#82590F" }}>{result.correct ? "正しい判断です" : "この誤りを切り分けます"}</strong>
            <code style={{ color: C.sub }}>{result.code}</code>
          </div>
          <p className="mt-2" style={{ color: C.body }}>{result.feedback}</p>
          <p className="mt-1" style={{ color: C.sub }}><strong>次の行動:</strong> {result.nextAction}</p>
        </div>
      )}
    </article>
  );
}

export default function P2SelectionCountPreview() {
  const initialContract = { ...DEFAULT_CONTRACT };
  const [contract, setContract] = useState(initialContract);
  const [audit, setAudit] = useState(() => auditSelectionContract(initialContract));
  const fitVisible = audit?.status === "ready" && matchesFixedTeachingContract(contract);

  return (
    <div className="min-h-screen" style={{ background: C.paper, color: C.ink, fontFamily: JP }}>
      <style>{GLOBAL_CSS}</style>
      <div className="h-1" style={{ background: `linear-gradient(90deg, ${C.red}, ${C.green}, ${C.purple})` }} />
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
        <header className="mb-8">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="stop">RESEARCH ONLY</StatusBadge>
            <StatusBadge>参加者向けpreview</StatusBadge>
            <StatusBadge>公開教材未登録</StatusBadge>
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">選ばれた値と人数を一緒に読む</h1>
          <p className="mt-4 max-w-3xl text-base leading-8" style={{ color: C.body }}>
            P2 selection-count likelihoodの研究用UI試作です。今日はあなたではなく教材をテストします。分かりにくい点は教材側の改善材料です。
          </p>
          <div
            className="mt-5 rounded-xl p-4 text-sm leading-7"
            style={{ background: C.greenSoft, border: `1px solid ${C.green}`, color: C.greenText }}
            role="note"
            aria-label="参加者向けデータ利用案内"
          >
            <p className="font-bold">合成データだけを使います</p>
            <p>
              画面の数値は固定seedで作った架空の例です。あなた自身のデータは入力しないでください。入力操作はこのブラウザ内だけで処理し、外部への送信、保存、analytics、session replayは行いません。
            </p>
          </div>
        </header>
        <div className="grid gap-6">
          <SectionCard eyebrow="STEP 1 / INPUT CONTRACT" title="観測契約を先に監査する">
            <ContractForm contract={contract} setContract={setContract} audit={audit} setAudit={setAudit} />
          </SectionCard>
          <SectionCard eyebrow="STEP 2 / IDENTIFICATION" title="人数なし／ありfitを同じdataで比べる">
            <FitComparison visible={fitVisible} />
          </SectionCard>
          <SectionCard eyebrow="STEP 3 / INTERVAL STATUS" title="区間を自動選択せず、未解決を残す">
            <IntervalPanel />
          </SectionCard>
          <SectionCard eyebrow="STEP 4 / API BOUNDARY" title="requestとresponseの取り違えを止める">
            <ApiBoundaryPanel />
          </SectionCard>
          <SectionCard eyebrow="STEP 5 / MODEL SCOPE" title="選択率一致とfamily妥当性を分ける">
            <MisspecificationPanel />
          </SectionCard>
          <SectionCard eyebrow="STEP 6 / FEEDBACK" title="誤答ごとに理由と次の行動を返す">
            <div className="grid gap-4">
              {TEACHING_QUESTIONS.map((question) => <DiagnosticQuestion key={question.id} question={question} />)}
            </div>
          </SectionCard>
        </div>
        <footer className="mt-8 rounded-xl p-4 text-sm leading-7" style={{ background: C.purpleSoft, color: C.purpleDeep }}>
          このpreviewの公開は、教材catalogへの昇格や推定serviceの公開を意味しません。実計算endpointはloopback・合成fixture限定であり、公開serverは未配備です。参加を途中で休憩・中止しても不利益はありません。
        </footer>
      </main>
    </div>
  );
}
