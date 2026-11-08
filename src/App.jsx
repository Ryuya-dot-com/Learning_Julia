import { useState, useEffect, useCallback, useRef } from "react";
import { C, JP, GLOBAL_CSS } from "./theme.js";
import { LessonView, Home, CheatSheet, ToolkitView, Sidebar } from "./views.jsx";
import { LESSONS, loadLesson } from "./data/lessons/index.js";
import { parseHashRoute, formatHashRoute } from "./route.js";

/* ============================================================
   アプリ本体
   進捗はセッション内のみ保持する(意図的に永続化しない——仕様5節)。
   リロードでリセットされる。
   ============================================================ */

// 「次のレッスン」の遷移規則(仕様4.4b):
// - 番号付きレッスンは num 連番で次へ。最後の番号付きが終端で、
//   番号なしトラック(bridge/extra)へは流れ込まない
// - 番号なしレッスンは同一セクション内のみ次へ
function nextLessonOf(lesson) {
  if (lesson.num != null) {
    return LESSONS.find((l) => l.num === lesson.num + 1) || null;
  }
  const secLessons = LESSONS.filter((l) => l.section === lesson.section);
  const i = secLessons.findIndex((l) => l.id === lesson.id);
  return secLessons[i + 1] || null;
}

function LessonRoute({ meta, step, onStepChange, progress, onSolve, onHome, onOpen, onCheat, onToolkit }) {
  const [state, setState] = useState({ lesson: null, error: null });

  useEffect(() => {
    let active = true;
    loadLesson(meta.id).then(
      (lesson) => active && setState({ lesson, error: null }),
      (error) => active && setState({ lesson: null, error })
    );
    return () => {
      active = false;
    };
  }, [meta.id]);

  if (state.error) {
    return (
      <div className="rise rounded-2xl bg-white p-5" role="alert" style={{ border: "1px solid " + C.line }}>
        <h1 className="text-lg font-bold">レッスンを読み込めませんでした</h1>
        <p className="mt-2 text-sm" style={{ color: C.sub }}>
          通信状態を確認して、ページを再読み込みしてください。
        </p>
        <button className="mt-4 min-h-11 text-sm font-bold underline" style={{ color: C.purpleDeep }} onClick={onHome}>
          ← ホームへもどる
        </button>
      </div>
    );
  }

  if (!state.lesson) {
    return (
      <div className="rise rounded-2xl bg-white p-5 text-sm" role="status" style={{ border: "1px solid " + C.line, color: C.sub }}>
        「{meta.title}」を読み込んでいます…
      </div>
    );
  }

  const lesson = state.lesson;
  const next = nextLessonOf(meta);
  return (
    <LessonView
      lesson={lesson}
      step={step}
      onStepChange={onStepChange}
      doneSet={new Set(progress.done[lesson.id] || [])}
      firstSet={new Set(progress.first[lesson.id] || [])}
      onSolve={(i, first) => onSolve(lesson.id, i, first)}
      onHome={onHome}
      hasNext={next != null}
      onNextLesson={() => next && onOpen(next.id)}
      onCheat={onCheat}
      onToolkit={onToolkit}
    />
  );
}

