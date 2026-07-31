// レッスンデータの検証テスト(仕様9節・改訂版)。
// レッスン追加時のミスをデプロイ前に検出する。CI ではビルド前に実行される。
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LESSONS } from "./lessons/index.js";
import { SECTIONS } from "./sections.js";

// 演習形式の許容値(仕様4.6)
const ALLOWED_K = ["choice", "fill", "tf"];

const mods = import.meta.glob("./lessons/*/*.js", { eager: true });

describe("セクション定義", () => {
  it("dir が重複していない", () => {
    const dirs = SECTIONS.map((s) => s.dir);
    expect(new Set(dirs).size).toBe(dirs.length);
  });

  it("すべてのレッスンファイルが SECTIONS 定義済みのディレクトリに属している", () => {
    const known = new Set(SECTIONS.map((s) => s.dir));
    for (const path of Object.keys(mods)) {
      const dir = path.split("/")[2]; // "./lessons/<dir>/<file>.js"
      expect(known, `${path} のセクション ${dir} が sections.js に未定義`).toContain(dir);
    }
  });

  it("番号なしセクションには mark がある(Home バッジ表示に必要)", () => {
    for (const sec of SECTIONS.filter((s) => !s.numbered)) {
      expect(sec.mark, `${sec.dir} に mark がない`).toBeTruthy();
    }
  });

  it("notebook を持ちレッスンが存在するセクションは、public/notebooks/ に実ファイルがある", () => {
    // 未執筆セクション(レッスン0本)は検査しない——移行時点でテストが恒久失敗しないように(監査指摘)
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    for (const sec of SECTIONS) {
      if (!sec.notebook) continue;
      const hasLessons = LESSONS.some((l) => l.section === sec.dir);
      if (!hasLessons) continue;
      expect(
        existsSync(join(root, "public", "notebooks", sec.notebook)),
        `${sec.dir} のノートブック ${sec.notebook} が public/notebooks/ にない`
      ).toBe(true);
    }
  });
});

describe("レッスンデータ", () => {
  it("id が重複していない", () => {
    const ids = LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(LESSONS.map((l) => [l.id, l]))("%s: 必須フィールドと採番規則", (_, l) => {
    expect(l.id).toBeTruthy();
    expect(l.title).toBeTruthy();
    expect(l.tag).toBeTruthy();
    expect(Array.isArray(l.pages) && l.pages.length > 0).toBe(true);
    expect(Array.isArray(l.ex) && l.ex.length > 0).toBe(true);
    const sec = SECTIONS.find((s) => s.dir === l.section);
    if (sec.numbered) {
      expect(typeof l.num).toBe("number");
    } else {
      expect(l.num).toBeNull();
    }
  });

  it("番号付きレッスンの num は 1 からの連番", () => {
    const nums = LESSONS.filter((l) => l.num != null).map((l) => l.num);
    expect(nums).toEqual(nums.map((_, i) => i + 1));
  });
});

describe("演習", () => {
  const allEx = LESSONS.flatMap((l) => l.ex.map((ex, i) => [`${l.id} 演習${i + 1}`, ex]));

  it.each(allEx)("%s: 形式と解答の整合", (_, ex) => {
    expect(ALLOWED_K, `k="${ex.k}" は未対応の形式`).toContain(ex.k);
    expect(typeof ex.hint).toBe("string");
    if (ex.k !== "tf") {
      // Feedback が why.length を使うため、choice/fill では why 必須(欠けると正解表示がクラッシュする)
      expect(typeof ex.why).toBe("string");
      expect(ex.why.length).toBeGreaterThan(0);
    }

    if (ex.k === "tf") {
      // tf は3記述固定・各記述に個別の why 必須(項目別フィードバックの開示——仕様5節)
      expect(Array.isArray(ex.items) && ex.items.length === 3, "tf は記述3つ").toBe(true);
      for (const it of ex.items) {
        expect(typeof it.s).toBe("string");
        expect(it.s.length).toBeGreaterThan(0);
        expect(typeof it.a).toBe("boolean");
        expect(typeof it.why).toBe("string");
        expect(it.why.length).toBeGreaterThan(0);
      }
      // 全部○・全部×は当て推量で解けるため禁止
      expect(new Set(ex.items.map((it) => it.a)).size, "○×が混在していない").toBe(2);
    }

    if (ex.k === "choice") {
      expect(Array.isArray(ex.opts) && ex.opts.length >= 2).toBe(true);
      expect(Number.isInteger(ex.ans)).toBe(true);
      expect(ex.ans).toBeGreaterThanOrEqual(0);
      expect(ex.ans).toBeLessThan(ex.opts.length);
      expect(new Set(ex.opts).size, "選択肢が重複").toBe(ex.opts.length);
    }

    if (ex.k === "fill") {
      expect(Array.isArray(ex.accept) && ex.accept.length > 0).toBe(true);
      expect(typeof ex.show).toBe("string");
      // FillEx は入力を NFKC 正規化 + 小文字化して照合する。
      // よって accept の真の不変量は「正規化・小文字化で不変」であること(仕様9節・改訂版)
      for (const a of ex.accept) {
        expect(a, `accept "${a}" が正規化形でない`).toBe(a.normalize("NFKC").toLowerCase());
      }
      expect(ex.accept, `show "${ex.show}" が accept に対応しない`).toContain(
        ex.show.normalize("NFKC").toLowerCase()
      );
    }
  });

  it("テキスト中のバッククォートが対で閉じている(T コンポーネントの描画が壊れないこと)", () => {
    const texts = [];
    for (const l of LESSONS) {
      for (const p of l.pages) texts.push(...(p.b || []), ...(p.a || []), p.t);
      for (const ex of l.ex) {
        texts.push(ex.q, ex.why, ex.hint, ...(ex.opts || []));
        for (const it of ex.items || []) texts.push(it.s, it.why);
      }
    }
    for (const t of texts.filter(Boolean)) {
      const count = (String(t).match(/`/g) || []).length;
      expect(count % 2, `バッククォートが奇数個: ${String(t).slice(0, 40)}…`).toBe(0);
    }
  });
});
