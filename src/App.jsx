import { useState, useCallback } from "react";
import { C, JP, GLOBAL_CSS } from "./theme.js";
import { LessonView, Home, CheatSheet } from "./views.jsx";
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
  const [progress, setProgress] = useState({ done: {} });

  const solve = useCallback((lid, i) => {
    setProgress((prev) => {
      const cur = prev.done[lid] || [];
      if (cur.includes(i)) return prev;
      return { done: { ...prev.done, [lid]: [...cur, i] } };
    });
  }, []);

  const reset = () => {
    setProgress({ done: {} });
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
        onSolve={(i) => solve(lesson.id, i)}
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
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">{body}</div>
    </div>
  );
}
