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
  const research = read(".github/workflows/p2-research.yml");
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
    expect(deploy).toContain("scripts/run-numeric-checks.jl --public");
    expect(deploy).toContain("scripts/numeric-selection-test.jl");
    expect(deploy).toContain("browser-smoke:");
    expect(deploy).toContain("npm run test:e2e");
    expect(deploy).toContain("npm run test:p2-ui");
    expect(deploy).not.toContain("npm run test:p2-api");
    expect(deploy).not.toContain("--project=validation/p2-likelihood");
    expect(deploy).not.toContain("actions/setup-python");
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
    const browserJob = deploy.split("  browser-smoke:")[1].split("  deploy:")[0];
    expect(browserJob).toContain("timeout-minutes: 45");
    expect(browserJob).not.toContain("actions: write");
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
    const publicChecks = listed.filter((path) => !path.startsWith("scripts/p2-"));
    const researchChecks = listed.filter((path) => path.startsWith("scripts/p2-"));
    expect(publicChecks).toHaveLength(20);
    expect(researchChecks).toHaveLength(12);
    const validationReadme = read("validation/README.md");
    expect(validationReadme).toContain(`全${listed.length}本`);
    expect(validationReadme).toContain(`${publicChecks.length}本`);
    expect(validationReadme).toContain(`${researchChecks.length}本`);
    expect(repositoryReadme).toContain(`数値検証${publicChecks.length}本`);
    expect(repositoryReadme).toContain(`数値検証${researchChecks.length}本`);
  });

  it("P2数値研究とlocal APIの検査は公開処理から分けて変更時・毎週実行する", () => {
    expect(research).toContain("schedule:");
    expect(research).toContain("pull_request:");
    for (const path of ["scripts/p2-*", "scripts/run-p2-*", "scripts/run-numeric-checks.jl", "validation/p2-*/**", "src/research/**", "e2e-research/**", "playwright.p2*.config.js", "vite.config.js", "package*.json", ".node-version"]) {
      expect(research).toContain(`'${path}'`);
    }
    expect(research).toContain("scripts/run-numeric-checks.jl --p2");
    expect(research).toContain("npm run test:p2-api");
    expect(research).not.toContain("continue-on-error");
    expect(research).not.toContain("pages: write");
    expect(research).not.toContain("id-token: write");
    expect(research).toContain("Install SciPy independent reference environment");
    expect(research).toContain("Instantiate P2 likelihood feasibility environment");
  });

  it("Pluto smokeは公開Notebook 6本と隔離P2研究Notebookを変更時・定期実行する", () => {
    expect(pluto).toContain("schedule:");
    expect(pluto).toContain("public/notebooks/**");
    expect(pluto).toContain("scripts/run-notebook-smoke.jl");
    expect(pluto).toContain("'scripts/nb5-grading-test.jl'");
    expect(pluto).toContain("'scripts/nb5-design-comparison.jl'");
    expect(pluto).toContain("'scripts/notebook-input-test.jl'");
    expect(pluto).toContain("julia --startup-file=no --project=validation scripts/notebook-input-test.jl");
    expect(pluto).toContain("julia --startup-file=no --project=validation scripts/nb5-grading-test.jl");
    const listed = [...notebookRunner.matchAll(/"(public\/notebooks\/nb[^"\n]+\.jl)"/g)]
      .map((match) => match[1]);
    expect(listed).toHaveLength(6);
    expect(read("validation/README.md")).toContain(`NB1–NB${listed.length}`);
    expect(read("validation/README.md")).toContain("定期CIでは実行していません");
    expect(pluto).toContain("validation/p2-likelihood/Project.toml");
    expect(pluto).toContain("Instantiate P2 likelihood feasibility environment");
    expect(pluto).toContain("scripts/p2-selection-count-notebook-exec.jl");
  });

  it("R・Stan bridgeはLinux・Windows空環境で定期実行する", () => {
    expect(bridge).toContain("schedule:");
    expect(bridge).toContain("pull_request:");
    expect(bridge).toContain("os: [ubuntu-latest, windows-latest]");
    expect(bridge).toContain("build-essential r-base-core");
    expect(bridge).toContain("r-lib/actions/setup-r@v2");
    expect(bridge).toContain("rtools-version: '45'");
    expect(bridge).toContain("code/setup_cmdstan.jl");
    expect(bridge).toContain('RUN_STAN_TEMPLATE_CHECK: "1"');
    expect(bridge).toContain(
      "run: julia --project=examples/reproducible-study scripts/reproducible-template-check.jl"
    );
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
    expect(research).toContain("julia-actions/setup-julia@v3");
    expect(research).toContain("julia-actions/cache@v3");
    expect(research).toContain("--project=validation/p2-likelihood scripts/setup-validation-env.jl");
    expect(research).toContain("validation/p2-likelihood/Manifest.toml");
    expect(research).toContain("actions/setup-python@v6");
    expect(research).toContain("python-version: '3.13'");
    expect(research).toContain("cache-dependency-path: validation/p2-scipy/requirements.txt");
    expect(research).toContain("python -m pip install -r validation/p2-scipy/requirements.txt");
  });

  it("教材の追加手順が本文と軽量カタログの両方を案内する", () => {
    expect(repositoryReadme).toContain("src/data/lessons/catalog.js");
    for (const field of ["path", "id", "title", "tag", "exCount"]) {
      expect(repositoryReadme).toContain(`\`${field}\``);
    }
    expect(repositoryReadme).not.toContain("ファイルを置くだけ");
  });
});
