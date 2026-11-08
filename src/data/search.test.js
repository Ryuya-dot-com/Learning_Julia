import { describe, it, expect } from "vitest";
import { LESSONS as FULL_LESSONS } from "./lessons/eager.js";
import { LESSONS as CATALOG_LESSONS } from "./lessons/index.js";
import { SECTIONS } from "./sections.js";
import { CHEATS } from "./cheats.js";
import {
  normalizeSearchText,
  tokenizeQuery,
  filterLessons,
  filterCheats,
  countCheatRows,
} from "../search.js";

function extractLessonCorpus(lesson) {
  const parts = [lesson.title, lesson.tag];
  for (const page of lesson.pages || []) {
    parts.push(
      page.t || "",
      ...(page.b || []),
      ...(page.a || []),
      page.code || "",
      page.out || "",
      page.tip || "",
      page.fig?.alt || "",
      page.fig?.cap || ""
    );
  }
  for (const ex of lesson.ex || []) {
    parts.push(ex.q || "", ...(ex.opts || []), ex.note || "", ex.hint || "", ex.show || "");
    if (Array.isArray(ex.s)) {
      for (const s of ex.s) parts.push(s.t || "");
    }
  }
  return normalizeSearchText(parts.join("\n"));
}

describe("横断検索メタデータとフィルタ関数", () => {
  it("全70レッスンのカタログに5語以上の検索語(kw)があり、すべて教材本文に実在する", () => {
    const fullById = new Map(FULL_LESSONS.map((l) => [l.id, l]));
    expect(CATALOG_LESSONS).toHaveLength(70);

    for (const meta of CATALOG_LESSONS) {
      expect(typeof meta.kw, `${meta.id} に kw がない`).toBe("string");
      const tokens = tokenizeQuery(meta.kw);
      expect(tokens.length, `${meta.id} の kw が少なすぎる`).toBeGreaterThanOrEqual(5);

      const full = fullById.get(meta.id);
      expect(full, `${meta.id} の本文が見つからない`).toBeTruthy();
      const corpus = extractLessonCorpus(full);
      for (const tok of tokens) {
        expect(
          corpus.includes(tok),
          `${meta.id} (${meta.path}) の検索語 "${tok}" が本文・コード・演習に含まれていない`
        ).toBe(true);
      }
    }
  });

  it("空クエリでは全レッスンをそのまま返し、関数名・マクロ・概念語で正確に絞り込む", () => {
    expect(filterLessons(CATALOG_LESSONS, SECTIONS, "")).toHaveLength(CATALOG_LESSONS.length);
    expect(filterLessons(CATALOG_LESSONS, SECTIONS, "   ")).toHaveLength(CATALOG_LESSONS.length);

    const viewsMatches = filterLessons(CATALOG_LESSONS, SECTIONS, "@views");
    expect(viewsMatches.map((l) => l.id)).toEqual(["type-stability-allocation"]);

    const chunksMatches = filterLessons(CATALOG_LESSONS, SECTIONS, "CSV.Chunks");
    expect(chunksMatches.map((l) => l.id)).toEqual(["streaming-chunked-aggregation"]);

    const kalmanMatches = filterLessons(CATALOG_LESSONS, SECTIONS, "カルマン 尤度");
    expect(kalmanMatches.map((l) => l.id)).toEqual(["state-space-kalman-filter"]);

    const hmcMatches = filterLessons(CATALOG_LESSONS, SECTIONS, "Leapfrog");
    expect(hmcMatches.map((l) => l.id)).toEqual(["mcmc-metropolis-hmc"]);

    const softmaxMatches = filterLessons(CATALOG_LESSONS, SECTIONS, "stable_softmax");
    expect(softmaxMatches.map((l) => l.id)).toEqual(["ordinal-multinomial-mle"]);

    const ghMatches = filterLessons(CATALOG_LESSONS, SECTIONS, "SymTridiagonal");
    expect(ghMatches.map((l) => l.id)).toEqual(["hierarchical-ordinal-choice"]);

    const gofMatches = filterLessons(CATALOG_LESSONS, SECTIONS, "chisq_gof");
    expect(gofMatches.map((l) => l.id)).toEqual(["chisq-loglinear-exact"]);

    const mcaMatches = filterLessons(CATALOG_LESSONS, SECTIONS, "fit_mca");
    expect(mcaMatches.map((l) => l.id)).toEqual(["correspondence-analysis-mca"]);

    const lassoMatches = filterLessons(CATALOG_LESSONS, SECTIONS, "fit_lasso_cd");
    expect(lassoMatches.map((l) => l.id)).toEqual(["regularization-trees-cv"]);

    const emMatches = filterLessons(CATALOG_LESSONS, SECTIONS, "fit_gmm1d_em");
    expect(emMatches.map((l) => l.id)).toEqual(["em-neural-sciml"]);

    const pyMatches = filterLessons(CATALOG_LESSONS, SECTIONS, "pyconvert");
    expect(pyMatches.map((l) => l.id)).toEqual(["julia-python-ml-bridge"]);

    const aogMatches = filterLessons(CATALOG_LESSONS, SECTIONS, "AlgebraOfGraphics");
    expect(aogMatches.map((l) => l.id)).toContain("makie-aog-multifacet");

    const sepMatches = filterLessons(CATALOG_LESSONS, SECTIONS, "セパラトリクス");
    expect(sepMatches.map((l) => l.id)).toEqual(["diagnostic-phase-visualization"]);

    const reviseMatches = filterLessons(CATALOG_LESSONS, SECTIONS, "includet");
    expect(reviseMatches.map((l) => l.id)).toEqual(["daily-workflow-tools"]);

    const dualMatches = filterLessons(CATALOG_LESSONS, SECTIONS, "DualNum");
    expect(dualMatches.map((l) => l.id)).toEqual(["why-julia-visualized"]);
  });

  it("全角英数字・大文字小文字(NFKC)やバッジ番号(L18 / 中1 / 上4 / 橋2 / 補7)で検索できる", () => {
    const fullWidthViews = filterLessons(CATALOG_LESSONS, SECTIONS, "＠ＶＩＥＷＳ");
    expect(fullWidthViews.map((l) => l.id)).toEqual(["type-stability-allocation"]);

    const l18 = filterLessons(CATALOG_LESSONS, SECTIONS, "L18");
    expect(l18.some((l) => l.num === 18)).toBe(true);

    const inter1 = filterLessons(CATALOG_LESSONS, SECTIONS, "中1");
    expect(inter1.map((l) => l.id)).toEqual(["type-stability-allocation"]);

    const adv4 = filterLessons(CATALOG_LESSONS, SECTIONS, "上4");
    expect(adv4.map((l) => l.id)).toEqual(["mcmc-metropolis-hmc"]);

    const bridge2 = filterLessons(CATALOG_LESSONS, SECTIONS, "橋2");
    expect(bridge2.map((l) => l.id)).toEqual(["julia-to-r"]);

    const extra7 = filterLessons(CATALOG_LESSONS, SECTIONS, "補7");
    expect(extra7.map((l) => l.id)).toEqual(["batch-csv-io"]);

    expect(filterLessons(CATALOG_LESSONS, SECTIONS, "nonexistent_token_999")).toEqual([]);
  });

  it("チートシートをカテゴリと検索語のAND条件で行単位まで絞り込める", () => {
    const allCards = filterCheats(CHEATS, "すべて", "");
    expect(allCards).toHaveLength(CHEATS.length);

    const viewsCheats = filterCheats(CHEATS, "すべて", "@views");
    expect(viewsCheats).toHaveLength(1);
    expect(viewsCheats[0].title).toBe("型安定性とメモリ割当(中級)");
    expect(countCheatRows(viewsCheats)).toBe(1);
    expect(viewsCheats[0].rows[0][0]).toContain("@views");

    // カテゴリ不一致なら 0 件になる
    expect(filterCheats(CHEATS, "基礎", "@views")).toEqual([]);

    // カード見出し自体に一致する場合はそのカードの全行を返す
    const makieCheats = filterCheats(CHEATS, "すべて", "CairoMakie");
    expect(makieCheats).toHaveLength(1);
    expect(makieCheats[0].rows.length).toBe(
      CHEATS.find((c) => c.title.includes("CairoMakie")).rows.length
    );
  });
});
