import { useState, useCallback } from "react";
import { C, JP, GLOBAL_CSS } from "./theme.js";
import { LessonView, Home, CheatSheet, Sidebar } from "./views.jsx";
import { LESSONS } from "./data/lessons/index.js";

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

export default function JuliaLearningApp() {
  const [view, setView] = useState({ name: "home" });
  // done: クリア済み問題 / first: 初見(誤答なし)でクリアした問題。修了と測定を分ける2層設計(仕様5節)
  const [progress, setProgress] = useState({ done: {}, first: {} });

  const solve = useCallback((lid, i, firstTry) => {
    setProgress((prev) => {
      const cur = prev.done[lid] || [];
      if (cur.includes(i)) return prev;
      const next = { done: { ...prev.done, [lid]: [...cur, i] }, first: prev.first };
      if (firstTry) next.first = { ...prev.first, [lid]: [...(prev.first[lid] || []), i] };
      return next;
    });
  }, []);

  const reset = () => {
    setProgress({ done: {}, first: {} });
    setView({ name: "home" });
  };

  let body = null;
  if (view.name === "lesson") {
    const lesson = LESSONS.find((l) => l.id === view.id) || LESSONS[0];
    const next = nextLessonOf(lesson);
    body = (
      <LessonView
        key={lesson.id}
        lesson={lesson}
        doneSet={new Set(progress.done[lesson.id] || [])}
        firstSet={new Set(progress.first[lesson.id] || [])}
        onSolve={(i, first) => solve(lesson.id, i, first)}
        onHome={() => setView({ name: "home" })}
        hasNext={next != null}
        onNextLesson={() => next && setView({ name: "lesson", id: next.id })}
        onCheat={() => setView({ name: "cheat" })}
      />
    );
  } else if (view.name === "cheat") {
    body = <CheatSheet onHome={() => setView({ name: "home" })} />;
  } else {
    body = (
      <Home
        progress={progress}
        onOpen={(id) => setView({ name: "lesson", id })}
        onCheat={() => setView({ name: "cheat" })}
        onReset={reset}
      />
    );
  }

  return (
    <div className="min-h-screen" style={{ background: C.paper, fontFamily: JP, color: C.ink }}>
      <style>{GLOBAL_CSS}</style>
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
          progress={progress}
          viewName={view.name}
          currentId={view.name === "lesson" ? view.id : null}
          onOpen={(id) => setView({ name: "lesson", id })}
          onCheat={() => setView({ name: "cheat" })}
          onHome={() => setView({ name: "home" })}
        />
        <div className="w-full min-w-0 max-w-2xl">{body}</div>
      </div>
    </div>
  );
}
