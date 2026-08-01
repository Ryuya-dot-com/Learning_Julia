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
