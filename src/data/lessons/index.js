// レッスンの自動収集。
// 追加手順は「該当セクションのディレクトリにファイルを1つ置く」だけ——このファイルは編集不要。
// セクション順は sections.js の配列順、セクション内はファイル名順（l01-, l02- とゼロ埋め必須）。
import { SECTIONS } from "../sections.js";

const mods = import.meta.glob("./*/*.js", { eager: true });

let n = 0;
export const LESSONS = SECTIONS.flatMap((sec) =>
  Object.keys(mods)
    .filter((p) => p.startsWith(`./${sec.dir}/`))
    .sort()
    .map((p, iInSec) => ({
      ...mods[p].default,
      section: sec.dir,
      // 番号付きセクションはセクション横断の通し番号、番号なしは null(表示は mark+セクション内連番)
      num: sec.numbered ? ++n : null,
      numInSection: iInSec + 1,
    }))
);
