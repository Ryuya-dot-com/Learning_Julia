import { useState, useEffect, useMemo } from "react";
import { C, MONO } from "./theme.js";
import { isCodey } from "./highlight.js";
import { seededOrder } from "./shuffle.js";
import { T, CodeBlock, TriDots, Btn, ResetButton, Feedback } from "./components.jsx";
import { LESSONS } from "./data/lessons/index.js";
import { SECTIONS } from "./data/sections.js";
import { CHEATS } from "./data/cheats.js";

/* ============================================================
   練習問題コンポーネント
   ============================================================ */

function ChoiceEx({ ex, seedKey, solved, onCorrect }) {
  const [sel, setSel] = useState(solved ? ex.ans : null);
  const [status, setStatus] = useState(solved ? "correct" : "idle");
  const [showHint, setShowHint] = useState(false);
  // シードに問題文だけを使うと、同一文面の問題どうしで正解が同じ位置に固定される(監査A3)。
  // レッスンidと問indexを混ぜて、問題ごとに独立した並びにする
  const order = useMemo(() => seededOrder(ex.opts.length, seedKey + ":" + ex.q), [ex, seedKey]);

  const pick = (i) => {
    if (status === "correct") return;
    setSel(i);
    if (i === ex.ans) {
      setStatus("correct");
      onCorrect();
    } else {
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
  const [val, setVal] = useState(solved ? ex.show : "");
  const [status, setStatus] = useState(solved ? "correct" : "idle");
  const [showHint, setShowHint] = useState(false);

  const check = () => {
    if (status === "correct") return;
    // NFKC正規化で全角英数・全角記号(＝ など)を半角に写像する。
    // 日本語IMEの学生が全角のまま入力しても正答を受理する(監査A1)
    const v = val.normalize("NFKC").trim().toLowerCase();
    if (!v) return;
    if (ex.accept.includes(v)) {
      setStatus("correct");
      setVal(ex.show);
      onCorrect();
    } else {
      setStatus("wrong");
    }
  };

  return (
    <div>
      <p className="mb-1 text-base font-bold leading-relaxed" style={{ color: C.ink }}>
        <T>{ex.q}</T>
      </p>
      {ex.code && <CodeBlock code={ex.code} />}
      <div className="mt-4 flex items-stretch gap-2">
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
          placeholder={ex.placeholder || "答えを入力"}
          className="w-full rounded-xl px-4 py-3 text-sm"
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

/* ============================================================
   レッスン画面
   ============================================================ */

function LessonView({ lesson, doneSet, onSolve, onHome, onNextLesson, hasNext, onCheat }) {
  // 番号なしレッスン(bridge/extra)は「LESSON null」にならないようセクション名を表示する(仕様4.4b)
  const sec = SECTIONS.find((s) => s.dir === lesson.section);
  const headLabel = lesson.num != null ? `LESSON ${lesson.num}` : (sec ? sec.title : "");
  const doneLabel = lesson.num != null ? `レッスン${lesson.num} 修了!` : `${lesson.title} 修了!`;
  const items = useMemo(() => {
    const arr = lesson.pages.map((p) => ({ kind: "page", p }));
    lesson.ex.forEach((e, i) => arr.push({ kind: "ex", e, i }));
    arr.push({ kind: "done" });
    return arr;
  }, [lesson]);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    try {
      window.scrollTo({ top: 0 });
    } catch (e) {}
  }, [idx]);

  const cur = items[idx];
  const total = lesson.ex.length;
  const solvedCount = doneSet.size;
  const pct = Math.round((idx / (items.length - 1)) * 100);

  return (
    <div>
      <div className="mb-5">
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
            <h2 className="mb-4 text-xl font-bold" style={{ color: C.ink }}>
              {cur.p.t}
            </h2>
            {(cur.p.b || []).map((s, i) => (
              <p key={i} className="mb-3 text-sm leading-7" style={{ color: C.body }}>
                <T>{s}</T>
              </p>
            ))}
            {cur.p.code && <CodeBlock code={cur.p.code} output={cur.p.out} error={cur.p.err} />}
            {(cur.p.a || []).map((s, i) => (
              <p key={i} className="mb-3 text-sm leading-7" style={{ color: C.body }}>
                <T>{s}</T>
              </p>
            ))}
          </div>
        )}

        {cur.kind === "ex" && (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <span
                className="rounded-full px-3 py-1 text-xs font-bold"
                style={{ background: C.purpleSoft, color: C.purpleDeep }}
              >
                練習問題 {cur.i + 1} / {total}
              </span>
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
                onCorrect={() => onSolve(cur.i)}
              />
            ) : (
              <FillEx
                key={lesson.id + "-" + cur.i}
                ex={cur.e}
                solved={doneSet.has(cur.i)}
                onCorrect={() => onSolve(cur.i)}
              />
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
                <h2 className="mb-2 text-2xl font-bold" style={{ color: C.ink }}>
                  {doneLabel}
                </h2>
                <p className="mb-6 text-sm" style={{ color: C.sub }}>
                  練習問題 {total} 問、すべてクリアしました。
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
                <h2 className="mb-2 text-xl font-bold" style={{ color: C.ink }}>
                  おつかれさまでした
                </h2>
                <p className="mb-5 text-sm" style={{ color: C.sub }}>
                  未クリアの練習問題が {total - solvedCount} 問あります。もう一度チャレンジしてみましょう。
                </p>
                <div className="mb-5 flex flex-col items-center gap-2">
                  {lesson.ex.map(
                    (e, i) =>
                      !doneSet.has(i) && (
                        <Btn key={i} kind="ghost" onClick={() => setIdx(lesson.pages.length + i)}>
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
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <Btn kind="quiet" onClick={() => setIdx(idx - 1)} disabled={idx === 0}>
          ← 前へ
        </Btn>
        {cur.kind !== "done" && (
          <Btn onClick={() => setIdx(idx + 1)}>
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

function Home({ progress, onOpen, onCheat, onReset }) {
  const totalEx = LESSONS.reduce((s, l) => s + l.ex.length, 0);
  const doneEx = LESSONS.reduce((s, l) => s + (progress.done[l.id] || []).length, 0);
  const doneLessons = LESSONS.filter((l) => (progress.done[l.id] || []).length === l.ex.length).length;
  const allDone = doneLessons === LESSONS.length;
  const firstIncomplete = LESSONS.find((l) => (progress.done[l.id] || []).length < l.ex.length);
  const pct = Math.round((doneEx / totalEx) * 100);
  const dotsFilled = allDone ? 3 : Math.floor((doneEx / totalEx) * 3);

  return (
    <div className="rise">
      <div className="mb-4 flex items-center justify-between pt-1">
        <TriDots filled={dotsFilled} size={13} />
        <button
          className="inline-flex min-h-11 items-center text-xs font-bold underline"
          style={{ color: C.purpleDeep }}
          onClick={onCheat}
        >
          チートシート
        </button>
      </div>

      <h1 className="mb-1.5 text-3xl font-bold tracking-tight" style={{ color: C.ink }}>
        はじめてのJulia
      </h1>
      <p className="mb-6 text-sm leading-6" style={{ color: C.sub }}>
        ゼロから学ぶ、研究のためのプログラミング。{LESSONS.length}つのレッスンで、データ解析の入り口まで案内します。
      </p>

      <div className="mb-6 rounded-2xl bg-white p-5" style={{ border: "1px solid " + C.line }}>
        <div className="mb-2 flex items-baseline justify-between">
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

      <div className="flex flex-col gap-7">
        {SECTIONS.map((sec) => {
          // レッスンが0本のセクションは表示しない(仕様4.3。移行直後は基礎編のみが並ぶ)
          const ls = LESSONS.filter((l) => l.section === sec.dir);
          if (ls.length === 0) return null;
          return (
            <div key={sec.dir}>
              <div className="mb-2.5 flex items-baseline gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 self-center rounded-full"
                  style={{ background: sec.color }}
                  aria-hidden="true"
                />
                <h2 className="text-sm font-bold" style={{ color: C.ink }}>
                  {sec.title}
                </h2>
                <span className="text-xs" style={{ color: C.sub }}>
                  {sec.sub}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {ls.map((l) => {
                  const got = (progress.done[l.id] || []).length;
                  const all = got === l.ex.length;
                  // 番号なしトラックは mark+セクション内連番(例: R1, 補1)を表示する(仕様4.4b)
                  const badge = l.num != null ? String(l.num).padStart(2, "0") : (sec.mark || "") + l.numInSection;
                  return (
                    <button
                      key={l.id}
                      onClick={() => onOpen(l.id)}
                      className="flex items-center gap-4 rounded-2xl bg-white p-4 text-left transition-shadow hover:shadow-md"
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
                        {all ? "修了" : got + " / " + l.ex.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

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
   チートシート画面
   ============================================================ */

function CheatSheet({ onHome }) {
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
      <h1 className="mb-1 text-2xl font-bold tracking-tight" style={{ color: C.ink }}>
        Julia チートシート
      </h1>
      <p className="mb-5 text-sm" style={{ color: C.sub }}>
        レッスンで学んだ文法の早見表です。分析のおともに、いつでも見返せます。
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {CHEATS.map((sec, i) => (
          <div key={i} className="rounded-2xl bg-white p-4" style={{ border: "1px solid " + C.line }}>
            <h2 className="mb-3 text-sm font-bold" style={{ color: C.purple }}>
              {sec.title}
            </h2>
            <div className="flex flex-col gap-2.5">
              {sec.rows.map((r, j) => (
                <div key={j} className="flex items-start justify-between gap-3">
                  <code
                    className="shrink-0 rounded px-1.5 py-0.5 text-xs leading-5"
                    style={{ background: "#F5F2EC", color: "#5A4470", fontFamily: MONO }}
                  >
                    {r[0]}
                  </code>
                  <span className="pt-0.5 text-right text-xs leading-5" style={{ color: C.sub }}>
                    {r[1]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div
        className="mt-5 rounded-2xl p-4 text-sm leading-6"
        style={{ background: C.purpleSoft, border: "1px solid #DCC9E8", color: "#5A3B6E" }}
      >
        <span className="font-bold">次のステップ:</span>
        公式サイト julialang.org から juliaup でインストール → ノートブック環境 Pluto.jl で手を動かす → CSV.jl・DataFrames.jl で実データの分析へ。
      </div>
      <div className="h-8" />
    </div>
  );
}


export { LessonView, Home, CheatSheet };
