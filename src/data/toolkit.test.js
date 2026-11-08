import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isCopyableCode, hasReplPrompt, extractCopyableCode } from "../clipboard.js";
import {
  LEARNING_PATHS,
  ROSETTA_GROUPS,
  ROSETTA_ITEMS,
  STARTER_RECIPES,
  computeWhyJuliaSeries,
} from "./toolkit.js";
import { filterRosetta, filterLessonsByPath } from "../search.js";
import { LESSONS as FULL_LESSONS } from "./lessons/eager.js";
import { CHEATS } from "./cheats.js";
import { parseHashRoute, formatHashRoute } from "../route.js";

describe("1クリックコピー用プロンプト自動除去 (clipboard.js)", () => {
  it("通常のJuliaスクリプトはそのまま保持し、末尾空白だけ整える", () => {
    const src = "using Statistics\nx = [1.0, 2.0, 3.0]\nmean(x)   ";
    expect(isCopyableCode(src)).toBe(true);
    expect(hasReplPrompt(src)).toBe(false);
    expect(extractCopyableCode(src)).toBe("using Statistics\nx = [1.0, 2.0, 3.0]\nmean(x)");
  });

  it("julia> / pkg> / (@v1.12) pkg> プロンプトを剥がし、REPL出力行を除外する", () => {
    const repl = "julia> 1 + 1\n2\n\njulia> x = [10, 20]\n2-element Vector{Int64}:\n 10\n 20";
    expect(isCopyableCode(repl)).toBe(true);
    expect(hasReplPrompt(repl)).toBe(true);
    expect(extractCopyableCode(repl)).toBe("1 + 1\nx = [10, 20]");

    const pkg = "(@v1.12) pkg> activate .\n(@v1.12) pkg> add CSV DataFrames";
    expect(hasReplPrompt(pkg)).toBe(true);
    expect(extractCopyableCode(pkg)).toBe("activate .\nadd CSV DataFrames");
  });

  it("複数行のREPL入力ブロック（7空白インデント継続）を途切れさせず抽出する", () => {
    const multi = "julia> for i in 1:3\n           println(i)\n       end\n1\n2\n3";
    expect(extractCopyableCode(multi)).toBe("for i in 1:3\n    println(i)\nend");
  });

  it("穴埋め問題の〔?〕やディレクトリ構成ツリーではコピーボタンを非表示にする", () => {
    expect(isCopyableCode("pkg> add 〔?〕")).toBe(false);
    expect(isCopyableCode("project/\n├── Project.toml\n└── src/")).toBe(false);
  });
});

