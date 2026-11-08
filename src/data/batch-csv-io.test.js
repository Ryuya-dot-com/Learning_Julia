import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LESSONS } from "./lessons/eager.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const ID = "batch-csv-io";

describe("複数CSVと分析成果物の入出力の学習契約", () => {
  it("番号付き37本を動かさず、7本目の補講として公開する", () => {
    const lesson = LESSONS.find((item) => item.id === ID);
    expect(LESSONS.filter((item) => item.num != null)).toHaveLength(37);
    expect(lesson.section).toBe("extra");
    expect(lesson.num).toBeNull();
    expect(lesson.numInSection).toBe(7);
    expect(lesson.pages).toHaveLength(14);
    expect(lesson.ex).toHaveLength(6);
  });

  it("列挙・schema・provenance・key・joinを一つの入力契約にする", () => {
    const text = JSON.stringify(LESSONS.find((item) => item.id === ID));
    for (const concept of [
      "readdir",
      "join = true",
      "sort = true",
      "CSV.File",
      "source_file",
      "types",
      "missingstring",
      "strict = true",
      "validate = true",
      "cols = :setequal",
      "nonunique",
      "validate = (false, true)",
      "order = :left",
      "participant_match",
    ]) {
      expect(text, `${concept}が一括入出力補講にない`).toContain(concept);
    }
  });

  it("役割別成果物・上書き拒否・round trip・大規模化の境界を扱う", () => {
    const text = JSON.stringify(LESSONS.find((item) => item.id === ID));
    for (const concept of [
      "input_file_audit",
      "CSV.write",
      "Arrow",
      "run ID",
      "既存の出力を上書きしません",
      "round trip",
      "sha256",
      "append=true",
      "compress=true",
      "partition=true",
      "CSV.Rows",
      "CSV.Chunks",
    ]) {
      expect(text, `${concept}が一括入出力補講にない`).toContain(concept);
    }
  });

  it("Julia検証が成功系・空入力・schema・型・重複・再書込を固定する", () => {
    const checker = read("scripts/batch-csv-io-check.jl");
    const implementation = checker + read("scripts/p0-p1-contracts.jl");
    const runner = read("scripts/run-numeric-checks.jl");
    const deploy = read(".github/workflows/deploy.yml");
    for (const contract of [
      "mktempdir()",
      "CSV.File(",
      "source = :source_file",
      "cols = :setequal",
      "validate = (false, true)",
      "@test_throws ArgumentError discover_csvs",
      "@test_throws ArgumentError load_trials",
      "@test_throws Exception load_trials",
      "@test_throws ArgumentError write_new_csv",
      "BATCH_CSV_IO_CHECK_PASS",
    ]) {
      expect(implementation, `${contract}がJulia検証にない`).toContain(contract);
    }
    expect(runner).toContain('"scripts/batch-csv-io-check.jl"');
    expect(deploy).toContain("scripts/run-numeric-checks.jl --public");
  });

  it("L16・NB1・ロードマップ・READMEから公開補講へ到達できる", () => {
    const reshape = read("src/data/lessons/2-data/l16-reshape.js");
    const notebook = read("public/notebooks/nb1-data.jl");
    const notebookChecker = read("scripts/nb-exec-check.jl");
    const roadmap = read("public/roadmap.html");
    const readme = read("README.md");

    expect(reshape).toContain("複数CSVと分析成果物の入出力");
    expect(notebook).toContain("課題6: 複数CSVの列挙と一括読み込み");
    expect(notebook).toContain("課題7: 結果CSVを書き出して読み戻す");
    expect(notebook).toContain("batch_data = missing");
    expect(notebook).toContain("batch_output = missing");
    expect(notebookChecker).toContain('"nb1-data.jl" => 7');
    expect(roadmap).toContain("複数CSVと分析成果物の入出力(公開中)");
    expect(roadmap).toContain("拡充スプリント・P0〜P1完了");
    expect(readme).toContain("複数CSV入出力");
  });
});
