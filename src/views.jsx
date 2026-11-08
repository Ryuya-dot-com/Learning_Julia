import { useState, useEffect, useMemo, useRef, useId } from "react";
import { C, MONO } from "./theme.js";
import { isCodey } from "./highlight.js";
import { seededOrder } from "./shuffle.js";
import { T, CodeBlock, TriDots, Btn, ResetButton, Feedback } from "./components.jsx";
import { SECTIONS } from "./data/sections.js";
import { CHEATS, CHEAT_GROUPS } from "./data/cheats.js";
import {
  LEARNING_PATHS,
  ROSETTA_GROUPS,
  ROSETTA_ITEMS,
  STARTER_RECIPES,
  WHY_JULIA_SCALES,
  WHY_JULIA_WORKLOADS,
  computeWhyJuliaSeries,
} from "./data/toolkit.js";
import { buildLessonItems } from "./data/lessons/registry.js";
import { filterLessons, filterLessonsByPath, filterCheats, countCheatRows, filterRosetta } from "./search.js";

/* ============================================================
   練習問題コンポーネント
   ============================================================ */

function ChoiceEx({ ex, seedKey, solved, onCorrect }) {
  const [sel, setSel] = useState(solved ? ex.ans : null);
  const [status, setStatus] = useState(solved ? "correct" : "idle");
  const [showHint, setShowHint] = useState(false);
  const [missed, setMissed] = useState(false); // 一度でも誤答したか(初見クリアの判定用)
  // シードに問題文だけを使うと、同一文面の問題どうしで正解が同じ位置に固定される(監査A3)。
  // レッスンidと問indexを混ぜて、問題ごとに独立した並びにする
  const order = useMemo(() => seededOrder(ex.opts.length, seedKey + ":" + ex.q), [ex, seedKey]);

  const pick = (i) => {
    if (status === "correct") return;
    setSel(i);
    if (i === ex.ans) {
      setStatus("correct");
      onCorrect(!missed);
    } else {
      setMissed(true);
      setStatus("wrong");
    }
  };

  return (
    <div>
      <p className="mb-1 text-base font-bold leading-relaxed" style={{ color: C.ink }}>
        <T>{ex.q}</T>
      </p>
      {ex.code && <CodeBlock code={ex.code} />}
      <div className="mt-4 flex flex-col gap-2.5">
        {order.map((oi, pos) => {
          const o = ex.opts[oi];
          const correctPick = status === "correct" && oi === ex.ans;
          const wrongPick = status === "wrong" && sel === oi;
          let st = { background: "#FFFFFF", border: "1.5px solid " + C.line, color: C.ink };
          if (correctPick) st = { background: C.greenSoft, border: "1.5px solid " + C.green, color: C.greenText };
          else if (wrongPick) st = { background: C.redSoft, border: "1.5px solid " + C.red, color: C.redText };
          return (
            <button
              key={oi}
              onClick={() => pick(oi)}
              disabled={status === "correct"}
              aria-pressed={sel === oi}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold disabled:cursor-default"
              style={{ ...st, opacity: status === "correct" && !correctPick ? 0.5 : 1 }}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={
                  correctPick
                    ? { background: C.greenText, color: "#FFFFFF" }
                    : wrongPick
                    ? { background: C.red, color: "#FFFFFF" }
                    : { background: C.purpleSoft, color: C.purpleDeep }
                }
              >
                {correctPick ? "✓" : wrongPick ? "✕" : String.fromCharCode(65 + pos)}
              </span>
              <span style={isCodey(o) ? { fontFamily: MONO } : undefined}>{o}</span>
            </button>
          );
        })}
      </div>
      <Feedback
        status={status}
        why={ex.why}
        hint={ex.hint}
        showHint={showHint}
        onHint={() => setShowHint(true)}
      />
    </div>
  );
}

function FillEx({ ex, solved, onCorrect }) {
  const questionId = useId();
  const [val, setVal] = useState(solved ? ex.show : "");
  const [status, setStatus] = useState(solved ? "correct" : "idle");
  const [showHint, setShowHint] = useState(false);
  const [missed, setMissed] = useState(false);

  const check = () => {
    if (status === "correct") return;
    // NFKC正規化で全角英数・全角記号(＝ など)を半角に写像する。
    // 日本語IMEの学生が全角のまま入力しても正答を受理する(監査A1)
    const v = val.normalize("NFKC").trim().toLowerCase();
    if (!v) return;
    if (ex.accept.includes(v)) {
      setStatus("correct");
      setVal(ex.show);
      onCorrect(!missed);
    } else {
      setMissed(true);
      setStatus("wrong");
    }
  };

  return (
    <div>
      <p id={questionId} className="mb-1 text-base font-bold leading-relaxed" style={{ color: C.ink }}>
        <T>{ex.q}</T>
      </p>
      {ex.code && <CodeBlock code={ex.code} />}
      <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row">
        <input
          value={val}
          onChange={(e) => {
            setVal(e.target.value);
            if (status === "wrong") setStatus("idle");
          }}
          onKeyDown={(e) => {
            // IME変換確定のEnterで解答が送信されないようにガードする(監査A2)
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter") check();
          }}
          disabled={status === "correct"}
          aria-label={ex.placeholder || "答えを入力"}
          aria-describedby={questionId}
          aria-invalid={status === "wrong"}
          placeholder={ex.placeholder || "答えを入力"}
          className="min-w-0 w-full rounded-xl px-4 py-3 text-sm"
          style={{
            border:
              "1.5px solid " +
              (status === "correct" ? C.green : status === "wrong" ? C.red : C.edge),
            background: status === "correct" ? C.greenSoft : "#FFFFFF",
            color: status === "correct" ? "#2B7A1E" : C.ink,
            fontFamily: MONO,
          }}
        />
        <Btn onClick={check} disabled={status === "correct" || !val.trim()} className="shrink-0">
          答え合わせ
        </Btn>
      </div>
      <Feedback
        status={status}
        why={ex.why}
        hint={ex.hint}
        showHint={showHint}
        onHint={() => setShowHint(true)}
      />
    </div>
  );
}