describe("R・Python逆引き対訳辞典とスターターレシピ (toolkit.js)", () => {
  const byId = new Map(FULL_LESSONS.map((l) => [l.id, l]));

  it("全24件の逆引き項目が実在レッスン・有効グループを参照し、バッククォートが閉じている", () => {
    expect(ROSETTA_ITEMS.length).toBeGreaterThanOrEqual(24);
    const seen = new Set();
    for (const item of ROSETTA_ITEMS) {
      expect(seen.has(item.id), `重複ID: ${item.id}`).toBe(false);
      seen.add(item.id);
      expect(ROSETTA_GROUPS).toContain(item.group);
      expect(item.group).not.toBe("すべて");
      expect(item.task.length).toBeGreaterThan(4);
      expect(item.rCode.length).toBeGreaterThan(2);
      expect(item.pyCode.length).toBeGreaterThan(2);
      expect(item.juliaCode.length).toBeGreaterThan(5);
      expect((item.pitfall.match(/`/g) || []).length % 2, `${item.id} のバッククォート不整合`).toBe(0);

      const lesson = byId.get(item.lessonId);
      expect(lesson, `${item.id} の lessonId=${item.lessonId} が存在しない`).toBeTruthy();
      expect(item.lessonTitle).toBe(lesson.title);
    }
  });

  it("全10件のスターターレシピが .jl ファイル名・チェックリスト3項目・実在レッスンを持つ", () => {
    expect(STARTER_RECIPES).toHaveLength(10);
    const seenFiles = new Set();
    for (const r of STARTER_RECIPES) {
      expect(r.filename).toMatch(/^starter_\d+_[a-z0-9_]+\.jl$/);
      expect(seenFiles.has(r.filename)).toBe(false);
      seenFiles.add(r.filename);
      expect(r.pkgCmd).toMatch(/^(?:pkg>\s+add\s+|julia\s+)/);
      expect(r.checklist).toHaveLength(3);
      for (const c of r.checklist) {
        expect((c.match(/`/g) || []).length % 2).toBe(0);
      }
      expect(isCopyableCode(r.code)).toBe(true);
      const lesson = byId.get(r.lessonId);
      expect(lesson, `${r.id} の lessonId=${r.lessonId} が存在しない`).toBeTruthy();
      expect(r.lessonTitle).toBe(lesson.title);
      if (r.relatedLessonIds) {
        for (const relId of r.relatedLessonIds) {
          expect(byId.has(relId), `${r.id} の relatedLessonId=${relId} が存在しない`).toBe(true);
        }
      }
    }
  });

  it("目的別コース定義 (LEARNING_PATHS) と filterLessonsByPath が全実在レッスンと未クリア状態を正しく絞り込む", () => {
    expect(LEARNING_PATHS.map((p) => p.id)).toEqual([
      "all",
      "quickstart",
      "r-python-model",
      "sim-bayes-sciml",
      "ml-viz-workflow",
      "incomplete",
    ]);

    for (const p of LEARNING_PATHS) {
      expect(p.label.length).toBeGreaterThan(2);
      expect(p.desc.length).toBeGreaterThan(10);
      if (Array.isArray(p.lessonIds)) {
        expect(p.lessonIds.length).toBeGreaterThanOrEqual(10);
        expect(new Set(p.lessonIds).size).toBe(p.lessonIds.length);
        for (const id of p.lessonIds) {
          expect(byId.has(id), `${p.id} の lessonId=${id} が存在しない`).toBe(true);
        }
        const filtered = filterLessonsByPath(FULL_LESSONS, p, {});
        expect(filtered).toHaveLength(p.lessonIds.length);
      }
    }

    const allFiltered = filterLessonsByPath(FULL_LESSONS, LEARNING_PATHS[0], {});
    expect(allFiltered).toHaveLength(FULL_LESSONS.length);

    const incompletePath = LEARNING_PATHS.find((p) => p.id === "incomplete");
    const l01 = FULL_LESSONS[0];
    const doneMap = { [l01.id]: Array.from({ length: l01.ex.length }, (_, i) => i) };
    const incFiltered = filterLessonsByPath(
      FULL_LESSONS.map((l) => ({ ...l, exCount: l.ex.length })),
      incompletePath,
      doneMap
    );
    expect(incFiltered).toHaveLength(FULL_LESSONS.length - 1);
    expect(incFiltered.some((l) => l.id === l01.id)).toBe(false);
  });

  it("R・Pythonの関数名（pivot_longer / np.where / lmer / solve_ivp）で逆引き検索できる", () => {
    expect(filterRosetta(ROSETTA_ITEMS, "すべて", "pivot_longer").map((x) => x.id)).toEqual(["pivot-longer-wider"]);
    expect(filterRosetta(ROSETTA_ITEMS, "すべて", "np.where").map((x) => x.id)).toEqual(["broadcast-ifelse"]);
    expect(filterRosetta(ROSETTA_ITEMS, "すべて", "lmer").map((x) => x.id)).toEqual(["lmm-glmm"]);
    expect(filterRosetta(ROSETTA_ITEMS, "可視化・機械学習・微分方程式", "solve_ivp").map((x) => x.id)).toEqual([
      "scipy-ode-sciml",
    ]);
  });

  it("#why-julia / #toolkit / #toolkit/recipes のハッシュルートが相互変換できる", () => {
    expect(parseHashRoute("#why-julia", FULL_LESSONS)).toEqual({ name: "toolkit", tab: "why" });
    expect(parseHashRoute("#toolkit/why", FULL_LESSONS)).toEqual({ name: "toolkit", tab: "why" });
    expect(parseHashRoute("#toolkit", FULL_LESSONS)).toEqual({ name: "toolkit", tab: "rosetta" });
    expect(parseHashRoute("#toolkit/recipes", FULL_LESSONS)).toEqual({ name: "toolkit", tab: "recipes" });
    expect(formatHashRoute({ name: "toolkit", tab: "why" })).toBe("#why-julia");
    expect(formatHashRoute({ name: "toolkit", tab: "rosetta" })).toBe("#toolkit");
    expect(formatHashRoute({ name: "toolkit", tab: "recipes" })).toBe("#toolkit/recipes");
  });

  it("対話プロット計算モデル (computeWhyJuliaSeries) が逐次優位・C/BLAS同等・TTFX逆転を誠実に再現する", () => {
    // 大規模 × 8回反復の逐次モデルでは Julia+Revise が大幅に速く割当 0 KiB
    const seqBig = computeWhyJuliaSeries("sequential", 2, 8);
    expect(seqBig.finalReviseSec).toBeLessThan(seqBig.finalDynamicSec / 5);
    expect(seqBig.fusedKiB).toBe(0);
    expect(seqBig.unfusedKiB).toBeGreaterThan(500);

    // 小規模 × 2回反復で毎回プロセス再起動すると TTFX により動的スクリプトより遅くなる逆転も正直に表す
    const seqTinyRestart = computeWhyJuliaSeries("sequential", 0, 2);
    expect(seqTinyRestart.finalRestartSec).toBeGreaterThan(seqTinyRestart.finalDynamicSec);

    // 既存C/BLAS呼び出しでは同等判定(parity)になる
    const blas = computeWhyJuliaSeries("blas", 2, 6);
    expect(blas.workload.verdictKind).toBe("parity");
  });

  it("補講10・補講11・入門第1回のメリット図解SVGおよびチートシート実用ツールカードが揃っている", () => {
    const x10 = byId.get("daily-workflow-tools");
    expect(x10).toBeTruthy();
    expect(x10.section).toBe("extra");
    expect(x10.numInSection).toBe(10);
    expect(x10.pages).toHaveLength(5);
    expect(x10.ex).toHaveLength(4);

    const x11 = byId.get("why-julia-visualized");
    expect(x11).toBeTruthy();
    expect(x11.section).toBe("extra");
    expect(x11.numInSection).toBe(11);
    expect(x11.pages).toHaveLength(5);
    expect(x11.ex).toHaveLength(4);

    const x12 = byId.get("julian-design-patterns");
    expect(x12).toBeTruthy();
    expect(x12.section).toBe("extra");
    expect(x12.numInSection).toBe(12);
    expect(x12.pages).toHaveLength(5);
    expect(x12.ex).toHaveLength(4);

    const l01 = byId.get("julia-introduction");
    expect(l01.pages[0].fig.src).toBe("figures/why-julia-two-language.svg");

    for (const relSvg of [
      x10.pages[0].fig.src,
      l01.pages[0].fig.src,
      x11.pages[1].fig.src,
      x11.pages[2].fig.src,
      x12.pages[1].fig.src,
      x12.pages[2].fig.src,
    ]) {
      const svgPath = path.resolve(process.cwd(), "public", relSvg);
      expect(fs.existsSync(svgPath), `${relSvg} が存在しない`).toBe(true);
      expect(fs.statSync(svgPath).size).toBeGreaterThan(2000);
    }

    const card = CHEATS.find((c) => c.title === "開発快適化・テスト・論文表出力(実用ツール)");
    expect(card).toBeTruthy();
    expect(card.rows.length).toBeGreaterThanOrEqual(6);
  });
});
