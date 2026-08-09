import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");

describe("P0〜P1の横断実行契約", () => {
  const shared = read("scripts/p0-p1-contracts.jl");
  const batch = read("scripts/batch-csv-io-check.jl");
  const fitting = read("scripts/distribution-fit-check.jl");
  const structure = read("scripts/distribution-structure-check.jl");
  const pipeline = read("scripts/p0-p1-pipeline-check.jl");

  it("個別検証と統合検証が同じ実装契約を使う", () => {
    for (const source of [batch, fitting, structure, pipeline]) {
      expect(source).toContain('include(joinpath(@__DIR__, "p0-p1-contracts.jl"))');
      expect(source).toContain("using .P0P1Contracts");
    }
    for (const symbol of [
      "discover_csvs",
      "load_trials",
      "write_new_csv",
      "fit_checked",
      "fit_uncensored_checked",
      "replicate_summaries",
      "checked_mvnormal",
    ]) {
      expect(shared).toContain(symbol);
    }
  });

  it("打切りflagを通常のfitへ黙って渡さない", () => {
    expect(shared).toContain("any(censored_flags)");
    expect(shared).toContain("観測規則を含む専用尤度が必要です");
    expect(pipeline).toContain("censored_copy[1] = true");
    expect(pipeline).toContain("@test_throws ArgumentError fit_uncensored_checked");
  });

  it("入力から予測診断とforward観測設計までを一時directoryで結ぶ", () => {
    for (const contract of [
      "mktempdir() do project_dir",
      "load_trials(raw_dir)",
      "fit_uncensored_checked",
      "replicate_summaries",
      "truncated(fitted",
      "censored(fitted",
      "forward observation design only; no censored-data estimation",
      "input_file_audit.csv",
      "model_diagnostics.csv",
      "observation_design.csv",
      "run_manifest.csv",
      "raw_hashes ==",
      "P0_P1_PIPELINE_CHECK_PASS",
    ]) {
      expect(pipeline).toContain(contract);
    }
  });

  it("20本目としてCIとロードマップのNOW gateへ接続する", () => {
    const runner = read("scripts/run-numeric-checks.jl");
    const deploy = read(".github/workflows/deploy.yml");
    const roadmap = read("public/roadmap.html");
    expect(runner).toContain('"scripts/p0-p1-pipeline-check.jl"');
    expect(deploy).toContain("Run 26 numerical regression checks");
    expect(roadmap).toContain("P0_P1_PIPELINE_CHECK_PASS");
    expect(roadmap).toContain("複数CSVからfit・予測診断・forward観測設計・監査済み出力");
  });

  it("NB1とNB2が独立実行と実研究のhandoffを区別する", () => {
    const nb1 = read("public/notebooks/nb1-data.jl");
    const nb2 = read("public/notebooks/nb2-stats.jl");
    expect(nb1).toContain("Notebook間の暗黙の変数ではなく");
    expect(nb1).toContain("schemaと出力fileを受け渡し契約");
    expect(nb2).toContain("NB1とは独立して再実行できる教材fixture");
    expect(nb2).toContain("入力監査を省略してよいという意味ではありません");
  });
});
