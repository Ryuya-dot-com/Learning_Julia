import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LESSONS } from "./lessons/eager.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");

describe("R・Stan連携トラック", () => {
  it("番号付き37本を動かさず、4本の任意トラックとして公開する", () => {
    const bridge = LESSONS.filter((lesson) => lesson.section === "bridge");

    expect(LESSONS.filter((lesson) => lesson.num != null)).toHaveLength(37);
    expect(bridge.map((lesson) => lesson.id)).toEqual([
      "cross-language-contract",
      "julia-to-r",
      "r-to-julia",
      "julia-to-stan",
    ]);
    expect(bridge.map((lesson) => lesson.numInSection)).toEqual([1, 2, 3, 4]);
    expect(bridge.every((lesson) => lesson.num === null)).toBe(true);
  });

  it("受け渡し契約、両方向のR連携、Stanの実行・診断を分けて教える", () => {
    const text = JSON.stringify(LESSONS.filter((lesson) => lesson.section === "bridge"));

    for (const concept of [
      "schema_version",
      "round trip",
      "@rput",
      "rcopy",
      "julia_setup",
      "julia_call",
      "SampleModel",
      "stan_sample",
      "divergence",
      "chain別draws CSV",
    ]) {
      expect(text, `${concept} が連携トラックにない`).toContain(concept);
    }
  });

  it("外部engineなしで開ける5課題のNotebookを公開し、smoke対象にする", () => {
    const notebook = read("public/notebooks/nb6-r.jl");
    const checker = read("scripts/nb-exec-check.jl");
    const runner = read("scripts/run-notebook-smoke.jl");

    expect(notebook).toContain("Julia → CSV → R → CSV → Julia");
    expect(notebook).toContain('Sys.which("Rscript")');
    expect(notebook).toContain("stan_run = missing");
    expect(notebook).toContain("bridge_manifest = missing");
    expect(notebook).not.toContain('RCall = "');
    expect(notebook).not.toContain('StanSample = "');
    expect(checker).toContain('"nb6-r.jl" => 5');
    expect(runner).toContain('"public/notebooks/nb6-r.jl"');
  });

  it("独立実行できるR・Stan bridgeを配布templateへ含める", () => {
    const contract = LESSONS.find((lesson) => lesson.id === "cross-language-contract");
    const download = contract.pages.find((page) => page.download)?.download;
    const builder = read("scripts/build-study-template-archive.jl");
    const checker = read("scripts/reproducible-template-check.jl");

    expect(download).toEqual({
      path: "templates/reproducible-study-template.tar",
      label: "R・Stan bridge入り研究projectをdownload (.tar)",
    });
    for (const file of [
      "code/run_r_bridge.jl",
      "code/run_stan_bridge.jl",
      "code/setup_cmdstan.jl",
      "code/summarize_trials.R",
      "models/README.md",
      "models/bernoulli.stan",
    ]) {
      expect(builder).toContain(file);
      expect(checker).toContain(file);
    }
    expect(builder).toContain('"code/setup_cmdstan.jl"');
    expect(read("examples/reproducible-study/code/setup_cmdstan.jl")).toContain(
      "ffe03c29c9f139d77deeb156a2a0911ebf0742ae38311c739f4fcea3bc4f8909"
    );
    expect(read("examples/reproducible-study/code/setup_cmdstan.jl")).toContain(
      "mv(staged_home, CMDSTAN_HOME)"
    );
    expect(read("examples/reproducible-study/code/run_r_bridge.jl")).toContain(
      'joinpath(run_directory, "failure.toml")'
    );
    expect(read("examples/reproducible-study/code/run_r_bridge.jl")).toContain(
      '"artifact_sha256" => file_sha256.(artifacts)'
    );
    expect(read("examples/reproducible-study/code/run_r_bridge.jl")).toContain(
      "R成果物pathはproject外を参照できません"
    );
    expect(read("examples/reproducible-study/code/run_r_bridge.jl")).toContain(
      '"r_platform" => r_platform'
    );
    expect(read("examples/reproducible-study/code/run_r_bridge.jl")).toContain(
      '"driver_sha256" => file_sha256(@__FILE__)'
    );
    expect(read("examples/reproducible-study/code/run_r_bridge.jl")).toContain(
      "が現在の実行条件と一致しません"
    );
    expect(read("examples/reproducible-study/code/run_stan_bridge.jl")).toContain(
      'cmdstan_diagnose_passed" => true'
    );
    expect(read("examples/reproducible-study/code/run_stan_bridge.jl")).toContain(
      '"analytic_posterior" => "Beta(6, 2)"'
    );
    expect(read("examples/reproducible-study/code/run_stan_bridge.jl")).toContain(
      '"posterior_predictive" => Dict('
    );
    expect(read("examples/reproducible-study/code/run_stan_bridge.jl")).toContain(
      '"artifact_paths" => ['
    );
    expect(read("examples/reproducible-study/code/run_stan_bridge.jl")).toContain(
      'joinpath(run_directory, "failure.toml")'
    );
    expect(read("examples/reproducible-study/code/run_stan_bridge.jl")).not.toContain(
      "rm(run_directory"
    );
    expect(read("examples/reproducible-study/code/run_stan_bridge.jl")).toContain(
      "Stan成果物pathはproject外を参照できません"
    );
    expect(read("examples/reproducible-study/code/run_stan_bridge.jl")).toContain(
      '"chain_commands" => "see outputs.log_paths"'
    );
    expect(read("examples/reproducible-study/code/run_stan_bridge.jl")).toContain(
      "が保存済みCSVと一致しません"
    );
  });

  it("実行検査と、未確認の埋め込み連携・第三者引き継ぎを区別する", () => {
    const templateReadme = read("examples/reproducible-study/README.md");
    const roadmap = read("public/roadmap.html");

    expect(templateReadme).toContain("## 第三者へ渡す前の確認");
    expect(templateReadme).toContain("第三者による引き継ぎ確認は未実施です");
    expect(roadmap).toContain("ACTUAL_HANDOFFS_0");
    expect(roadmap).toContain("理解率や教育効果の根拠にはしません");
    expect(roadmap).toContain("Linux／WindowsのCI");
    expect(roadmap).not.toContain("Windowsは別環境での確認が残っています");
    expect(roadmap).toContain("RCall・JuliaCallの埋め込み実行は定期CIの対象ではありません");
    for (const id of ["julia-to-r", "r-to-julia"]) {
      const text = JSON.stringify(LESSONS.find((lesson) => lesson.id === id).pages[0]);
      expect(text).toContain("定期CIの実行対象ではありません");
      expect(text).toContain("Rscript経由の連携とは別です");
    }
  });
});