// tf形式: 3つの記述それぞれに○×を付け、全問正解でクリア(ロードマップ仕様5節)。
// 判定時は項目別の正誤と解説を必ず開示する。「初見で全問正解」は別フラグで記録する2層設計
function TfEx({ ex, solved, onCorrect }) {
  const statementId = useId();
  const [marks, setMarks] = useState(() => (solved ? ex.items.map((it) => it.a) : ex.items.map(() => null)));
  const [checked, setChecked] = useState(solved);
  const [status, setStatus] = useState(solved ? "correct" : "idle");
  const [missed, setMissed] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const setMark = (i, v) => {
    if (status === "correct") return;
    const next = marks.slice();
    next[i] = v;
    setMarks(next);
    setChecked(false);
    if (status === "wrong") setStatus("idle");
  };

  const judge = () => {
    if (status === "correct" || marks.some((m) => m === null)) return;
    setChecked(true);
    if (ex.items.every((it, i) => marks[i] === it.a)) {
      setStatus("correct");
      onCorrect(!missed);
    } else {
      setMissed(true);
      setStatus("wrong");
    }
  };

  const rightCount = ex.items.filter((it, i) => marks[i] === it.a).length;

  return (
    <div>
      <p className="mb-1 text-base font-bold leading-relaxed" style={{ color: C.ink }}>
        <T>{ex.q}</T>
      </p>
      {ex.code && <CodeBlock code={ex.code} />}
      <div className="mt-4 flex flex-col gap-3">
        {ex.items.map((it, i) => {
          const judged = checked || status === "correct";
          const right = judged && marks[i] === it.a;
          const wrong = judged && marks[i] !== it.a;
          return (
            <div
              key={i}
              className="rounded-xl p-3"
              style={{
                background: right ? C.greenSoft : wrong ? C.redSoft : "#FFFFFF",
                border: "1.5px solid " + (right ? C.green : wrong ? C.red : C.line),
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p id={`${statementId}-${i}`} className="min-w-0 flex-1 pt-1 text-sm leading-6" style={{ color: C.ink }}>
                  <T>{it.s}</T>
                </p>
                <div className="flex shrink-0 gap-1.5" role="group" aria-label={`記述${i + 1}の判定`}>
                  {[
                    { v: true, label: "○" },
                    { v: false, label: "×" },
                  ].map(({ v, label }) => (
                    <button
                      key={label}
                      onClick={() => setMark(i, v)}
                      disabled={status === "correct"}
                      aria-pressed={marks[i] === v}
                      aria-label={`記述${i + 1}を「${v ? "正しい" : "まちがい"}」にする`}
                      aria-describedby={`${statementId}-${i}`}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold disabled:cursor-default"
                      style={
                        marks[i] === v
                          ? { background: C.purpleDeep, color: "#FFFFFF" }
                          : { background: "#FFFFFF", border: "1.5px solid " + C.edge, color: C.body }
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {judged && (
                <p className="mt-2 text-xs leading-5" style={{ color: right ? "#2E5626" : C.redText }}>
                  {right ? "○ " : "✕ "}
                  <T>{it.why}</T>
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4">
        <Btn onClick={judge} disabled={status === "correct" || marks.some((m) => m === null)}>
          答え合わせ
        </Btn>
      </div>
      <Feedback status={status} showHint={showHint}>
        {status === "correct" && (
          <div className="pop mt-4 rounded-xl p-4" style={{ background: C.greenSoft, border: "1px solid #BFE3B4" }}>
            <p className="text-sm font-bold" style={{ color: C.greenText }}>
              全問正解です!{!missed && " 初見でパーフェクトでした。"}
            </p>
          </div>
        )}
        {checked && status === "wrong" && (
          <div className="rise mt-4 rounded-xl p-4" style={{ background: "#FFF7E8", border: "1px solid #F1DFB8" }}>
            <p className="mb-1.5 text-sm font-bold" style={{ color: "#82590F" }}>
              {rightCount} / {ex.items.length} 問が合っています。各記述の解説を読んで、もう一度。
            </p>
            {showHint ? (
              <p className="text-sm leading-relaxed" style={{ color: "#7A5A1A" }}>
                ヒント:<T>{ex.hint}</T>
              </p>
            ) : (
              <button
                className="inline-flex min-h-11 items-center text-sm font-bold underline"
                style={{ color: "#82590F" }}
                onClick={() => setShowHint(true)}
              >
                ヒントを見る
              </button>
            )}
          </div>
        )}
      </Feedback>
    </div>
  );
}

/* ============================================================
   レッスン画面
   ============================================================ */

function PageBody({ page }) {
  return (
    <>
      {(page.b || []).map((s, i) => (
        <p key={i} className="mb-3 text-sm leading-7" style={{ color: C.body }}>
          <T>{s}</T>
        </p>
      ))}
      {page.code && <CodeBlock code={page.code} output={page.out} error={page.err} lang={page.lang} />}
      {page.fig && (
        <figure
          className="my-4 min-w-0 overflow-hidden rounded-xl p-3"
          style={{ background: "#FAF8F4", border: "1px solid " + C.line }}
        >
          <img
            src={import.meta.env.BASE_URL + page.fig.src}
            alt={page.fig.alt}
            decoding="async"
            className="mx-auto block h-auto w-full max-w-full rounded-lg bg-white"
          />
          {page.fig.cap && (
            <figcaption className="mt-2 text-xs leading-5" style={{ color: C.sub }}>
              <T>{page.fig.cap}</T>
            </figcaption>
          )}
        </figure>
      )}
      {page.download && (
        <a
          href={import.meta.env.BASE_URL + page.download.path}
          download
          className="mb-4 inline-flex min-h-11 items-center rounded-full px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-85"
          style={{ background: C.purple, color: "#FFFFFF" }}
        >
          ↓ {page.download.label}
        </a>
      )}
      {(page.a || []).map((s, i) => (
        <p key={i} className="mb-3 text-sm leading-7" style={{ color: C.body }}>
          <T>{s}</T>
        </p>
      ))}
    </>
  );
}

function clampStepIdx(step, length) {
  const raw = Number.isInteger(step) && step >= 1 ? step - 1 : 0;
  return Math.min(Math.max(0, raw), Math.max(0, length - 1));
}

function LessonView({
  lesson,
  step = 1,
  onStepChange,
  doneSet,
  firstSet,
  onSolve,
  onHome,
  onNextLesson,
  hasNext,
  onCheat,
  onToolkit,
}) {
  // 番号なしレッスン(bridge/extra)は「LESSON null」にならないようセクション名を表示する(仕様4.4b)
  const sec = SECTIONS.find((s) => s.dir === lesson.section);
  const headLabel = lesson.num != null ? `LESSON ${lesson.num}` : (sec ? sec.title : "");
  const doneLabel = lesson.num != null ? `レッスン${lesson.num} 修了!` : `${lesson.title} 修了!`;
  const items = useMemo(() => buildLessonItems(lesson), [lesson]);
  const relatedRecipes = useMemo(
    () =>
      STARTER_RECIPES.filter(
        (r) => r.lessonId === lesson.id || (r.relatedLessonIds && r.relatedLessonIds.includes(lesson.id))
      ),
    [lesson.id]
  );
  const relatedRosetta = useMemo(
    () => ROSETTA_ITEMS.filter((item) => item.lessonId === lesson.id),
    [lesson.id]
  );

  const [idx, setIdx] = useState(() => clampStepIdx(step, items.length));
  const headingRef = useRef(null);

  useEffect(() => {
    const nextIdx = clampStepIdx(step, items.length);
    setIdx((cur) => (cur === nextIdx ? cur : nextIdx));
  }, [step, items.length]);

  const goStep = (nextIdx) => {
    const bounded = Math.min(Math.max(0, nextIdx), items.length - 1);
    setIdx(bounded);
    if (onStepChange) onStepChange(bounded + 1);
  };

  useEffect(() => {
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [idx]);

  const cur = items[idx];
  const total = lesson.ex.length;
  const solvedCount = doneSet.size;
  const pct = Math.round((idx / (items.length - 1)) * 100);

  return (
    <div>
      <div className="mb-5">
        <h1 className="sr-only" tabIndex={-1}>{lesson.title}</h1>
        <div className="mb-3 flex items-center justify-between">
          <button
            className="inline-flex min-h-11 items-center text-sm font-bold"
            style={{ color: C.purpleDeep }}
            onClick={onHome}
          >
            ← レッスン一覧
          </button>
          <span className="text-xs font-bold" style={{ color: C.sub, fontFamily: MONO }}>
            {idx + 1} / {items.length}
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: C.track }}>
          <div
            className="h-full rounded-full"
            style={{ width: pct + "%", background: C.purple, transition: "width 0.3s" }}
          />
        </div>
      </div>

      <div
        key={idx}
        className="rise rounded-2xl bg-white p-5 sm:p-7"
        style={{ border: "1px solid " + C.line, boxShadow: "0 1px 2px rgba(42,39,51,0.04)" }}
      >
        {cur.kind === "page" && (
          <div>
            <div className="mb-2 text-xs font-bold tracking-widest" style={{ color: C.purpleDeep, fontFamily: MONO }}>
              {headLabel}
            </div>
            <h2 ref={headingRef} tabIndex={-1} className="mb-4 text-xl font-bold" style={{ color: C.ink }}>
              {cur.p.t}
            </h2>
            <PageBody page={cur.p} />
          </div>
        )}

        {cur.kind === "ex" && (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="rounded-full px-3 py-1 text-xs font-bold"
                style={{ background: C.purpleSoft, color: C.purpleDeep }}
              >
                練習問題 {cur.i + 1} / {total}
              </h2>
              {doneSet.has(cur.i) && (
                <span className="text-xs font-bold" style={{ color: C.greenText }}>
                  クリア済み ✓
                </span>
              )}
            </div>
            {cur.e.k === "choice" ? (
              <ChoiceEx
                key={lesson.id + "-" + cur.i}
                ex={cur.e}
                seedKey={lesson.id + ":" + cur.i}
                solved={doneSet.has(cur.i)}
                onCorrect={(first) => onSolve(cur.i, first)}
              />
            ) : cur.e.k === "tf" ? (
              <TfEx
                key={lesson.id + "-" + cur.i}
                ex={cur.e}
                solved={doneSet.has(cur.i)}
                onCorrect={(first) => onSolve(cur.i, first)}
              />
            ) : (
              <FillEx
                key={lesson.id + "-" + cur.i}
                ex={cur.e}
                solved={doneSet.has(cur.i)}
                onCorrect={(first) => onSolve(cur.i, first)}
              />
            )}
            {cur.reviewPage && (
              <details className="mt-5 border-t pt-3" style={{ borderColor: C.line }}>
                <summary className="min-h-11 cursor-pointer text-sm font-bold leading-7" style={{ color: C.purpleDeep }}>
                  説明を読み直す: {cur.reviewPage.t}
                </summary>
                <div className="mt-3">
                  <PageBody page={cur.reviewPage} />
                </div>
              </details>
            )}
          </div>
        )}

        {cur.kind === "done" && (
          <div className="py-4 text-center">
            {solvedCount === total ? (
              <div className="pop">
                <div className="mb-4 flex justify-center">
                  <TriDots filled={3} size={14} />
                </div>
                <h2 ref={headingRef} tabIndex={-1} className="mb-2 text-2xl font-bold" style={{ color: C.ink }}>
                  {doneLabel}
                </h2>
                <p className="mb-6 text-sm" style={{ color: C.sub }}>
                  練習問題 {total} 問、すべてクリアしました。
                  {firstSet && firstSet.size > 0 && ` うち ${firstSet.size} 問は一発クリアです!`}
                </p>
                <div className="flex flex-col items-center gap-3">
                  {hasNext ? (
                    <Btn onClick={onNextLesson}>次のレッスンへすすむ</Btn>
                  ) : (
                    <Btn onClick={onCheat}>チートシートを見る</Btn>
                  )}
                  <Btn kind="quiet" onClick={onHome}>
                    レッスン一覧にもどる
                  </Btn>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-4 flex justify-center">
                  {/* クリア数を3点満点に比例配分する。旧実装は 2/3 クリアでも1点だった(監査A13) */}
                  <TriDots filled={Math.min(2, Math.floor((solvedCount / total) * 3))} size={14} />
                </div>
                <h2 ref={headingRef} tabIndex={-1} className="mb-2 text-xl font-bold" style={{ color: C.ink }}>
                  おつかれさまでした
                </h2>
                <p className="mb-5 text-sm" style={{ color: C.sub }}>
                  未クリアの練習問題が {total - solvedCount} 問あります。もう一度チャレンジしてみましょう。
                </p>
                <div className="mb-5 flex flex-col items-center gap-2">
                  {lesson.ex.map(
                    (e, i) =>
                      !doneSet.has(i) && (
                        <Btn key={i} kind="ghost" onClick={() => goStep(items.findIndex((item) => item.kind === "ex" && item.i === i))}>
                          練習問題 {i + 1} にもどる
                        </Btn>
                      )
                  )}
                </div>
                <Btn kind="quiet" onClick={onHome}>
                  レッスン一覧にもどる
                </Btn>
              </div>
            )}
            {(relatedRecipes.length > 0 || relatedRosetta.length > 0 || sec?.notebook) && (
              <div
                className="mt-6 rounded-xl p-4 text-left"
                style={{ background: "#FAF8F4", border: "1px solid " + C.line }}
              >
                <div className="mb-2 text-xs font-bold" style={{ color: C.ink }}>
                  この単元の実践ツール・手元演習
                </div>
                <div className="flex flex-wrap gap-2">
                  {onToolkit &&
                    relatedRecipes.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onToolkit("", "recipes", r.id)}
                        className="inline-flex min-h-11 min-w-0 items-center rounded-xl px-3 py-2 text-left text-xs font-bold"
                        style={{ background: C.purpleSoft, color: C.purpleDeep, overflowWrap: "anywhere" }}
                      >
                        スターターレシピ: {r.filename} →
                      </button>
                    ))}
                  {onToolkit && relatedRosetta.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onToolkit(lesson.title, "rosetta")}
                      className="inline-flex min-h-11 min-w-0 items-center rounded-xl px-3 py-2 text-left text-xs font-bold"
                      style={{
                        background: "#FFFFFF",
                        color: C.purpleDeep,
                        border: "1px solid " + C.line,
                        overflowWrap: "anywhere",
                      }}
                    >
                      R・Python逆引き対訳 ({relatedRosetta.length}件) →
                    </button>
                  )}
                  {sec?.notebook && (
                    <a
                      href={import.meta.env.BASE_URL + "notebooks/" + sec.notebook}
                      download
                      className="inline-flex min-h-11 min-w-0 items-center rounded-xl px-3 py-2 text-xs font-bold underline"
                      style={{
                        background: "#FFFFFF",
                        color: C.purpleDeep,
                        border: "1px solid " + C.line,
                        overflowWrap: "anywhere",
                      }}
                    >
                      Pluto演習ノート ({sec.notebook}) ↓
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <Btn kind="quiet" onClick={() => goStep(idx - 1)} disabled={idx === 0}>
          ← 前へ
        </Btn>
        {cur.kind !== "done" && (
          <Btn onClick={() => goStep(idx + 1)}>
            {items[idx + 1] && items[idx + 1].kind === "done" ? "まとめへ" : "次へ →"}
          </Btn>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   ホーム画面
   ============================================================ */

function Home({ lessons, progress, onOpen, onCheat, onToolkit, onReset }) {
  const [query, setQuery] = useState("");
  const [pathId, setPathId] = useState("all");
  const searchRef = useRef(null);
  const hasQuery = query.trim().length > 0;
  const activePath = useMemo(
    () => LEARNING_PATHS.find((p) => p.id === pathId) || LEARNING_PATHS[0],
    [pathId]
  );
  const pathLessons = useMemo(
    () => filterLessonsByPath(lessons, activePath, progress.done),
    [lessons, activePath, progress.done]
  );
  const visibleLessons = useMemo(
    () => filterLessons(pathLessons, SECTIONS, query),
    [pathLessons, query]
  );
  const matchedCheats = useMemo(
    () => (hasQuery ? filterCheats(CHEATS, "すべて", query) : []),
    [hasQuery, query]
  );
  const matchedCheatRows = useMemo(() => countCheatRows(matchedCheats), [matchedCheats]);
  const matchedRosetta = useMemo(
    () => (hasQuery ? filterRosetta(ROSETTA_ITEMS, "すべて", query) : []),
    [hasQuery, query]
  );

  const totalEx = lessons.reduce((s, l) => s + l.exCount, 0);
  const doneEx = lessons.reduce((s, l) => s + (progress.done[l.id] || []).length, 0);
  const doneLessons = lessons.filter((l) => (progress.done[l.id] || []).length === l.exCount).length;
  const numberedLessons = lessons.filter((l) => l.num != null).length;
  const supplementalLessons = lessons.filter((l) => l.section === "extra").length;
  const bridgeLessons = lessons.filter((l) => l.section === "bridge").length;
  const intermediateLessons = lessons.filter((l) => l.section === "intermediate").length;
  const advancedCompLessons = lessons.filter((l) => l.section === "advanced-comp").length;
  const allDone = doneLessons === lessons.length;
  const firstIncomplete = lessons.find((l) => (progress.done[l.id] || []).length < l.exCount);
  const pct = Math.round((doneEx / totalEx) * 100);
  const dotsFilled = allDone ? 3 : Math.floor((doneEx / totalEx) * 3);

  return (
    <div className="rise">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 pt-1">
        <TriDots filled={dotsFilled} size={13} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {onToolkit && (
            <>
              <button
                className="inline-flex min-h-11 items-center text-xs font-bold underline"
                style={{ color: C.purpleDeep }}
                onClick={() => onToolkit("", "why")}
              >
                なぜJulia？
              </button>
              <button
                className="inline-flex min-h-11 items-center text-xs font-bold underline"
                style={{ color: C.purpleDeep }}
                onClick={() => onToolkit("", "rosetta")}
              >
                逆引き・レシピ
              </button>
            </>
          )}
          <button
            className="inline-flex min-h-11 items-center text-xs font-bold underline"
            style={{ color: C.purpleDeep }}
            onClick={() => onCheat()}
          >
            チートシート
          </button>
        </div>
      </div>

      <h1 tabIndex={-1} className="mb-1.5 text-3xl font-bold tracking-tight" style={{ color: C.ink }}>
        はじめてのJulia
      </h1>
      <p className="mb-6 text-sm leading-6" style={{ color: C.sub }}>
        ゼロから学ぶ、研究のためのプログラミング。番号付き全{numberedLessons}レッスン
        {supplementalLessons > 0 && `＋補講${supplementalLessons}本`}
        {bridgeLessons > 0 && `＋R・Stan・Python連携${bridgeLessons}本`}
        {intermediateLessons > 0 && `＋中級編${intermediateLessons}本`}
        {advancedCompLessons > 0 && `＋上級編${advancedCompLessons}本`}で、データ解析の入り口から高速計算・動的モデル・MCMCまで案内します。
      </p>

      <div className="mb-6 rounded-2xl bg-white p-5" style={{ border: "1px solid " + C.line }}>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-bold" style={{ color: C.ink }}>
            学習の進みぐあい
          </span>
          <span className="text-xs font-bold" style={{ color: C.sub, fontFamily: MONO }}>
            {doneEx} / {totalEx} 問
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: C.track }}>
          <div
            className="h-full rounded-full"
            style={{ width: pct + "%", background: C.purple, transition: "width 0.4s" }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs" style={{ color: C.faint }}>
            3つの点がすべて灯ったら修了です
          </span>
          {firstIncomplete && (
            <Btn onClick={() => onOpen(firstIncomplete.id)} className="px-4 py-2">
              {doneEx === 0 ? "レッスン1をはじめる" : "つづきから"}
            </Btn>
          )}
        </div>
      </div>

      {allDone && (
        <div
          className="pop mb-6 rounded-2xl p-5 text-center"
          style={{ background: C.purpleSoft, border: "1px solid #DCC9E8" }}
        >
          <div className="mb-2 flex justify-center">
            <TriDots filled={3} size={14} />
          </div>
          <p className="text-base font-bold" style={{ color: C.purpleDeep }}>
            全レッスン修了、おめでとうございます!
          </p>
          <p className="mt-1 text-xs leading-5" style={{ color: "#5A3B6E" }}>
            次はチートシートを片手に、実際のJulia(julialang.org)で手を動かしてみましょう。
          </p>
        </div>
      )}

      <div
        role="search"
        aria-label="教材と関数を検索"
        className="mb-6 rounded-2xl bg-white p-4"
        style={{ border: "1px solid " + C.line }}
      >
        <label htmlFor="home-search" className="mb-1.5 block text-xs font-bold" style={{ color: C.ink }}>
          教材・関数名・統計用語で探す
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="home-search"
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例: CSV, @views, pivot_longer, np.where, HMC…"
            className="min-h-11 w-full min-w-0 rounded-xl px-3 py-2 text-sm sm:w-auto sm:flex-1"
            style={{ background: C.paper, border: "1.5px solid " + C.line, color: C.ink }}
          />
          {hasQuery && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 py-2 text-xs font-bold"
              style={{ background: C.purpleSoft, color: C.purpleDeep }}
            >
              クリア
            </button>
          )}
        </div>
        {hasQuery && (
          <div
            role="status"
            aria-live="polite"
            className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
            style={{ color: C.sub }}
          >
            <span>
              レッスン {visibleLessons.length} 件・チートシート {matchedCheatRows} 件が一致
              {matchedRosetta.length > 0 && `（逆引き対訳 ${matchedRosetta.length} 件）`}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {onToolkit && matchedRosetta.length > 0 && (
                <button
                  type="button"
                  onClick={() => onToolkit(query, "rosetta")}
                  className="inline-flex min-h-11 items-center font-bold underline"
                  style={{ color: C.purpleDeep }}
                >
                  逆引き対訳で開く →
                </button>
              )}
              {matchedCheatRows > 0 && (
                <button
                  type="button"
                  onClick={() => onCheat(query)}
                  className="inline-flex min-h-11 items-center font-bold underline"
                  style={{ color: C.purpleDeep }}
                >
                  チートシートで開く →
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        role="group"
        aria-label="目的別コース・進捗絞り込み"
        className="mb-6 rounded-2xl bg-white p-4"
        style={{ border: "1px solid " + C.line }}
      >
        <div className="mb-2 text-xs font-bold" style={{ color: C.ink }}>
          目的別コース・進捗で絞り込む
        </div>
        <div className="flex flex-wrap gap-2">
          {LEARNING_PATHS.map((p) => {
            const active = p.id === activePath.id;
            const count =
              p.id === "all"
                ? lessons.length
                : p.lessonIds === "incomplete"
                  ? lessons.filter((l) => (progress.done[l.id] || []).length < l.exCount).length
                  : p.lessonIds.length;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => setPathId(p.id)}
                className="inline-flex min-h-11 min-w-0 items-center rounded-xl px-3 py-1.5 text-left text-xs font-bold"
                style={
                  active
                    ? {
                        background: C.purpleDeep,
                        color: "#FFFFFF",
                        border: "1.5px solid " + C.purpleDeep,
                        overflowWrap: "anywhere",
                      }
                    : {
                        background: C.paper,
                        color: C.body,
                        border: "1.5px solid " + C.line,
                        overflowWrap: "anywhere",
                      }
                }
              >
                {p.label} ({count})
              </button>
            );
          })}
        </div>
        {activePath.id !== "all" && (
          <div
            className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 text-xs leading-5"
            style={{ background: C.purpleSoft, color: C.purpleDeep }}
          >
            <span className="min-w-0 flex-1" style={{ overflowWrap: "anywhere" }}>
              <strong className="font-bold">{activePath.label}:</strong> {activePath.desc}
              {Array.isArray(activePath.lessonIds) && (
                <span className="ml-1 font-bold" style={{ fontFamily: MONO }}>
                  （{pathLessons.filter((l) => (progress.done[l.id] || []).length === l.exCount).length} /{" "}
                  {pathLessons.length} 修了）
                </span>
              )}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {pathLessons.find((l) => (progress.done[l.id] || []).length < l.exCount) && (
                <button
                  type="button"
                  onClick={() => {
                    const nextInPath = pathLessons.find((l) => (progress.done[l.id] || []).length < l.exCount);
                    if (nextInPath) onOpen(nextInPath.id);
                  }}
                  className="inline-flex min-h-11 items-center rounded-xl px-3 py-1.5 text-xs font-bold"
                  style={{ background: C.purpleDeep, color: "#FFFFFF", overflowWrap: "anywhere" }}
                >
                  このコースを進める →
                </button>
              )}
              <button
                type="button"
                onClick={() => setPathId("all")}
                className="inline-flex min-h-11 items-center rounded-xl px-3 py-1.5 text-xs font-bold underline"
                style={{ color: C.purpleDeep }}
              >
                すべて表示
              </button>
            </div>
          </div>
        )}
      </div>

      {(hasQuery || activePath.id !== "all") && visibleLessons.length === 0 ? (
        <div
          className="rounded-2xl bg-white p-5 text-sm leading-6"
          style={{ border: "1px solid " + C.line, color: C.sub }}
        >
          <p className="font-bold" style={{ color: C.ink }}>
            {hasQuery
              ? `「${query.trim()}」に一致するレッスンは見つかりませんでした。`
              : "条件に一致するレッスンはありません。"}
          </p>
          <p className="mt-1 text-xs">
            {matchedRosetta.length > 0 || matchedCheatRows > 0
              ? `R・Python逆引き対訳に ${matchedRosetta.length} 件、チートシートに ${matchedCheatRows} 件の一致があります。`
              : "別の関数名（例: CSV, GLM, pivot_longer, np.where, @views）やコース絞り込みで試してみてください。"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {onToolkit && matchedRosetta.length > 0 && (
              <button
                type="button"
                onClick={() => onToolkit(query, "rosetta")}
                className="inline-flex min-h-11 items-center rounded-xl px-3.5 py-2 text-xs font-bold"
                style={{ background: C.purpleDeep, color: "#FFFFFF" }}
              >
                逆引き対訳の一致を見る ({matchedRosetta.length}件)
              </button>
            )}
            {matchedCheatRows > 0 && (
              <button
                type="button"
                onClick={() => onCheat(query)}
                className="inline-flex min-h-11 items-center rounded-xl px-3.5 py-2 text-xs font-bold"
                style={
                  matchedRosetta.length > 0
                    ? { background: C.purpleSoft, color: C.purpleDeep }
                    : { background: C.purpleDeep, color: "#FFFFFF" }
                }
              >
                チートシートの一致を見る ({matchedCheatRows}件)
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setPathId("all");
                searchRef.current?.focus();
              }}
              className="inline-flex min-h-11 items-center rounded-xl px-3.5 py-2 text-xs font-bold"
              style={{ background: C.purpleSoft, color: C.purpleDeep }}
            >
              検索をクリア
            </button>
          </div>
        </div>
      ) : (
      <div className="flex flex-col gap-7">
        {SECTIONS.map((sec) => {
          // レッスンが0本のセクションは表示しない(仕様4.3。移行直後は基礎編のみが並ぶ)
          const ls = visibleLessons.filter((l) => l.section === sec.dir);
          if (ls.length === 0) return null;
          return (
            <div key={sec.dir}>
              <div className="mb-2.5 flex flex-wrap items-baseline gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 self-center rounded-full"
                  style={{ background: sec.color }}
                  aria-hidden="true"
                />
                <h2 className="text-sm font-bold" style={{ color: C.ink }}>
                  {sec.title}
                </h2>
                <span className="order-last w-full text-xs sm:order-none sm:min-w-0 sm:flex-1" style={{ color: C.sub }}>
                  {sec.sub}
                </span>
                {sec.notebook && (
                  <a
                    className="inline-flex min-h-11 shrink-0 items-center text-xs font-bold underline"
                    style={{ color: C.purpleDeep }}
                    href={import.meta.env.BASE_URL + "notebooks/" + sec.notebook}
                    aria-label={`${sec.title}の演習ノート ↓`}
                    download
                  >
                    演習ノート ↓
                  </a>
                )}
              </div>
              <div className="flex flex-col gap-3">
                {ls.map((l) => {
                  const got = (progress.done[l.id] || []).length;
                  const all = got === l.exCount;
                  // 番号なしトラックは mark+セクション内連番(例: R1, 補1)を表示する(仕様4.4b)
                  const badge = l.num != null ? String(l.num).padStart(2, "0") : (sec.mark || "") + l.numInSection;
                  return (
                    <button
                      key={l.id}
                      onClick={() => onOpen(l.id)}
                      className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 text-left transition-shadow hover:shadow-md"
                      style={{ border: "1px solid " + (all ? "#BFE3B4" : C.line) }}
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
                        style={
                          all
                            ? { background: C.greenSoft, color: C.greenText }
                            : { background: C.purpleSoft, color: C.purpleDeep, fontFamily: MONO }
                        }
                      >
                        {all ? "✓" : badge}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold" style={{ color: C.ink }}>
                          {l.title}
                        </span>
                        <span className="block text-xs" style={{ color: C.sub }}>
                          {l.tag}
                        </span>
                      </span>
                      <span
                        className="shrink-0 text-xs font-bold"
                        style={{ color: all ? C.greenText : got > 0 ? C.purpleDeep : C.faint, fontFamily: MONO }}
                      >
                        {all ? "修了" : got + " / " + l.exCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      )}

      <div className="mt-8 flex flex-col items-center gap-2 pb-6 text-center">
        <p className="text-xs" style={{ color: C.faint }}>
          進みぐあいは、このページを開いているあいだだけ記録されます
        </p>
        <a
          className="inline-flex min-h-11 items-center text-xs font-bold underline"
          style={{ color: C.purpleDeep }}
          href={import.meta.env.BASE_URL + "roadmap.html"}
        >
          この先の学習ロードマップを見る
        </a>
        <ResetButton onReset={onReset} />
      </div>
    </div>
  );
}

/* ============================================================
   サイドパネル(レッスンの目次)
   lg以上の画面幅でのみ表示する。モバイルはホーム画面が目次を兼ねる
   ============================================================ */

function Sidebar({ lessons, progress, currentId, viewName, onOpen, onCheat, onToolkit, onHome }) {
  return (
    <nav
      aria-label="レッスンの目次"
      className="hidden w-60 shrink-0 lg:block"
      style={{
        position: "sticky",
        top: 24,
        alignSelf: "flex-start",
        maxHeight: "calc(100vh - 48px)",
        overflowY: "auto",
      }}
    >
      <button
        onClick={onHome}
        className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold"
        style={{ color: viewName === "home" ? C.purpleDeep : C.ink }}
        aria-current={viewName === "home" ? "page" : undefined}
      >
        <TriDots filled={3} size={8} />
        はじめてのJulia
      </button>

      <div className="flex flex-col gap-4 pb-4">
        {SECTIONS.map((sec) => {
          const ls = lessons.filter((l) => l.section === sec.dir);
          if (ls.length === 0) return null;
          return (
            <div key={sec.dir}>
              <div className="mb-1 flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: sec.color }}
                  aria-hidden="true"
                />
                <span className="text-xs font-bold" style={{ color: C.sub }}>
                  {sec.title}
                </span>
              </div>
              <div className="flex flex-col">
                {ls.map((l) => {
                  const got = (progress.done[l.id] || []).length;
                  const all = got === l.exCount;
                  const current = viewName === "lesson" && l.id === currentId;
                  const badge = l.num != null ? String(l.num).padStart(2, "0") : (sec.mark || "") + l.numInSection;
                  return (
                    <button
                      key={l.id}
                      onClick={() => onOpen(l.id)}
                      aria-current={current ? "page" : undefined}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs"
                      style={
                        current
                          ? { background: C.purpleSoft, color: C.purpleDeep, fontWeight: 700 }
                          : { color: C.body }
                      }
                    >
                      <span className="w-6 shrink-0 text-right" style={{ fontFamily: MONO, color: current ? C.purpleDeep : C.faint }}>
                        {badge}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{l.title}</span>
                      {all && (
                        <span aria-label="修了" style={{ color: C.greenText }}>
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col border-t pt-3" style={{ borderColor: C.line }}>
        {onToolkit && (
          <>
            <button
              onClick={() => onToolkit("", "why")}
              className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-bold"
              style={{ color: C.purpleDeep }}
            >
              なぜJulia？（図解）
            </button>
            <button
              onClick={() => onToolkit("", "rosetta")}
              aria-current={viewName === "toolkit" ? "page" : undefined}
              className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-bold"
              style={viewName === "toolkit" ? { background: C.purpleSoft, color: C.purpleDeep } : { color: C.purpleDeep }}
            >
              逆引き・レシピ
            </button>
          </>
        )}
        <button
          onClick={() => onCheat()}
          aria-current={viewName === "cheat" ? "page" : undefined}
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-bold"
          style={viewName === "cheat" ? { background: C.purpleSoft, color: C.purpleDeep } : { color: C.purpleDeep }}
        >
          チートシート
        </button>
        <a
          href={import.meta.env.BASE_URL + "roadmap.html"}
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-bold"
          style={{ color: C.purpleDeep }}
        >
          学習ロードマップ
        </a>
      </div>
    </nav>
  );
}

/* ============================================================
   チートシート画面
   ============================================================ */

function CheatSheet({ onHome, onToolkit, initialQuery = "" }) {
  const [group, setGroup] = useState("すべて");
  const [query, setQuery] = useState(initialQuery);
  const searchRef = useRef(null);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const hasQuery = query.trim().length > 0;
  const visibleCheats = useMemo(() => filterCheats(CHEATS, group, query), [group, query]);
  const visibleRowCount = useMemo(() => countCheatRows(visibleCheats), [visibleCheats]);

  return (
    <div className="rise">
      <div className="mb-5 flex items-center justify-between">
        <button
          className="inline-flex min-h-11 items-center text-sm font-bold"
          style={{ color: C.purpleDeep }}
          onClick={onHome}
        >
          ← もどる
        </button>
        <TriDots filled={3} size={10} />
      </div>
      <h1 tabIndex={-1} className="mb-1 text-2xl font-bold tracking-tight" style={{ color: C.ink }}>
        Julia チートシート
      </h1>
      <p className="mb-4 text-sm" style={{ color: C.sub }}>
        基礎文法から表操作・確率分布・統計モデリングまで、レッスンで学んだ書き方の早見表です。
        {onToolkit && (
          <>
            {" "}
            <button
              type="button"
              onClick={() => onToolkit(query, "rosetta")}
              className="inline-flex min-h-11 items-center font-bold underline"
              style={{ color: C.purpleDeep }}
            >
              R・Python逆引き対訳とスターターレシピはこちら →
            </button>
          </>
        )}
      </p>
      <div role="search" aria-label="チートシート検索" className="mb-3">
        <label htmlFor="cheat-search" className="mb-1.5 block text-xs font-bold" style={{ color: C.ink }}>
          関数名・書き方で絞り込み
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="cheat-search"
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例: groupby, @views, logpdf, MixedModel…"
            className="min-h-11 w-full min-w-0 rounded-xl bg-white px-3 py-2 text-sm sm:w-auto sm:flex-1"
            style={{ border: "1.5px solid " + C.line, color: C.ink }}
          />
          {hasQuery && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 py-2 text-xs font-bold"
              style={{ background: C.purpleSoft, color: C.purpleDeep }}
            >
              クリア
            </button>
          )}
        </div>
        {hasQuery && (
          <p role="status" aria-live="polite" className="mt-2 text-xs" style={{ color: C.sub }}>
            {visibleCheats.length} カード・{visibleRowCount} 行が一致
          </p>
        )}
      </div>
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="カテゴリ絞り込み">
        {CHEAT_GROUPS.map((g) => {
          const active = group === g;
          return (
            <button
              key={g}
              type="button"
              aria-pressed={active}
              onClick={() => setGroup(g)}
              className="inline-flex min-h-11 items-center rounded-full px-3.5 py-1.5 text-xs font-bold"
              style={
                active
                  ? { background: C.purpleDeep, color: "#FFFFFF", border: "1.5px solid " + C.purpleDeep }
                  : { background: "#FFFFFF", color: C.body, border: "1.5px solid " + C.line }
              }
            >
              {g}
            </button>
          );
        })}
      </div>
      {visibleCheats.length === 0 ? (
        <div
          className="rounded-2xl bg-white p-5 text-sm leading-6"
          style={{ border: "1px solid " + C.line, color: C.sub }}
        >
          <p className="font-bold" style={{ color: C.ink }}>
            条件に一致する項目が見つかりませんでした。
          </p>
          <button
            type="button"
            onClick={() => {
              setGroup("すべて");
              setQuery("");
              searchRef.current?.focus();
            }}
            className="mt-3 inline-flex min-h-11 items-center rounded-xl px-3.5 py-2 text-xs font-bold"
            style={{ background: C.purpleSoft, color: C.purpleDeep }}
          >
            カテゴリと検索をリセット
          </button>
        </div>
      ) : (
      <div className="grid gap-4 sm:grid-cols-2">
        {visibleCheats.map((sec) => (
          <div key={sec.title} className="min-w-0 rounded-2xl bg-white p-4" style={{ border: "1px solid " + C.line }}>
            <h2 className="mb-3 text-sm font-bold" style={{ color: C.purple }}>
              {sec.title}
            </h2>
            <div className="flex flex-col gap-2.5">
              {sec.rows.map((r, j) => (
                <div key={j} className="flex flex-wrap items-start justify-between gap-2">
                  <code
                    className="max-w-full rounded px-1.5 py-0.5 text-xs leading-5"
                    style={{ background: "#F5F2EC", color: "#5A4470", fontFamily: MONO, overflowWrap: "anywhere" }}
                  >
                    {r[0]}
                  </code>
                  <span
                    className="min-w-0 pt-0.5 text-right text-xs leading-5"
                    style={{ color: C.sub, overflowWrap: "anywhere" }}
                  >
                    {r[1]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      )}
      <div
        className="mt-5 rounded-2xl p-4 text-sm leading-6"
        style={{ background: C.purpleSoft, border: "1px solid #DCC9E8", color: "#5A3B6E" }}
      >
        <span className="font-bold">次のステップ:</span>
        公式サイト julialang.org から juliaup で導入 → ホーム各章の「演習ノート ↓」を Pluto.jl で開いて実行 → 専用 Project.toml 環境で手元の研究データへ応用しましょう。
      </div>
      <div className="h-8" />
    </div>
  );
}

/* ============================================================
   「なぜJulia？」対話プロットコンポーネント
   ============================================================ */

function WhyJuliaInteractivePanel({ onOpen }) {
  const [workloadId, setWorkloadId] = useState("sequential");
  const [scaleIdx, setScaleIdx] = useState(2); // 既定: 大規模 (2万)
  const [runs, setRuns] = useState(8);

  const sim = useMemo(
    () => computeWhyJuliaSeries(workloadId, scaleIdx, runs),
    [workloadId, scaleIdx, runs]
  );

  // SVGプロット座標系 (680 x 285)
  const x0 = 66;
  const y0 = 32;
  const pw = 588;
  const ph = 198;
  const rawMaxY = Math.max(sim.finalDynamicSec, sim.finalRestartSec, sim.finalReviseSec, 2.0);
  const yMax = Math.ceil(rawMaxY * 1.12);
  const yTicks = [0, Number((yMax * 0.5).toFixed(1)), yMax];

  const toX = (k) => (sim.runs === 1 ? x0 + pw / 2 : x0 + ((k - 1) / (sim.runs - 1)) * pw);
  const toY = (v) => y0 + ph - (Math.min(Math.max(0, v), yMax) / yMax) * ph;

  const dynPoints = sim.points.map((p) => `${toX(p.k).toFixed(1)},${toY(p.dynamicCum).toFixed(1)}`).join(" ");
  const resPoints = sim.points.map((p) => `${toX(p.k).toFixed(1)},${toY(p.juliaRestartCum).toFixed(1)}`).join(" ");
  const revPoints = sim.points.map((p) => `${toX(p.k).toFixed(1)},${toY(p.juliaReviseCum).toFixed(1)}`).join(" ");

  const memMax = Math.max(sim.unfusedKiB, sim.fusedKiB, 1);
  const unfusedPct = Math.min(100, Math.round((sim.unfusedKiB / memMax) * 100));
  const fusedPct = sim.fusedKiB === 0 ? 0 : Math.min(100, Math.round((sim.fusedKiB / memMax) * 100));

  return (
    <div className="flex flex-col gap-5">
      <div
        className="min-w-0 rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: "1px solid " + C.line }}
      >
        <h2 className="mb-1 text-base font-bold" style={{ color: C.ink }}>
          対話プロット：処理の種類と反復回数で変わる「所要時間」と「メモリ割当」
        </h2>
        <p className="mb-3 text-xs leading-6" style={{ color: C.sub }}>
          タスクと規模・試行錯誤の回数を選んでみてください。Juliaが圧倒的に速い場面だけでなく、既存C/BLAS呼び出しで同等になる場面や、毎回プロセスを再起動すると初回コンパイル（TTFX）で逆転する理由まで正直に再現します。
        </p>

        <div className="mb-4 flex flex-col gap-2" role="group" aria-label="計算タスクの種類">
          {WHY_JULIA_WORKLOADS.map((w) => {
            const active = w.id === workloadId;
            return (
              <button
                key={w.id}
                type="button"
                aria-pressed={active}
                onClick={() => setWorkloadId(w.id)}
                className="flex min-h-11 min-w-0 items-center rounded-xl px-3.5 py-2 text-left text-xs font-bold"
                style={
                  active
                    ? { background: C.purpleDeep, color: "#FFFFFF", border: "1.5px solid " + C.purpleDeep }
                    : { background: "#FAF8F4", color: C.ink, border: "1.5px solid " + C.line }
                }
              >
                <span className="min-w-0" style={{ overflowWrap: "anywhere" }}>
                  {w.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-xl p-3" style={{ background: "#F8F6F1", border: "1px solid " + C.line }}>
            <label htmlFor="why-scale-slider" className="mb-1 block text-xs font-bold" style={{ color: C.ink }}>
              データ・反復の規模: <span style={{ color: C.purpleDeep }}>{sim.scale.label}</span>
            </label>
            <input
              id="why-scale-slider"
              type="range"
              min={0}
              max={WHY_JULIA_SCALES.length - 1}
              step={1}
              value={scaleIdx}
              onChange={(e) => setScaleIdx(Number(e.target.value))}
              className="min-h-11 w-full accent-purple-700"
            />
          </div>

          <div className="min-w-0 rounded-xl p-3" style={{ background: "#F8F6F1", border: "1px solid " + C.line }}>
            <label htmlFor="why-runs-slider" className="mb-1 block text-xs font-bold" style={{ color: C.ink }}>
              関数を修正して試す回数 K: <span style={{ color: C.purpleDeep, fontFamily: MONO }}>{sim.runs} 回</span>
            </label>
            <input
              id="why-runs-slider"
              type="range"
              min={1}
              max={12}
              step={1}
              value={runs}
              onChange={(e) => setRuns(Number(e.target.value))}
              className="min-h-11 w-full accent-purple-700"
            />
          </div>
        </div>

        <figure
          className="min-w-0 overflow-hidden rounded-xl p-2 sm:p-3"
          style={{ background: "#FAF8F4", border: "1px solid " + C.line }}
        >
          <svg
            viewBox="0 0 680 285"
            role="img"
            aria-label={`${sim.workload.shortLabel}における試行回数1から${sim.runs}回までの累積待ち時間比較プロット`}
            className="mx-auto block h-auto w-full max-w-full rounded-lg bg-white"
          >
            <rect width="680" height="285" rx="8" fill="#FFFFFF" />
            {yTicks.map((yv, idx) => {
              const yy = toY(yv);
              return (
                <g key={idx}>
                  <line x1={x0} y1={yy} x2={x0 + pw} y2={yy} stroke="#ECE8DF" strokeWidth="1" />
                  <text
                    x={x0 - 8}
                    y={yy + 4}
                    textAnchor="end"
                    fill={C.sub}
                    fontSize="11.5"
                    fontFamily={MONO}
                  >
                    {yv}s
                  </text>
                </g>
              );
            })}
            {sim.points.map((p) => {
              const xx = toX(p.k);
              return (
                <g key={p.k}>
                  <line x1={xx} y1={y0 + ph} x2={xx} y2={y0 + ph + 5} stroke="#8A8296" strokeWidth="1.2" />
                  <text
                    x={xx}
                    y={y0 + ph + 19}
                    textAnchor="middle"
                    fill={C.sub}
                    fontSize="11"
                    fontFamily={MONO}
                  >
                    {p.k}
                  </text>
                </g>
              );
            })}
            <rect x={x0} y={y0} width={pw} height={ph} fill="none" stroke="#8A8296" strokeWidth="1.2" />
            <text x={x0 + pw / 2} y={19} textAnchor="middle" fill={C.ink} fontSize="13" fontWeight="700">
              {sim.workload.shortLabel}（規模: {sim.scale.label}）— 累積待ち時間の推移
            </text>
            <text x={x0 + pw / 2} y={y0 + ph + 40} textAnchor="middle" fill={C.ink} fontSize="12" fontWeight="600">
              試行錯誤・再実行した回数 K
            </text>
            <text
              x={18}
              y={y0 + ph / 2}
              textAnchor="middle"
              transform={`rotate(-90 18 ${y0 + ph / 2})`}
              fill={C.ink}
              fontSize="12"
              fontWeight="600"
            >
              累積所要時間 (秒)
            </text>

            {sim.runs > 1 && (
              <>
                <polyline
                  fill="none"
                  stroke="#D97724"
                  strokeWidth="2.6"
                  strokeDasharray="7 4"
                  points={dynPoints}
                />
                <polyline
                  fill="none"
                  stroke={C.red}
                  strokeWidth="2.1"
                  strokeDasharray="3 3"
                  points={resPoints}
                />
                <polyline fill="none" stroke={C.greenText} strokeWidth="3.0" points={revPoints} />
              </>
            )}

            {sim.points.map((p) => (
              <g key={`mk-${p.k}`}>
                <circle cx={toX(p.k)} cy={toY(p.dynamicCum)} r="4.0" fill="#D97724" />
                <rect
                  x={toX(p.k) - 3.2}
                  y={toY(p.juliaRestartCum) - 3.2}
                  width="6.4"
                  height="6.4"
                  fill={C.red}
                />
                <circle cx={toX(p.k)} cy={toY(p.juliaReviseCum)} r="4.5" fill={C.greenText} />
              </g>
            ))}
          </svg>

          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="font-bold" style={{ color: C.greenText }}>
              ● 緑実線: Julia 常駐REPL + Revise ({sim.finalReviseSec}s)
            </span>
            <span className="font-bold" style={{ color: "#B85C11" }}>
              ● 橙破線: 動的純ループ・非融合 ({sim.finalDynamicSec}s)
            </span>
            <span className="font-bold" style={{ color: C.red }}>
              ■ 赤点線: Julia 毎回プロセス再起動 ({sim.finalRestartSec}s)
            </span>
          </div>
        </figure>

        <div
          role="status"
          aria-live="polite"
          className="mt-3 rounded-xl p-3.5 text-xs leading-6"
          style={{
            background: sim.workload.verdictKind === "parity" ? C.purpleSoft : C.greenSoft,
            border: "1px solid " + (sim.workload.verdictKind === "parity" ? "#DCC9E8" : "#BFE3B4"),
            color: C.ink,
          }}
        >
          <p className="font-bold" style={{ color: sim.workload.verdictKind === "parity" ? C.purpleDeep : C.greenText }}>
            {sim.runs}回試行した合計: Julia+Revise {sim.finalReviseSec}秒（2回目以降は1回 {sim.jlWarmSingleSec}秒） / 比較対象 {sim.finalDynamicSec}秒（1回 {sim.dynSingleSec}秒）
          </p>
          <p className="mt-1">
            <T>{sim.workload.summary}</T>
          </p>
        </div>

        <div className="mt-4 rounded-xl p-3.5" style={{ background: "#F8F6F1", border: "1px solid " + C.line }}>
          <div className="mb-2 text-xs font-bold" style={{ color: C.ink }}>
            1回の実行で発生する一時ヒープメモリ割当（規模: {sim.scale.elements.toLocaleString()} 要素・ステップ）
          </div>
          <div className="flex flex-col gap-2 text-xs">
            <div>
              <div className="mb-1 flex flex-wrap justify-between gap-1">
                <span style={{ color: C.body }}>非融合の一時配列 / 動的ボクシング</span>
                <span style={{ fontFamily: MONO, color: C.red, fontWeight: 700 }}>{sim.unfusedKiB} KiB</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: C.track }}>
                <div className="h-full rounded-full" style={{ width: `${unfusedPct}%`, background: C.red }} />
              </div>
            </div>
            <div>
              <div className="mb-1 flex flex-wrap justify-between gap-1">
                <span style={{ color: C.body }}>Julia 型安定ループ / `@.` ドット融合（事前確保）</span>
                <span style={{ fontFamily: MONO, color: C.greenText, fontWeight: 700 }}>{sim.fusedKiB} KiB</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: C.track }}>
                <div className="h-full rounded-full" style={{ width: `${fusedPct}%`, background: C.greenText }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="min-w-0 rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: "1px solid " + C.line }}
      >
        <h2 className="mb-2 text-base font-bold" style={{ color: C.ink }}>
          実測プロットと再現コードでさらに深く確かめる（全4レッスン）
        </h2>
        <p className="mb-3 text-xs leading-6" style={{ color: C.sub }}>
          上の構造モデルだけでなく、純Juliaで実際に計測・生成した決定論的SVGプロット（二言語問題・ドット融合の厳密バイト数・自動微分 `Dual` 数が有限差分のV字曲線を突破する瞬間・無改造RK4ソルバを貫通する誤差伝播）を各レッスンに収録しています。
        </p>
        <div className="flex flex-col gap-2.5">
          {[
            {
              id: "why-julia-visualized",
              badge: "補11",
              title: "プロットで見るJuliaの強みと適材適所",
              desc: "逐次ループ割当0B・@.ドット融合・自動微分のV字曲線突破・R/Pythonとの賢い分業ライン",
            },
            {
              id: "julian-design-patterns",
              badge: "補12",
              title: "Juliaらしい設計技法：多重ディスパッチ・ゼロコスト構造体・マクロ",
              desc: "無改造RK4ソルバを貫通する誤差伝播Uncertain・isbits連続メモリ配列・構文木ExprマクロとHoly Traits",
            },
            {
              id: "julia-introduction",
              badge: "01",
              title: "Juliaってなに?",
              desc: "はじめての方向け：二言語問題の解消とJuliaが得意な計算領域の2パネル図解",
            },
            {
              id: "daily-workflow-tools",
              badge: "補10",
              title: "研究を加速するJulia実用ツールと開発習慣",
              desc: "Revise.jlによる再起動ゼロ開発・@testset自動検算・@btime計測・論文表自動出力",
            },
          ].map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => onOpen(card.id)}
              className="flex min-h-11 min-w-0 flex-wrap items-center gap-3 rounded-xl p-3 text-left transition-shadow hover:shadow-sm"
              style={{ background: "#FAF8F4", border: "1px solid " + C.line }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                style={{ background: C.purpleSoft, color: C.purpleDeep, fontFamily: MONO }}
              >
                {card.badge}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold" style={{ color: C.ink, overflowWrap: "anywhere" }}>
                  {card.title}
                </span>
                <span className="block text-xs" style={{ color: C.sub, overflowWrap: "anywhere" }}>
                  {card.desc}
                </span>
              </span>
              <span className="shrink-0 text-xs font-bold" style={{ color: C.purpleDeep }}>
                開く →
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   逆引き対訳・スターターレシピ・メリット図解画面 (#why-julia / #toolkit / #toolkit/recipes)
   ============================================================ */

function normalizeToolkitTab(t) {
  if (t === "why") return "why";
  if (t === "recipes") return "recipes";
  return "rosetta";
}

function ToolkitView({
  onHome,
  onOpen,
  onCheat,
  initialQuery = "",
  initialTab = "rosetta",
  initialRecipeId = "",
  onTabChange,
}) {
  const [tab, setTab] = useState(() => normalizeToolkitTab(initialTab));
  const [group, setGroup] = useState("すべて");
  const [query, setQuery] = useState(initialQuery);
  const [selectedRecipeId, setSelectedRecipeId] = useState(
    () => STARTER_RECIPES.find((r) => r.id === initialRecipeId)?.id || STARTER_RECIPES[0].id
  );
  const searchRef = useRef(null);

  useEffect(() => {
    setTab(normalizeToolkitTab(initialTab));
  }, [initialTab]);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (initialRecipeId && STARTER_RECIPES.some((r) => r.id === initialRecipeId)) {
      setSelectedRecipeId(initialRecipeId);
    }
  }, [initialRecipeId]);

  const switchTab = (nextTab) => {
    setTab(nextTab);
    if (onTabChange) onTabChange(nextTab);
  };

  const hasQuery = query.trim().length > 0;
  const visibleRosetta = useMemo(() => filterRosetta(ROSETTA_ITEMS, group, query), [group, query]);
  const activeRecipe = useMemo(
    () => STARTER_RECIPES.find((r) => r.id === selectedRecipeId) || STARTER_RECIPES[0],
    [selectedRecipeId]
  );

  return (
    <div className="rise">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <button
          className="inline-flex min-h-11 items-center text-sm font-bold"
          style={{ color: C.purpleDeep }}
          onClick={onHome}
        >
          ← もどる
        </button>
        <div className="flex flex-wrap items-center gap-3">
          {onCheat && (
            <button
              type="button"
              className="inline-flex min-h-11 items-center text-xs font-bold underline"
              style={{ color: C.purpleDeep }}
              onClick={() => onCheat(query)}
            >
              チートシート
            </button>
          )}
          <TriDots filled={3} size={10} />
        </div>
      </div>

      <h1 tabIndex={-1} className="mb-1 text-2xl font-bold tracking-tight" style={{ color: C.ink }}>
        Julia 逆引き・スターターレシピ
      </h1>
      <p className="mb-4 text-sm leading-6" style={{ color: C.sub }}>
        R・Python経験者が迷いやすい構文の対訳辞典と、手元の研究へそのままコピー＆保存して使える目的別スタータースクリプト集です。
      </p>

      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="ツール切り替え">
        {[
          { id: "why", label: "なぜJulia？（対話プロット）" },
          { id: "rosetta", label: `R・Python → Julia 逆引き対訳 (${ROSETTA_ITEMS.length})` },
          { id: "recipes", label: `目的別スターターレシピ (${STARTER_RECIPES.length})` },
        ].map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => switchTab(item.id)}
              className="inline-flex min-h-11 items-center rounded-xl px-3.5 py-2 text-xs font-bold"
              style={
                active
                  ? { background: C.purpleDeep, color: "#FFFFFF", border: "1.5px solid " + C.purpleDeep }
                  : { background: "#FFFFFF", color: C.body, border: "1.5px solid " + C.line }
              }
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "why" ? (
        <WhyJuliaInteractivePanel onOpen={onOpen} />
      ) : tab === "rosetta" ? (
        <div>
          <div role="search" aria-label="逆引き対訳検索" className="mb-3">
            <label htmlFor="toolkit-search" className="mb-1.5 block text-xs font-bold" style={{ color: C.ink }}>
              R・Python・Juliaの関数名ややりたいことで探す
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="toolkit-search"
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="例: pivot_longer, np.where, lmer, ggplot, solve_ivp…"
                className="min-h-11 w-full min-w-0 rounded-xl bg-white px-3 py-2 text-sm sm:w-auto sm:flex-1"
                style={{ border: "1.5px solid " + C.line, color: C.ink }}
              />
              {hasQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 py-2 text-xs font-bold"
                  style={{ background: C.purpleSoft, color: C.purpleDeep }}
                >
                  クリア
                </button>
              )}
            </div>
            <p role="status" aria-live="polite" className="mt-2 text-xs" style={{ color: C.sub }}>
              {visibleRosetta.length} 件の対訳が一致
            </p>
          </div>

          <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="分野絞り込み">
            {ROSETTA_GROUPS.map((g) => {
              const active = group === g;
              return (
                <button
                  key={g}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setGroup(g)}
                  className="inline-flex min-h-11 items-center rounded-full px-3.5 py-1.5 text-xs font-bold"
                  style={
                    active
                      ? { background: C.purple, color: "#FFFFFF", border: "1.5px solid " + C.purple }
                      : { background: "#FFFFFF", color: C.body, border: "1.5px solid " + C.line }
                  }
                >
                  {g}
                </button>
              );
            })}
          </div>

          {visibleRosetta.length === 0 ? (
            <div
              className="rounded-2xl bg-white p-5 text-sm leading-6"
              style={{ border: "1px solid " + C.line, color: C.sub }}
            >
              <p className="font-bold" style={{ color: C.ink }}>
                条件に一致する対訳が見つかりませんでした。
              </p>
              <button
                type="button"
                onClick={() => {
                  setGroup("すべて");
                  setQuery("");
                  searchRef.current?.focus();
                }}
                className="mt-3 inline-flex min-h-11 items-center rounded-xl px-3.5 py-2 text-xs font-bold"
                style={{ background: C.purpleSoft, color: C.purpleDeep }}
              >
                分野と検索をリセット
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {visibleRosetta.map((item) => (
                <article
                  key={item.id}
                  className="min-w-0 rounded-2xl bg-white p-4 sm:p-5"
                  style={{ border: "1px solid " + C.line }}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                      style={{ background: C.purpleSoft, color: C.purpleDeep }}
                    >
                      {item.group}
                    </span>
                    <h2 className="min-w-0 text-base font-bold" style={{ color: C.ink, overflowWrap: "anywhere" }}>
                      {item.task}
                    </h2>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div
                      className="min-w-0 rounded-xl p-2.5"
                      style={{ background: "#F8F6F1", border: "1px solid " + C.line }}
                    >
                      <div className="mb-1 text-xs font-bold" style={{ color: C.sub }}>
                        R (tidyverse / base)
                      </div>
                      <code
                        className="block text-xs leading-5"
                        style={{ color: C.ink, fontFamily: MONO, overflowWrap: "anywhere" }}
                      >
                        {item.rCode}
                      </code>
                    </div>
                    <div
                      className="min-w-0 rounded-xl p-2.5"
                      style={{ background: "#F8F6F1", border: "1px solid " + C.line }}
                    >
                      <div className="mb-1 text-xs font-bold" style={{ color: C.sub }}>
                        Python (NumPy / pandas / scipy)
                      </div>
                      <code
                        className="block text-xs leading-5"
                        style={{ color: C.ink, fontFamily: MONO, overflowWrap: "anywhere" }}
                      >
                        {item.pyCode}
                      </code>
                    </div>
                  </div>

                  <CodeBlock code={item.juliaCode} />

                  <div
                    className="rounded-xl p-3 text-xs leading-6"
                    style={{ background: "#FFF8EC", border: "1px solid #EFE0BE", color: "#6E4D12" }}
                  >
                    <span className="font-bold">落とし穴・違い: </span>
                    <T>{item.pitfall}</T>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-end">
                    <button
                      type="button"
                      onClick={() => onOpen(item.lessonId)}
                      className="inline-flex min-h-11 items-center text-left text-xs font-bold underline"
                      style={{ color: C.purpleDeep, overflowWrap: "anywhere" }}
                    >
                      → 関連レッスン「{item.lessonTitle}」を開く
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <p className="mb-3 text-xs leading-5" style={{ color: C.sub }}>
            やりたい分析を選ぶと、必要なパッケージ追加コマンド・そのまま動く <code>.jl</code> 雛形・実行前チェックリストが表示されます。コード右上の「コピー」でプロンプトを除いてそのまま貼り付けられます。
          </p>
          <div className="mb-5 grid gap-2 sm:grid-cols-2" role="group" aria-label="スターターレシピ選択">
            {STARTER_RECIPES.map((r) => {
              const active = r.id === activeRecipe.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedRecipeId(r.id)}
                  className="flex min-h-11 min-w-0 items-center rounded-xl px-3.5 py-2.5 text-left text-xs font-bold"
                  style={
                    active
                      ? { background: C.purpleDeep, color: "#FFFFFF", border: "1.5px solid " + C.purpleDeep }
                      : { background: "#FFFFFF", color: C.ink, border: "1.5px solid " + C.line }
                  }
                >
                  <span className="min-w-0" style={{ overflowWrap: "anywhere" }}>
                    {r.title}
                  </span>
                </button>
              );
            })}
          </div>

          <article
            key={activeRecipe.id}
            className="min-w-0 rounded-2xl bg-white p-4 sm:p-6"
            style={{ border: "1px solid " + C.line }}
          >
            <h2 className="mb-1 text-lg font-bold" style={{ color: C.ink, overflowWrap: "anywhere" }}>
              {activeRecipe.title}
            </h2>
            <p className="mb-4 text-xs leading-5" style={{ color: C.sub }}>
              {activeRecipe.subtitle}
            </p>

            <div className="mb-4 flex flex-wrap items-center gap-2.5">
              <a
                download={activeRecipe.filename}
                href={"data:text/plain;charset=utf-8," + encodeURIComponent(activeRecipe.code + "\n")}
                className="inline-flex min-h-11 items-center rounded-full px-4 py-2 text-xs font-bold transition-opacity hover:opacity-85"
                style={{ background: C.purple, color: "#FFFFFF", overflowWrap: "anywhere" }}
              >
                ↓ .jl ファイルを保存 ({activeRecipe.filename})
              </a>
              <button
                type="button"
                onClick={() => onOpen(activeRecipe.lessonId)}
                className="inline-flex min-h-11 items-center rounded-full px-4 py-2 text-left text-xs font-bold"
                style={{ background: C.purpleSoft, color: C.purpleDeep, overflowWrap: "anywhere" }}
              >
                → 関連レッスン「{activeRecipe.lessonTitle}」
              </button>
            </div>

            <div className="mb-1 text-xs font-bold" style={{ color: C.ink }}>
              1. パッケージ・実行準備（専用プロジェクト環境で実行）
            </div>
            <CodeBlock code={activeRecipe.pkgCmd} />

            <div className="mb-1 mt-4 text-xs font-bold" style={{ color: C.ink }}>
              2. スタータースクリプト（{activeRecipe.filename}）
            </div>
            <CodeBlock code={activeRecipe.code} />

            <div
              className="mt-4 rounded-xl p-4"
              style={{ background: C.greenSoft, border: "1px solid #BFE3B4" }}
            >
              <div className="mb-2 text-xs font-bold" style={{ color: C.greenText }}>
                3. 実データへ適用する前の3点チェック
              </div>
              <ul className="flex flex-col gap-1.5 text-xs leading-6" style={{ color: C.ink }}>
                {activeRecipe.checklist.map((item, idx) => (
                  <li key={idx} className="min-w-0" style={{ overflowWrap: "anywhere" }}>
                    ✓ <T>{item}</T>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        </div>
      )}
      <div className="h-8" />
    </div>
  );
}


export { LessonView, Home, CheatSheet, ToolkitView, Sidebar };
