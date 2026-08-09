import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LESSONS } from "./lessons/eager.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IDS = ["reading-error-messages", "text-processing", "distribution-catalog"];

describe("追加公開補講3本の学習契約", () => {
  it("番号付き37回を動かさず、補講の4〜6本目として公開する", () => {
    const supplements = IDS.map((id) => LESSONS.find((lesson) => lesson.id === id));
    expect(LESSONS.filter((lesson) => lesson.num != null)).toHaveLength(37);
    expect(supplements.map((lesson) => lesson.section)).toEqual(["extra", "extra", "extra"]);
    expect(supplements.map((lesson) => lesson.num)).toEqual([null, null, null]);
    expect(supplements.map((lesson) => lesson.numInSection)).toEqual([4, 5, 6]);
    for (const lesson of supplements) {
      expect(lesson.pages.length).toBeGreaterThanOrEqual(8);
      expect(lesson.ex).toHaveLength(4);
    }
  });

  it("エラー回が型・形・stacktrace・最小再現例を結ぶ", () => {
    const text = JSON.stringify(LESSONS.find((lesson) => lesson.id === IDS[0]));
    for (const concept of [
      "MethodError",
      "UndefVarError",
      "BoundsError",
      "KeyError",
      "DimensionMismatch",
      "stacktrace",
      "tryparse",
      "rethrow()",
      "最小再現例",
    ]) {
      expect(text, `${concept}がエラー回にない`).toContain(concept);
    }
  });

  it("文字列回がUnicode・構造化・欠測・privacyを分離する", () => {
    const text = JSON.stringify(LESSONS.find((lesson) => lesson.id === IDS[1]));
    for (const concept of [
      "strip",
      "split",
      "replace",
      "tryparse",
      "eachindex",
      "ncodeunits",
      "Regex",
      "nothing",
      "privacy",
    ]) {
      expect(text, `${concept}が文字列回にない`).toContain(concept);
    }
  });

  it("分布回がsupport・生成過程・parameterization・予測を結ぶ", () => {
    const text = JSON.stringify(LESSONS.find((lesson) => lesson.id === IDS[2]));
    for (const concept of [
      "Bernoulli",
      "Binomial",
      "Poisson",
      "NegativeBinomial",
      "TDist",
      "LogNormal",
      "Gamma",
      "Beta",
      "Categorical",
      "insupport",
      "parameterization",
      "replicate data",
    ]) {
      expect(text, `${concept}が分布回にない`).toContain(concept);
    }
  });

  it("ロードマップとREADMEが公開状態を示す", () => {
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    for (const title of ["エラーメッセージの読み方", "文字列処理", "分布のカタログ"]) {
      expect(roadmap).toContain(`${title}(公開中)`);
    }
    expect(readme).toContain("番号付き全37レッスンを公開中");
    expect(readme).not.toContain("基礎編 9レッスン");
  });
});
