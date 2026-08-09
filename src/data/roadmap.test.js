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
const NEXT_EXPANSION = [
  ["複数CSVを安全に一つの表へ", "公開中"],
  ["分析成果物を再利用できる形で書き出す", "公開中"],
  ["分布を当てはめ、予測で反証する", "公開中"],
  ["観測境界と依存を分布へ戻す", "公開中"],
];

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

  it("完了した拡充を順序・完了条件・対象外の境界まで記録する", () => {
    expect(html).toContain("拡充スプリント・P0〜P1完了");
    expect(html).toContain("番号付き37本は維持");

    let previousIndex = -1;
    for (const [title, status] of NEXT_EXPANSION) {
      const index = html.indexOf(`${title}(${status})`);
      expect(index, `「${title}」の計画カード`).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }

    for (const contract of [
      "0件・型違反・列違反・重複キー",
      "同名異内容の出力を拒否",
      "平均だけ合う誤モデルの反例",
      "混合分布は生成・読解まで",
      "共通の公開ゲート",
      "CSV.Rows",
      "CSV.Chunks",
    ]) {
      expect(html, `${contract}が完了スプリントにない`).toContain(contract);
    }
  });

  it("長期計画はNow・Next・Later・Holdを昇格条件つきで分ける", () => {
    expect(html).toContain('id="strategic-horizons"');
    expect(html).toContain("長期運用ロードマップ・判断規準");

    const horizons = ["now", "next", "later", "hold"];
    let previousIndex = -1;
    for (const horizon of horizons) {
      const marker = `data-strategy-horizon="${horizon}"`;
      const index = html.indexOf(marker);
      expect(index, `${horizon} horizon`).toBeGreaterThan(previousIndex);
      previousIndex = index;
      expect(html.match(new RegExp(marker, "g"))).toHaveLength(1);
    }

    for (const contract of [
      "候補を公開教材へ昇格させる5つの問い",
      "parameter recovery",
      "install時間",
      "少なくとも2つの利用例か再現可能benchmark",
      "外部telemetryは導入しません",
      "混合分布の自動推定",
      "撤退可能性",
    ]) {
      expect(html, `${contract}が長期判断規準にない`).toContain(contract);
    }
  });
});