export default function JuliaLearningApp() {
  const [view, setView] = useState(() => (
    typeof window !== "undefined"
      ? parseHashRoute(window.location.hash, LESSONS) || { name: "home" }
      : { name: "home" }
  ));
  const mainRef = useRef(null);
  const viewKey = view.name === "lesson" ? view.id : view.name;
  const previousView = useRef(viewKey);

  const syncHistory = useCallback((nextView, mode = "push") => {
    if (typeof window === "undefined") return;
    const hash = formatHashRoute(nextView);
    if (window.location.hash === hash) return;
    const targetUrl = window.location.pathname + window.location.search + hash;
    if (mode === "replace") {
      window.history.replaceState(null, "", targetUrl);
    } else {
      window.history.pushState(null, "", targetUrl);
    }
  }, []);

  const navigate = useCallback((nextView) => {
    syncHistory(nextView, "push");
    setView(nextView);
  }, [syncHistory]);

  const handleStepChange = useCallback((id, step) => {
    const nextView = { name: "lesson", id, step };
    syncHistory(nextView, "replace");
    setView((prev) => (prev.name === "lesson" && prev.id === id ? nextView : prev));
  }, [syncHistory]);

  useEffect(() => {
    const onLocationChange = () => {
      const parsed = parseHashRoute(window.location.hash, LESSONS);
      if (!parsed) return;
      setView((prev) => {
        if (
          prev.name === parsed.name &&
          prev.id === parsed.id &&
          (prev.step || 1) === (parsed.step || 1) &&
          (prev.tab || "rosetta") === (parsed.tab || "rosetta")
        ) {
          return prev;
        }
        return parsed;
      });
    };
    window.addEventListener("popstate", onLocationChange);
    window.addEventListener("hashchange", onLocationChange);
    return () => {
      window.removeEventListener("popstate", onLocationChange);
      window.removeEventListener("hashchange", onLocationChange);
    };
  }, []);

  useEffect(() => {
    const title = view.name === "lesson" ? LESSONS.find((l) => l.id === view.id)?.title :
      view.name === "cheat" ? "Julia チートシート" :
      view.name === "toolkit" ? "Julia 逆引き・スターターレシピ" : null;
    document.title = title ? `${title} — はじめてのJulia` : "はじめてのJulia — 研究室のためのプログラミング入門";
    if (previousView.current !== viewKey) {
      (mainRef.current.querySelector("h1") || mainRef.current).focus();
      window.scrollTo({ top: 0 });
    }
    previousView.current = viewKey;
  }, [viewKey]);
  // done: クリア済み問題 / first: 初見(誤答なし)でクリアした問題。修了と測定を分ける2層設計(仕様5節)
  const [progress, setProgress] = useState({ done: {}, first: {} });
  const [cheatQuery, setCheatQuery] = useState("");
  const [toolkitQuery, setToolkitQuery] = useState("");
  const [toolkitRecipeId, setToolkitRecipeId] = useState("");

  const solve = useCallback((lid, i, firstTry) => {
    setProgress((prev) => {
      const cur = prev.done[lid] || [];
      if (cur.includes(i)) return prev;
      const next = { done: { ...prev.done, [lid]: [...cur, i] }, first: prev.first };
      if (firstTry) next.first = { ...prev.first, [lid]: [...(prev.first[lid] || []), i] };
      return next;
    });
  }, []);

  const openLesson = useCallback((id) => navigate({ name: "lesson", id, step: 1 }), [navigate]);
  const openHome = useCallback(() => navigate({ name: "home" }), [navigate]);
  const openCheat = useCallback((initialQuery) => {
    setCheatQuery(typeof initialQuery === "string" ? initialQuery : "");
    navigate({ name: "cheat" });
  }, [navigate]);
  const openToolkit = useCallback((initialQuery, tab = "rosetta", recipeId = "") => {
    setToolkitQuery(typeof initialQuery === "string" ? initialQuery : "");
    setToolkitRecipeId(typeof recipeId === "string" ? recipeId : "");
    const normalized = tab === "why" ? "why" : tab === "recipes" ? "recipes" : "rosetta";
    navigate({ name: "toolkit", tab: normalized });
  }, [navigate]);
  const handleToolkitTab = useCallback((tab) => {
    const normalized = tab === "why" ? "why" : tab === "recipes" ? "recipes" : "rosetta";
    const nextView = { name: "toolkit", tab: normalized };
    syncHistory(nextView, "replace");
    setView(nextView);
  }, [syncHistory]);

  const reset = () => {
    setProgress({ done: {}, first: {} });
    navigate({ name: "home" });
  };

  let body = null;
  if (view.name === "lesson") {
    const meta = LESSONS.find((l) => l.id === view.id) || LESSONS[0];
    body = (
      <LessonRoute
        key={meta.id}
        meta={meta}
        step={view.step || 1}
        onStepChange={(step) => handleStepChange(meta.id, step)}
        progress={progress}
        onSolve={solve}
        onHome={openHome}
        onOpen={openLesson}
        onCheat={openCheat}
        onToolkit={openToolkit}
      />
    );
  } else if (view.name === "cheat") {
    body = <CheatSheet onHome={openHome} onToolkit={openToolkit} initialQuery={cheatQuery} />;
  } else if (view.name === "toolkit") {
    body = (
      <ToolkitView
        onHome={openHome}
        onOpen={openLesson}
        onCheat={openCheat}
        initialQuery={toolkitQuery}
        initialTab={view.tab || "rosetta"}
        initialRecipeId={toolkitRecipeId}
        onTabChange={handleToolkitTab}
      />
    );
  } else {
    body = (
      <Home
        lessons={LESSONS}
        progress={progress}
        onOpen={openLesson}
        onCheat={openCheat}
        onToolkit={openToolkit}
        onReset={reset}
      />
    );
  }

  return (
    <div className="min-h-screen" style={{ background: C.paper, fontFamily: JP, color: C.ink }}>
      <style>{GLOBAL_CSS}</style>
      <a href="#main-content" className="skip-link">本文へ移動</a>
      <div
        className="h-1 w-full"
        style={{
          background:
            "linear-gradient(90deg, " +
            C.red + " 0%, " + C.red + " 33.4%, " +
            C.green + " 33.4%, " + C.green + " 66.7%, " +
            C.purple + " 66.7%, " + C.purple + " 100%)",
        }}
      />
      <div className="mx-auto flex w-full max-w-5xl justify-center gap-10 px-4 py-6 sm:py-10">
        <Sidebar
          lessons={LESSONS}
          progress={progress}
          viewName={view.name}
          currentId={view.name === "lesson" ? view.id : null}
          onOpen={openLesson}
          onCheat={openCheat}
          onToolkit={openToolkit}
          onHome={openHome}
        />
        <main id="main-content" ref={mainRef} tabIndex={-1} aria-label="本文" className="w-full min-w-0 max-w-2xl">
          {body}
        </main>
      </div>
    </div>
  );
}
