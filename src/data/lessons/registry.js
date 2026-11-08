import { SECTIONS } from "../sections.js";

// ファイル名順と sections.js を唯一の採番規則として、軽量カタログと
// テスト用の全量データに同じ section / num / numInSection を付ける。
export function addLessonPositions(entries) {
  let n = 0;
  return SECTIONS.flatMap((sec) =>
    entries
      .filter((entry) => entry.path.startsWith(`${sec.dir}/`))
      .sort((a, b) => a.path.localeCompare(b.path, "en"))
      .map((entry, iInSec) => ({
        ...entry,
        section: sec.dir,
        num: sec.numbered ? ++n : null,
        numInSection: iInSec + 1,
      }))
  );
}

// 問題番号は ex の添字のまま保ち、進捗と選択肢の並びを変えない。
export function buildLessonItems(lesson) {
  const exercises = lesson.ex.map((e, i) => {
    const pages = e.afterPage === undefined ? [] : lesson.pages.filter((p) => p.t === e.afterPage);
    if (e.afterPage !== undefined && pages.length !== 1) {
      throw new Error(`${lesson.id}: afterPage must match exactly one page: ${e.afterPage}`);
    }
    return { kind: "ex", e, i, reviewPage: pages[0] };
  });
  return [
    ...lesson.pages.flatMap((p) => [
      { kind: "page", p },
      ...exercises.filter((item) => item.reviewPage === p),
    ]),
    ...exercises.filter((item) => !item.reviewPage),
    { kind: "done" },
  ];
}
