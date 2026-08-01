// roadmap.html とレッスンデータの同期検査(監査第2回 E1 の恒久対策)。
// roadmap.html は手書きのまま維持するが、公開レッスン数・公開中バッジが
// データとずれた状態ではテストが落ち、デプロイが止まる。
// (第1回・第2回監査で計3回、手動同期の漏れが起きたため機械検査に落とした)
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LESSONS } from "./lessons/index.js";
import { SECTIONS } from "./sections.js";

// 多カテゴリ応答回を独立追加した改訂仕様: 番号付きレッスンの全体計画は37本
const TOTAL_PLANNED_NUMBERED = 37;

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(join(root, "public", "roadmap.html"), "utf8");

const publishedDirs = new Set(LESSONS.map((l) => l.section));
const numberedCount = LESSONS.filter((l) => l.num != null).length;

describe("roadmap.html とレッスンデータの同期", () => {
  it(`メタ行: 「全${numberedCount}レッスン公開中」`, () => {
    expect(html).toContain(`全${numberedCount}レッスン公開中`);
  });

  const remaining = TOTAL_PLANNED_NUMBERED - numberedCount;
  if (remaining > 0) {
    it(`メタ行: 「続編 ${remaining}レッスン」`, () => {
      expect(html).toContain(`続編 ${remaining}レッスン`);
    });
  } else {
    it("メタ行: 完結後は「続編 n本」表記が残っていない", () => {
      expect(html).not.toMatch(/続編 \d+レッスン/);
    });
  }

  it("メタ行: 公開範囲の末尾が最後の公開済みセクション", () => {
    const last = SECTIONS.filter((s) => s.numbered && publishedDirs.has(s.dir)).at(-1);
    const short = last.title.split(" / ").at(-1);
    expect(html).toContain(`〜${short} 全`);
  });

  for (const sec of SECTIONS.filter((s) => s.numbered)) {
    const badge = `${sec.title}・公開中`;
    if (publishedDirs.has(sec.dir)) {
      it(`公開済み「${sec.title}」にバッジがある`, () => {
        expect(html).toContain(badge);
      });
    } else {
      it(`未公開「${sec.title}」にバッジがない`, () => {
        expect(html).not.toContain(badge);
      });
    }
  }

  it("番号なしトラックの公開済みレッスンはカードに(公開中)が付く", () => {
    for (const l of LESSONS.filter((l) => l.num == null)) {
      expect(html, `「${l.title}」のカード`).toContain(`${l.title}(公開中)`);
    }
  });
});
