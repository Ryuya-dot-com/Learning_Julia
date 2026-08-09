import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");

describe("CIの検証境界", () => {
  const deploy = read(".github/workflows/deploy.yml");
  const pluto = read(".github/workflows/pluto-smoke.yml");
  const numericRunner = read("scripts/run-numeric-checks.jl");
  const notebookRunner = read("scripts/run-notebook-smoke.jl");
  const playwrightConfig = read("playwright.config.js");
  const dependabot = read(".github/dependabot.yml");

  it("実在するAction majorと共通Node版ファイルを使う", () => {
    expect(deploy).toContain("actions/checkout@v7");
    expect(deploy).toContain("actions/setup-node@v7");
    expect(pluto).toContain("actions/checkout@v7");
    expect(deploy).toContain("node-version-file: .node-version");
  });

  it("Pages公開はWeb・Julia数値回帰・browser smokeをすべて必須にする", () => {
    expect(deploy).toContain("julia-numeric:");
    expect(deploy).toContain("scripts/run-numeric-checks.jl");
    expect(deploy).toContain("browser-smoke:");
    expect(deploy).toContain("npm run test:e2e");
    expect(deploy).toContain("needs: [build, julia-numeric, browser-smoke]");
    const beforeJobs = deploy.split("jobs:")[0];
    const deployJob = deploy.split("  deploy:")[1];
    expect(beforeJobs).not.toContain("pages: write");
    expect(beforeJobs).not.toContain("id-token: write");
    expect(deployJob).toContain("pages: write");
    expect(deployJob).toContain("id-token: write");
  });

  it("browser smokeはproduction previewとChromiumを使う", () => {
    expect(deploy).toContain("playwright install --with-deps chromium");
    expect(playwrightConfig).toContain('command: "vite preview --outDir .e2e-dist');
    expect(playwrightConfig).toContain("/Learning_Julia/");
    expect(playwrightConfig).toContain('browserName: "chromium"');
    expect(read("vite.config.js")).toContain('include: ["src/**/*.test.js"]');
    expect(dependabot).toContain("package-ecosystem: npm");
  });

  it("数値runnerが公開済み＋research中の26検証スクリプトを漏れなく列挙する", () => {
    const actual = readdirSync(join(ROOT, "scripts"))
      .filter((name) => name.endsWith("-check.jl") && name !== "nb-exec-check.jl")
      .map((name) => `scripts/${name}`)
      .sort();
    const listed = [...numericRunner.matchAll(/"(scripts\/[^"\n]+-check\.jl)"/g)]
      .map((match) => match[1])
      .sort();
    expect(listed).toEqual(actual);
    expect(listed).toHaveLength(26);
    expect(numericRunner).toContain('occursin("p2-likelihood-", relative_path)');
    expect(numericRunner).toContain('endswith(relative_path, "p2-identification-profile-check.jl")');
    expect(numericRunner).toContain('endswith(relative_path, "p2-generalization-engine-check.jl")');
    expect(numericRunner).toContain('endswith(relative_path, "p2-two-sided-identification-check.jl")');
    expect(numericRunner).toContain('endswith(relative_path, "p2-selection-count-check.jl")');
    expect(numericRunner).toContain('joinpath(ROOT, "validation", "p2-likelihood")');
  });

  it("Pluto smokeは公開Notebook 5本を変更時・定期実行する", () => {
    expect(pluto).toContain("schedule:");
    expect(pluto).toContain("public/notebooks/**");
    expect(pluto).toContain("scripts/run-notebook-smoke.jl");
    const listed = [...notebookRunner.matchAll(/"(public\/notebooks\/nb[^"\n]+\.jl)"/g)]
      .map((match) => match[1]);
    expect(listed).toHaveLength(5);
  });

  it("Julia jobsはコミット済みvalidation環境と公式cache actionを共有する", () => {
    for (const workflow of [deploy, pluto]) {
      expect(workflow).toContain("julia-actions/setup-julia@v3");
      expect(workflow).toContain("julia-actions/cache@v3");
      expect(workflow).toContain("--project=validation scripts/setup-validation-env.jl");
    }
    expect(read("validation/Project.toml")).toContain('RegressionTables = "=0.5.10"');
    expect(deploy).toContain("Instantiate P2 likelihood feasibility environment");
    expect(deploy).toContain("--project=validation/p2-likelihood scripts/setup-validation-env.jl");
    expect(deploy).toContain("validation/p2-likelihood/Project.toml");
    expect(deploy).toContain("actions/setup-python@v6");
    expect(deploy).toContain("python-version: '3.13'");
    expect(deploy).toContain("cache-dependency-path: validation/p2-scipy/requirements.txt");
    expect(deploy).toContain("python -m pip install -r validation/p2-scipy/requirements.txt");
  });
});
