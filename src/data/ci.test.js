import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");

describe("CIの検証境界", () => {
  const deploy = read(".github/workflows/deploy.yml");
  const pluto = read(".github/workflows/pluto-smoke.yml");
  const bridge = read(".github/workflows/bridge-smoke.yml");
  const numericRunner = read("scripts/run-numeric-checks.jl");
  const notebookRunner = read("scripts/run-notebook-smoke.jl");
  const playwrightConfig = read("playwright.config.js");
  const p2PlaywrightConfig = read("playwright.p2.config.js");
  const p2LocalPlaywrightConfig = read("playwright.p2.local.config.js");
  const viteConfig = read("vite.config.js");
  const packageJson = read("package.json");
  const participantBuildCheck = read("scripts/p2-participant-preview-build-check.mjs");
  const dependabot = read(".github/dependabot.yml");
  const repositoryReadme = read("README.md");

  it("実在するAction majorと共通Node版ファイルを使う", () => {
    expect(deploy).toContain("actions/checkout@v7");
    expect(deploy).toContain("actions/setup-node@v7");
    expect(pluto).toContain("actions/checkout@v7");
    expect(bridge).toContain("actions/checkout@v7");
    expect(deploy).toContain("node-version-file: .node-version");
  });

  it("Pages公開はWeb・Julia数値回帰・browser smokeをすべて必須にする", () => {
    expect(deploy).toContain("julia-numeric:");
    expect(deploy).toContain("scripts/run-numeric-checks.jl");
    expect(deploy).toContain("browser-smoke:");
    expect(deploy).toContain("npm run test:e2e");
    expect(deploy).toContain("npm run test:p2-ui");
    expect(deploy).toContain("npm run test:p2-api");
    expect(deploy).toContain("needs: [build, julia-numeric, browser-smoke]");
    expect(deploy.split("  julia-numeric:")[1].split("  browser-smoke:")[0])
      .toContain("timeout-minutes: 45");
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
    expect(p2PlaywrightConfig).toContain('testDir: "./e2e-research"');
    expect(p2PlaywrightConfig).toContain('testMatch: "p2-selection-count-preview.spec.js"');
    expect(p2PlaywrightConfig).toContain("/Learning_Julia/validation/p2-likelihood/ui-preview.html");
    expect(packageJson).toContain('"test:p2-ui": "playwright test --config=playwright.p2.config.js"');
    expect(packageJson).toContain('"test:p2-api": "playwright test --config=playwright.p2.local.config.js"');
    expect(p2LocalPlaywrightConfig).toContain("scripts/run-p2-selection-count-local-server.jl");
    expect(p2LocalPlaywrightConfig).toContain("P2_LOCAL_API_TARGET=http://127.0.0.1:43923");
    expect(viteConfig).toContain('include: ["src/**/*.test.js"]');
    expect(viteConfig).toContain("p2ResearchParticipantPreview");
    expect(viteConfig).toContain('"validation/p2-likelihood/ui-preview.html"');
    expect(read("e2e/learning-flow.spec.js")).toContain("previewが外部originへ通信しない");
    expect(packageJson).toContain("node scripts/p2-participant-preview-build-check.mjs");
    expect(participantBuildCheck).toContain("P2_PARTICIPANT_PREVIEW_BUILD_PASS");
    expect(participantBuildCheck).toContain("private_records=0");
    expect(dependabot).toContain("package-ecosystem: npm");
  });

  it("数値runnerが公開済み＋research中の32検証スクリプトを漏れなく列挙する", () => {
    const actual = readdirSync(join(ROOT, "scripts"))
      .filter((name) => name.endsWith("-check.jl") && name !== "nb-exec-check.jl")
      .map((name) => `scripts/${name}`)
      .sort();
    const listed = [...numericRunner.matchAll(/"(scripts\/[^"\n]+-check\.jl)"/g)]
      .map((match) => match[1])
      .sort();
    expect(listed).toEqual(actual);
    expect(listed).toHaveLength(32);
    expect(numericRunner).toContain('startswith(basename(relative_path), "p2-")');
    expect(numericRunner).toContain('joinpath(ROOT, "validation", "p2-likelihood")');
  });

  it("Pluto smokeは公開Notebook 6本と隔離P2研究Notebookを変更時・定期実行する", () => {
    expect(pluto).toContain("schedule:");
    expect(pluto).toContain("public/notebooks/**");
    expect(pluto).toContain("scripts/run-notebook-smoke.jl");
    const listed = [...notebookRunner.matchAll(/"(public\/notebooks\/nb[^"\n]+\.jl)"/g)]
      .map((match) => match[1]);
    expect(listed).toHaveLength(6);
    expect(pluto).toContain("validation/p2-likelihood/Project.toml");
    expect(pluto).toContain("Instantiate P2 likelihood feasibility environment");
    expect(pluto).toContain("scripts/p2-selection-count-notebook-exec.jl");
  });

  it("R・Stan bridgeはLinux空環境で定期実行する", () => {
    expect(bridge).toContain("schedule:");
    expect(bridge).toContain("runs-on: ubuntu-latest");
    expect(bridge).toContain("build-essential r-base-core");
    expect(bridge).toContain("code/setup_cmdstan.jl");
    expect(bridge).toContain('RUN_STAN_TEMPLATE_CHECK: "1"');
    expect(bridge).toContain("scripts/reproducible-template-check.jl");
    expect(repositoryReadme).toContain("## R・Stan配布templateの検査");
    expect(repositoryReadme).toContain(
      "RUN_STAN_TEMPLATE_CHECK=1 julia --project=examples/reproducible-study"
    );
  });

  it("Julia jobsはコミット済みvalidation環境と公式cache actionを共有する", () => {
    for (const workflow of [deploy, pluto]) {
      expect(workflow).toContain("julia-actions/setup-julia@v3");
      expect(workflow).toContain("julia-actions/cache@v3");
      expect(workflow).toContain("--project=validation scripts/setup-validation-env.jl");
    }
    expect(read("validation/Project.toml")).toContain('RegressionTables = "=0.5.10"');
    expect(deploy).toContain("Instantiate P2 likelihood feasibility environment");
    expect(deploy).toContain("Instantiate P2 likelihood feasibility environment for browser E2E");
    expect(deploy).toContain("--project=validation/p2-likelihood scripts/setup-validation-env.jl");
    expect(deploy).toContain("validation/p2-likelihood/Project.toml");
    expect(deploy).toContain("actions/setup-python@v6");
    expect(deploy).toContain("python-version: '3.13'");
    expect(deploy).toContain("cache-dependency-path: validation/p2-scipy/requirements.txt");
    expect(deploy).toContain("python -m pip install -r validation/p2-scipy/requirements.txt");
  });
});
