// レッスンデータの検証テスト(仕様9節・改訂版)。
// レッスン追加時のミスをデプロイ前に検出する。CI ではビルド前に実行される。
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LESSONS } from "./lessons/eager.js";
import { LESSONS as LESSON_CATALOG, loadLesson } from "./lessons/index.js";
import { SECTIONS } from "./sections.js";

// 演習形式の許容値(仕様4.6)
const ALLOWED_K = ["choice", "fill", "tf"];
const SEMANTIC_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const NUMBERED_LESSON_REFERENCE = /レッスン[0-9０-９]+/;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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
    for (const sec of SECTIONS) {
      if (!sec.notebook) continue;
      const hasLessons = LESSONS.some((l) => l.section === sec.dir);
      if (!hasLessons) continue;
      expect(
        existsSync(join(ROOT, "public", "notebooks", sec.notebook)),
        `${sec.dir} のノートブック ${sec.notebook} が public/notebooks/ にない`
      ).toBe(true);
    }
  });
});

describe("レッスンデータ", () => {
  it("軽量カタログが教材本文の識別情報・演習数と同期している", () => {
    expect(
      LESSON_CATALOG.map(({ path, id, title, tag, exCount, section, num, numInSection }) => ({
        path,
        id,
        title,
        tag,
        exCount,
        section,
        num,
        numInSection,
      }))
    ).toEqual(
      LESSONS.map(({ path, id, title, tag, ex, section, num, numInSection }) => ({
        path,
        id,
        title,
        tag,
        exCount: ex.length,
        section,
        num,
        numInSection,
      }))
    );
  });

  it("先頭・末尾の教材本文をカタログから遅延読込できる", async () => {
    const [first, last] = await Promise.all([
      loadLesson(LESSON_CATALOG[0].id),
      loadLesson(LESSON_CATALOG.at(-1).id),
    ]);
    expect(first.id).toBe(LESSON_CATALOG[0].id);
    expect(last.id).toBe(LESSON_CATALOG.at(-1).id);
    expect(first.pages.length).toBeGreaterThan(0);
    expect(last.ex.length).toBe(LESSON_CATALOG.at(-1).exCount);
  });

  it("説明付きの意図的エラー例を教材として保持する", () => {
    const cases = [
      ["data-types", "ERROR: MethodError"],
      ["local-environment", "ERROR: LoadError: UndefVarError"],
    ];
    for (const [id, prefix] of cases) {
      const lesson = LESSONS.find((item) => item.id === id);
      const page = lesson.pages.find((item) => item.err && item.out?.startsWith(prefix));
      expect(page, `${id} の意図的エラー例が見つからない`).toBeTruthy();
      expect(page.a?.join(" ").length, `${id} のエラー解説がない`).toBeGreaterThan(40);
    }
  });

  it("id が重複していない", () => {
    const ids = LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(LESSONS.map((l) => [l.id]))("%s: id は採番に依存しない意味 slug", (id) => {
    expect(id).toMatch(SEMANTIC_ID);
    expect(id).not.toMatch(/^[lx][0-9]+$/);
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

describe("番号に依存しない参照", () => {
  it("レッスン本文と演習に『レッスン+番号』がない", () => {
    const texts = [];
    for (const lesson of LESSONS) {
      for (const page of lesson.pages) texts.push(page.t, ...(page.b || []), ...(page.a || []));
      for (const ex of lesson.ex) {
        texts.push(ex.q, ex.why, ex.hint, ...(ex.opts || []));
        for (const item of ex.items || []) texts.push(item.s, item.why);
      }
    }
    for (const value of texts.filter(Boolean)) {
      expect(String(value)).not.toMatch(NUMBERED_LESSON_REFERENCE);
    }
  });

  it("ノートブックとロードマップに『レッスン+番号』がない", () => {
    const notebookDir = join(ROOT, "public", "notebooks");
    const files = readdirSync(notebookDir)
      .filter((name) => name.endsWith(".jl"))
      .map((name) => join(notebookDir, name));
    files.push(join(ROOT, "public", "roadmap.html"));

    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(NUMBERED_LESSON_REFERENCE);
    }
  });
});

describe("データの整形・保存・再利用回の学習契約", () => {
  const id = "reshape-import";

  it("データ操作編の最後で整形からround tripへ進む", () => {
    const numberedIds = LESSONS.filter((lesson) => lesson.num != null).map((lesson) => lesson.id);
    expect(numberedIds[15]).toBe(id);
    expect(numberedIds[16]).toBe("descriptive-statistics");

    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    expect(lesson.title).toBe("データの整形・保存・再利用");
    expect(lesson.pages.length).toBeGreaterThanOrEqual(13);
    expect(lesson.ex.length).toBe(7);
    for (const concept of [
      "CSV.write",
      "Arrow.write",
      "JLD2",
      "Serialization",
      "deserialize",
      ".rda",
      "saveRDS",
      "round trip",
      "SHA-256",
      "StanSample.jl",
      "draws CSV",
      "Project.toml",
    ]) {
      expect(text, `${concept} が保存回にない`).toContain(concept);
    }
    const code = lesson.pages.map((page) => page.code || "").join("\n");
    expect(code).not.toMatch(/Pkg\.(add|activate|instantiate)/);
  });

  it("CSVのschema損失とArrow・JLD2のmetadata往復を掲載出力で固定する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    expect(text).toContain('condition_type = \\"String15\\"');
    expect(text).toContain("missing_restored = true");
    expect(text).toContain("CategoricalValue{String, UInt32}");
    expect(text).toContain('condition_levels = [\\"control\\", \\"treatment\\"]');
    expect(text).toContain("ordered = false");
    expect(text).toContain('formula = \\"rt ~ condition\\"');
  });

  it("保守script・validation環境・CIが16本の検証に保存往復を含む", () => {
    const checker = readFileSync(join(ROOT, "scripts", "data-persistence-check.jl"), "utf8");
    const runner = readFileSync(join(ROOT, "scripts", "run-numeric-checks.jl"), "utf8");
    const project = readFileSync(join(ROOT, "validation", "Project.toml"), "utf8");
    const deploy = readFileSync(join(ROOT, ".github", "workflows", "deploy.yml"), "utf8");
    for (const packageName of ["CSV", "Arrow", "JLD2"]) {
      expect(project).toContain(packageName);
    }
    expect(checker).toContain("mktempdir()");
    expect(checker).toContain("GC.gc(true)");
    expect(checker).toContain("sha256");
    expect(checker).toContain("eltype(arrow_data.condition) <: CategoricalValue");
    expect(runner).toContain('"scripts/data-persistence-check.jl"');
    expect(deploy).toContain("Run 16 numerical regression checks");
  });

  it("ロードマップがRData・RDSを訂正し、Stanを任意bridgeにする", () => {
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    expect(roadmap).toContain("データの整形・保存・再利用");
    expect(roadmap).toContain("RData.jlが文書化するのは.rda／.RDataの読込");
    expect(roadmap).toContain("RCall: RDS");
    expect(roadmap).toContain("StanSample.jl／CmdStan（任意発展）");
    expect(roadmap).not.toContain(".RData・.rds は RData.jl で直接読めます");
  });
});

describe("再現可能な研究プロジェクト補講の学習契約", () => {
  const id = "reproducible-research-project";

  it("番号付き37回を動かさず、横断的な補講として公開する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    expect(lesson.section).toBe("extra");
    expect(lesson.num).toBeNull();
    expect(lesson.numInSection).toBe(2);
    expect(LESSONS.filter((item) => item.num != null)).toHaveLength(37);
    expect(lesson.pages.length).toBeGreaterThanOrEqual(14);
    expect(lesson.ex).toHaveLength(6);
  });

  it("environment・path・schema・provenanceを一つの実行経路へ結ぶ", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    for (const concept of [
      "Project.toml",
      "Manifest.toml",
      "instantiate",
      "--project=.",
      "@__DIR__",
      "data dictionary",
      "schema.toml",
      "ArgumentError",
      "primary key",
      "SHA-256",
      "run ID",
      "provenance",
      "isequal",
      "clean run",
    ]) {
      expect(text, `${concept} が再現可能project補講にない`).toContain(concept);
    }
    const code = lesson.pages.map((page) => page.code || "").join("\n");
    expect(code).not.toContain("pwd(");
    expect(code).not.toMatch(/(?:C:\\\\Users|\/Users\/)\w+/);
  });

  it("検証済みの移動可能workflowと掲載出力を同期する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    const checker = readFileSync(join(ROOT, "scripts", "reproducible-workflow-check.jl"), "utf8");
    const runner = readFileSync(join(ROOT, "scripts", "run-numeric-checks.jl"), "utf8");
    const deploy = readFileSync(join(ROOT, ".github", "workflows", "deploy.yml"), "utf8");

    expect(text).toContain("d27e87e8c878");
    expect(text).toContain("missing == missing");
    for (const concept of [
      "portable_relpath",
      "validate_trials",
      "workflow_fingerprint",
      "write_immutable_csv",
      "raw_unchanged",
      "isequal",
      "mktempdir",
    ]) {
      expect(checker, `${concept} がworkflow検証にない`).toContain(concept);
    }
    expect(runner).toContain('"scripts/reproducible-workflow-check.jl"');
    expect(deploy).toContain("Run 16 numerical regression checks");
  });

  it("ロードマップと保存回から公開補講へ到達できる", () => {
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    const persistence = LESSONS.find((item) => item.id === "reshape-import");
    expect(roadmap).toContain("再現可能な研究プロジェクト(公開中)");
    expect(roadmap).toContain("Project／Manifest");
    expect(JSON.stringify(persistence)).toContain("補講『再現可能な研究プロジェクト』");
  });

  it("配布template・archive・download導線をclean process検証で固定する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const download = lesson.pages.find((page) => page.download)?.download;
    const archivePath = join(ROOT, "public", download.path);
    const templateRoot = join(ROOT, "examples", "reproducible-study");
    const checker = readFileSync(join(ROOT, "scripts", "reproducible-template-check.jl"), "utf8");
    const builder = readFileSync(join(ROOT, "scripts", "build-study-template-archive.jl"), "utf8");

    expect(download).toEqual({
      path: "templates/reproducible-study-template.tar",
      label: "研究project templateをdownload (.tar)",
    });
    expect(existsSync(archivePath)).toBe(true);
    for (const relativePath of [
      ".gitignore",
      ".gitattributes",
      "README.md",
      "Project.toml",
      "Manifest.toml",
      "code/run_analysis.jl",
      "data/example/trials_synthetic.csv",
      "data/raw/README.md",
      "metadata/data_dictionary.csv",
      "metadata/schema.toml",
      "metadata/study.toml",
      "metadata/DATA_LICENSE.txt",
    ]) {
      expect(existsSync(join(templateRoot, relativePath)), relativePath).toBe(true);
    }
    for (const concept of ["Tar.extract", "clean_process_runs", "ignorestatus", "input_before"])
      expect(checker, `${concept} がtemplate検証にない`).toContain(concept);
    expect(builder).toContain("Tar.create");
    expect(builder).toContain("TEMPLATE_FILES");
  });
});

describe("Gitで研究履歴と公開境界を管理する補講の学習契約", () => {
  const id = "git-research-history";

  it("番号付き37回を動かさず、3本目の横断的補講として公開する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    expect(lesson.section).toBe("extra");
    expect(lesson.num).toBeNull();
    expect(lesson.numInSection).toBe(3);
    expect(LESSONS.filter((item) => item.num != null)).toHaveLength(37);
    expect(lesson.pages.length).toBeGreaterThanOrEqual(14);
    expect(lesson.ex).toHaveLength(6);
  });

  it("Gitの履歴・公開境界・事故対応を、機能の限界とともに扱う", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    for (const concept of [
      "git status --short",
      "git diff --staged",
      "staging area",
      "Project.toml",
      "Manifest.toml",
      "git check-ignore -v",
      "git ls-files",
      "data/example/trials_synthetic.csv",
      "data/raw/",
      "study.toml",
      "失効・rotation",
      "Git LFS",
      "pointer file",
      "annotated tag",
      "clean clone",
      "allowlist",
    ]) {
      expect(text, `${concept} がGit補講にない`).toContain(concept);
    }
    const code = lesson.pages.map((page) => page.code || "").join("\n");
    expect(code).not.toMatch(/git add\s+\.(?:\s|$)/m);
    expect(code).not.toContain("git push --force");
    expect(code).not.toContain("git filter-repo");
  });

  it("配布templateは公開合成例とprivate rawを分離する", () => {
    const templateRoot = join(ROOT, "examples", "reproducible-study");
    const ignore = readFileSync(join(templateRoot, ".gitignore"), "utf8");
    const study = readFileSync(join(templateRoot, "metadata", "study.toml"), "utf8");
    const analysis = readFileSync(join(templateRoot, "code", "run_analysis.jl"), "utf8");
    const builder = readFileSync(join(ROOT, "scripts", "build-study-template-archive.jl"), "utf8");

    expect(ignore).toContain("data/raw/*");
    expect(ignore).toContain("!data/raw/README.md");
    expect(study).toContain('input_path = "data/example/trials_synthetic.csv"');
    expect(study).toContain('input_classification = "synthetic-public"');
    expect(analysis).toContain("project_input_path");
    expect(analysis).toContain("input_pathはproject外を参照できません");
    expect(analysis).toContain("realpath(normalized)");
    expect(analysis).toContain("input_pathの実体はproject外を参照できません");
    expect(builder).toContain('"data/example/trials_synthetic.csv"');
    expect(builder).not.toContain('"data/raw/trials.csv"');
    expect(existsSync(join(templateRoot, "data", "raw", "trials.csv"))).toBe(false);
  });

  it("実Git repositoryでignore・branch・annotated tagを検証する", () => {
    const checker = readFileSync(
      join(ROOT, "scripts", "version-control-boundary-check.jl"),
      "utf8"
    );
    const runner = readFileSync(join(ROOT, "scripts", "run-numeric-checks.jl"), "utf8");
    const deploy = readFileSync(join(ROOT, ".github", "workflows", "deploy.yml"), "utf8");
    for (const concept of [
      "git_command",
      "check-ignore",
      "ls-files",
      "LEAK_TEST_TOKEN",
      "private@example.invalid",
      "env-update-test",
      "analysis-v1.0",
      "cat-file",
    ]) {
      expect(checker, `${concept} がGit境界検証にない`).toContain(concept);
    }
    expect(runner).toContain('"scripts/version-control-boundary-check.jl"');
    expect(deploy).toContain("Run 16 numerical regression checks");
  });

  it("ロードマップとdownload版へ到達できる", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    const download = lesson.pages.find((page) => page.download)?.download;
    expect(roadmap).toContain("Gitで研究履歴と公開境界を管理する(公開中)");
    expect(roadmap).toContain("Git LFSも匿名化ではない");
    expect(download).toEqual({
      path: "templates/reproducible-study-template.tar",
      label: "公開境界つき研究project templateをdownload (.tar)",
    });
  });
});

describe("浮動小数点と数値安定性の学習契約", () => {
  it("データ型回が有限精度・underflow・丸め前判定を導入する", () => {
    const lesson = LESSONS.find((item) => item.id === "data-types");
    const text = JSON.stringify(lesson);
    expect(lesson.pages.length).toBeGreaterThanOrEqual(6);
    for (const concept of [
      "Float64",
      "isapprox",
      "eps(1.0)",
      "nextfloat",
      "underflow",
      "log(probability^n)",
      "n * log(probability)",
      "BigFloat",
      "isfinite",
      "丸め",
    ]) {
      expect(text, `${concept} がデータ型回にない`).toContain(concept);
    }
    expect(text).toContain("-921.034");
    expect(text).toContain("(raw = true, rounded = false, shown = 0.05)");
  });

  it("確率分布回が裾確率・桁落ち・log空間の安定計算へ接続する", () => {
    const lesson = LESSONS.find((item) => item.id === "probability-distributions");
    const text = JSON.stringify(lesson);
    expect(lesson.pages.length).toBeGreaterThanOrEqual(9);
    for (const concept of [
      "logpdf",
      "logcdf",
      "logccdf",
      "ccdf",
      "log1p",
      "expm1",
      "cancellation",
      "logaddexp",
      "softplus",
      "非有限",
      "BigFloat",
    ]) {
      expect(text, `${concept} が確率分布回にない`).toContain(concept);
    }
    for (const output of ["7.619853024160498e-24", "-800.919", "5.0e-9", "-999.6867383124818"]) {
      expect(text, `${output} がJulia実測出力にない`).toContain(output);
    }
  });

  it("安定計算課題がロードマップ・NB2・Pluto契約へ同期される", () => {
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    const notebook = readFileSync(join(ROOT, "public", "notebooks", "nb2-stats.jl"), "utf8");
    const checker = readFileSync(join(ROOT, "scripts", "nb-exec-check.jl"), "utf8");
    expect(roadmap).toContain("Float64の有限精度");
    expect(roadmap).toContain("logpdf / ccdf");
    expect(notebook).toContain("stability_summary");
    expect(notebook).toContain("log(rare_probability^repetitions)");
    expect(notebook).toContain("ccdf(standard_normal, 10)");
    expect(checker).toContain('"nb2-stats.jl" => 6');
  });
});

describe("確率・推論ブロックの学習契約", () => {
  const expectedOrder = [
    "descriptive-statistics",
    "exploratory-visualization",
    "probability-distributions",
    "randomness-reproducibility",
    "sampling-distributions",
    "estimation-uncertainty",
    "hypothesis-testing",
    "monte-carlo",
    "uncertainty-visualization",
  ];

  it("経験分布→確率分布→標本分布→推定→検定の順に並ぶ", () => {
    const numberedIds = LESSONS.filter((lesson) => lesson.num != null).map((lesson) => lesson.id);
    expect(numberedIds.slice(16, 25)).toEqual(expectedOrder);
  });

  it.each([
    "probability-distributions",
    "randomness-reproducibility",
    "sampling-distributions",
    "estimation-uncertainty",
    "uncertainty-visualization",
  ])("%s: 概念・コード・反例を展開できる5ページ以上", (id) => {
    expect(LESSONS.find((lesson) => lesson.id === id).pages.length).toBeGreaterThanOrEqual(5);
  });

  it("確率分布回が主要な分布構築・確率・乱数APIを扱う", () => {
    const lesson = LESSONS.find((item) => item.id === "probability-distributions");
    const probability = JSON.stringify(lesson);
    expect(lesson.pages.length).toBeGreaterThanOrEqual(9);
    for (const api of [
      "Normal(",
      "Bernoulli(",
      "Binomial(",
      "Poisson(",
      "LogNormal(",
      "pdf(",
      "cdf(",
      "quantile(",
      "rand(",
    ]) {
      expect(probability, `${api} が確率分布回にない`).toContain(api);
    }
  });

  it("仮説検定回がデザイン別の順位検定・置換検定を11ページ以上で統合する", () => {
    const lesson = LESSONS.find((item) => item.id === "hypothesis-testing");
    const text = JSON.stringify(lesson);
    expect(lesson.pages.length).toBeGreaterThanOrEqual(11);
    for (const concept of [
      "MannWhitneyUTest",
      "ExactMannWhitneyUTest",
      "SignTest",
      "SignedRankTest",
      "KruskalWallisTest",
      "ApproximatePermutationTest",
      "交換可能性",
      "順位双列相関",
      "Holm",
      "同順位",
      "擬似反復",
    ]) {
      expect(text, `${concept} が仮説検定回にない`).toContain(concept);
    }
  });

  it("順位検定の検定対象・効果量・事後比較の固定例を持つ", () => {
    const text = JSON.stringify(LESSONS.find((item) => item.id === "hypothesis-testing"));
    expect(text).toContain("[0.007109, 0.006744]");
    expect(text).toContain("[0.855, 0.71]");
    expect(text).toContain("signed_rank_p = 0.00293");
    expect(text).toContain("epsilon2 = 0.463");
    expect(text).toContain("[0.18, 0.0076, 0.0329]");
    expect(text).toContain("p = 0.00658, mcse = 0.00036");
    expect(text).toContain("中央値の差の検定\u300fと断定しません");
  });

  it("順位検定課題がロードマップ・NB3・Pluto契約へ同期される", () => {
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    const notebook = readFileSync(join(ROOT, "public", "notebooks", "nb3-sim.jl"), "utf8");
    const checker = readFileSync(join(ROOT, "scripts", "nb-exec-check.jl"), "utf8");
    for (const text of [roadmap, notebook]) {
      expect(text).toContain("MannWhitneyUTest");
    }
    expect(notebook).toContain("rank_summary");
    expect(notebook).toContain("rank_pair_score");
    expect(notebook).toContain('HypothesisTests = "~0.11.8"');
    expect(checker).toContain('"nb3-sim.jl" => 5');
  });

  it("確率・推論のコード例は明示RNGを使い、グローバルseed!に戻らない", () => {
    const ids = new Set([
      "randomness-reproducibility",
      "sampling-distributions",
      "estimation-uncertainty",
      "hypothesis-testing",
      "monte-carlo",
      "uncertainty-visualization",
    ]);
    for (const lesson of LESSONS.filter((item) => ids.has(item.id))) {
      const code = lesson.pages.map((page) => page.code || "").join("\n");
      expect(code, `${lesson.id} に Xoshiro がない`).toContain("Xoshiro(");
      expect(code, `${lesson.id} がグローバルRNGをseed!している`).not.toContain("Random.seed!");
    }
  });

  it("不確かさの図が生データ・推定値・CIと主要な反例を扱う", () => {
    const lesson = LESSONS.find((item) => item.id === "uncertainty-visualization");
    const text = JSON.stringify(lesson);
    expect(lesson.title).toBe("不確かさを論文品質で可視化");
    for (const concept of [
      "生データ",
      "95%信頼区間",
      "scatter!(",
      "rangebars!(",
      "棒グラフ",
      "軸切断",
      "平滑化",
      "重なり",
    ]) {
      expect(text, `${concept} が不確かさ可視化回にない`).toContain(concept);
    }
  });

  it("L25の新しい目的がロードマップとNB3にも同期される", () => {
    const title = "不確かさを論文品質で可視化";
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    const notebook = readFileSync(join(ROOT, "public", "notebooks", "nb3-sim.jl"), "utf8");
    expect(roadmap).toContain(title);
    expect(notebook).toContain(title);
    expect(roadmap).not.toContain(">論文品質の可視化<");
    expect(notebook).not.toContain("「論文品質の可視化」");
  });
});

describe("尺度別関連ブロックの学習契約", () => {
  const associationIds = ["correlation-sampling", "scale-aware-association"];

  it("標本変動から尺度別指標の順に並ぶ", () => {
    const numberedIds = LESSONS.filter((lesson) => lesson.num != null).map((lesson) => lesson.id);
    expect(numberedIds.slice(25, 27)).toEqual(associationIds);
  });

  it.each(associationIds)("%s: 概念・コード・反例を展開できる5ページ以上", (id) => {
    expect(LESSONS.find((lesson) => lesson.id === id).pages.length).toBeGreaterThanOrEqual(5);
  });

  it("相関の標本変動回が区間と主要な失敗例を扱う", () => {
    const text = JSON.stringify(LESSONS.find((item) => item.id === "correlation-sampling"));
    for (const concept of ["母相関", "標本相関", "標本分布", "fisher_ci", "非線形", "外れ値", "範囲制限"]) {
      expect(text, `${concept} が相関の標本変動回にない`).toContain(concept);
    }
  });

  it("尺度別回が連続・2値・順序とCTT・妥当性への接続を扱う", () => {
    const lesson = LESSONS.find((item) => item.id === "scale-aware-association");
    const text = JSON.stringify(lesson);
    expect(lesson.pages.length).toBeGreaterThanOrEqual(15);
    for (const concept of [
      "corspearman",
      "corkendall",
      "点双列",
      "φ係数",
      "tetrachoric",
      "polychoric",
      "polyserial",
      "修正済み項目–合計相関",
      "収束的妥当性",
      "弁別的妥当性",
      "ChisqTest",
      "FisherExactTest",
      "期待度数",
      "リスク差",
      "リスク比",
      "オッズ比",
      "Cramér",
      "調整済み残差",
      "holm_adjust",
      "McNemar",
      "BinomialTest",
      "structural zero",
      "Simpson",
      "Mantel–Haenszel",
      "mh_or",
      "fweights",
      "標準化",
      "positivity",
      "collider",
      "非可縮",
    ]) {
      expect(text, `${concept} が尺度別関連回にない`).toContain(concept);
    }
    for (const output of [
      "p = 0.0107",
      "RD = 0.36",
      "fisher_central = 0.0498",
      "cramers_v = 0.304",
      "risk_difference = -0.1125",
      "marginal_or = 0.748",
      "mh_or = 1.447",
      "adjusted_or = 1.429",
      "rd = 0.0541",
    ]) {
      expect(text, `${output} がJulia実測出力にない`).toContain(output);
    }
  });

  it("関連ブロックは明示RNGを使い、グローバルseed!へ戻らない", () => {
    for (const lesson of LESSONS.filter((item) => associationIds.includes(item.id))) {
      const code = lesson.pages.map((page) => page.code || "").join("\n");
      expect(code, `${lesson.id} に Xoshiro がない`).toContain("Xoshiro(");
      expect(code, `${lesson.id} がグローバルRNGをseed!している`).not.toContain("Random.seed!");
    }
  });

  it("L26・L27の目的がロードマップとNB4へ同期される", () => {
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    const notebook = readFileSync(join(ROOT, "public", "notebooks", "nb4-model.jl"), "utf8");
    const checker = readFileSync(join(ROOT, "scripts", "nb-exec-check.jl"), "utf8");
    for (const title of ["相関係数の標本変動", "尺度に応じた関連指標"]) {
      expect(roadmap).toContain(title);
      expect(notebook).toContain(title);
    }
    expect(notebook).toContain("corspearman");
    expect(notebook).toContain("cross_summary");
    expect(notebook).toContain("simpson_summary");
    expect(notebook).toContain("simpson_marginal");
    expect(notebook).toContain("ChisqTest(cross_table)");
    expect(notebook).toContain("risk_difference");
    expect(roadmap).toContain("FisherExactTest");
    expect(roadmap).toContain("Cramér V");
    expect(checker).toContain('"nb4-model.jl" => 14');
    expect(notebook).toContain("Xoshiro(");
    expect(notebook).not.toContain("Random.seed!");
    expect(roadmap).not.toContain(">相関のシミュレーション<");
  });
});

describe("一般線形モデル統合回の学習契約", () => {
  const id = "linear-model-unification";

  it("L28として尺度別関連の直後に並ぶ", () => {
    const numberedIds = LESSONS.filter((lesson) => lesson.num != null).map((lesson) => lesson.id);
    expect(numberedIds[27]).toBe(id);
  });

  it("t検定・ANOVA・回帰・デザインを6ページ以上で統合する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    expect(lesson.title).toBe("t検定・ANOVA・回帰を一つのモデルで見る");
    expect(lesson.pages.length).toBeGreaterThanOrEqual(6);
    for (const concept of [
      "EqualVarianceTTest",
      "t_value^2",
      "Cohen",
      "eta2",
      "dof_residual",
      "OneSampleTTest",
      "difference ~ 1",
      "within-subject",
      "between-subject",
      "Welch",
      "最尤法",
    ]) {
      expect(text, `${concept} が一般線形モデル統合回にない`).toContain(concept);
    }
  });

  it("L28のコードは明示RNGを使い、グローバルseed!へ戻らない", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const code = lesson.pages.map((page) => page.code || "").join("\n");
    expect(code).toContain("Xoshiro(");
    expect(code).not.toContain("Random.seed!");
  });

  it("L28の目的とt²=F課題がロードマップ・NB4へ同期される", () => {
    const title = "t検定・ANOVA・回帰を一つのモデルで見る";
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    const notebook = readFileSync(join(ROOT, "public", "notebooks", "nb4-model.jl"), "utf8");
    expect(roadmap).toContain(title);
    expect(notebook).toContain(title);
    expect(notebook).toContain("tf_relation");
    expect(notebook).toContain("EqualVarianceTTest");
    expect(roadmap).not.toContain(">単回帰<");
  });
});

describe("重回帰・ANCOVA・モデル比較回の学習契約", () => {
  const id = "multiple-regression-ancova";

  it("L29として一般線形モデル統合回の直後に並ぶ", () => {
    const numberedIds = LESSONS.filter((lesson) => lesson.num != null).map((lesson) => lesson.id);
    expect(numberedIds[28]).toBe(id);
  });

  it("変数投入・参照水準・モデル比較・下位検定を9ページ以上で統合する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    expect(lesson.title).toBe("重回帰・ANCOVA・モデル比較");
    expect(lesson.pages.length).toBeGreaterThanOrEqual(9);
    for (const concept of [
      "stepwise",
      "categorical",
      "levels!",
      "DummyCoding",
      "control_coding",
      "ftest",
      "partial_r2",
      "pre_c * group",
      "HypothesisCoding",
      "vcov(model)",
      "Holm",
      "dropmissing",
      "collider",
      "Type III",
    ]) {
      expect(text, `${concept} が重回帰・ANCOVA回にない`).toContain(concept);
    }
  });

  it("参照水準変更の不変量と偽陽性反例を教材コードで固定する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    const code = lesson.pages.map((page) => page.code || "").join("\n");
    expect(code).toContain('base = "control"');
    expect(code).toContain("predict(m_control)");
    expect(code).toContain("predict(m_training)");
    expect(text).toContain("0.03641812283209555");
    expect(text).toContain("真の交互作用0");
    expect(code).toContain("Xoshiro(");
    expect(code).not.toContain("Random.seed!");
  });

  it("L29の目的と参照水準課題がロードマップ・NB4へ同期される", () => {
    const title = "重回帰・ANCOVA・モデル比較";
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    const notebook = readFileSync(join(ROOT, "public", "notebooks", "nb4-model.jl"), "utf8");
    expect(roadmap).toContain(title);
    expect(notebook).toContain(title);
    expect(notebook).toContain("training_model");
    expect(notebook).toContain('base = "training"');
    expect(notebook).toContain("CategoricalArrays");
    expect(notebook).toContain("StatsModels");
    expect(roadmap).not.toContain(">重回帰と交絡<");
  });
});

describe("回帰診断とVIF回の学習契約", () => {
  const id = "regression-diagnostics";

  it("L30としてANCOVAの直後、ロジスティック回帰の直前に並ぶ", () => {
    const numberedIds = LESSONS.filter((lesson) => lesson.num != null).map((lesson) => lesson.id);
    expect(numberedIds[29]).toBe(id);
    expect(numberedIds[30]).toBe("logistic-regression");
  });

  it("主要な仮定・影響診断・数値条件・正則化・選択後推論を23ページ以上で統合する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    expect(lesson.title).toBe("回帰診断とVIF");
    expect(lesson.pages.length).toBeGreaterThanOrEqual(23);
    for (const concept of [
      "条件付き平均",
      "非線形回帰",
      "残差対予測値",
      "Q–Q",
      "ShapiroWilkTest",
      "TDist(3)",
      "hc3_vcov",
      "modelmatrix",
      "cooksdistance",
      "レバレッジ",
      "1 ./ (1 .-",
      "GVIF",
      "中心化",
      "cond(X",
      "特異値",
      "beta_qr",
      "beta_normal_equation",
      "正規方程式",
      "QR",
      "SVD",
      "rank deficiency",
      "係数の感度",
      "rank(X_rank)",
      "nullspace",
      "beta_alternative",
      "beta_ridge_rank",
      "lambda_grid",
      "fold_id",
      "selected_lambda",
      "test_mse",
      "nested CV",
      "MLJLinearModels.RidgeRegressor",
      "情報が訓練へ漏れ",
      "通常のOLSのSE・p値",
      "soft_threshold",
      "elastic_net_fit",
      "coordinate descent",
      "selection_count_lasso",
      "selection_count_enet",
      "group penalty",
      "階層制約",
      "correlation_pvalue",
      "same_data_rejections",
      "sample splitting",
      "選択後推論",
      "MLJLinearModels.LassoRegressor",
      "ElasticNetRegressor",
      "参加者内依存",
    ]) {
      expect(text, `${concept} が回帰診断回にない`).toContain(concept);
    }
  });

  it("VIFの反例と中心化の不変量を固定する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    const code = lesson.pages.map((page) => page.code || "").join("\n");
    expect(text).toContain("[23.2, 23.2, 1.0]");
    expect(text).toContain("0.048");
    expect(text).toContain("[1.0, 1.0, 1.0]");
    expect(code).toContain("predict(m_raw)");
    expect(code).toContain("predict(m_center)");
    expect(code).toContain("Xoshiro(");
    expect(code).not.toContain("Random.seed!");
  });

  it("条件数・正規方程式・係数感度の反例を固定する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    const code = lesson.pages.map((page) => page.code || "").join("\n");
    for (const output of [
      "[3.447e12, 3.447, 1.003]",
      "[724461.81, 724461.81]",
      "[2.075e7, 4.315e14]",
      "0.01643806878237042",
      "[1.0e-6, 0.4265, 2.011e-7]",
    ]) {
      expect(text, `${output} が条件数のJulia実測出力にない`).toContain(output);
    }
    expect(code).toContain("cond(X_raw)");
    expect(code).toContain("X_near' * X_near");
    expect(code).toContain("beta_perturbed");
  });

  it("完全ランク落ち・リッジ・交差検証の反例を固定する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    const code = lesson.pages.map((page) => page.code || "").join("\n");
    for (const output of [
      "[7.746, 6.7831, 4.1012, 7.1221e-16]",
      "[2.000833, -7.666667, -11.666667, 10.666667]",
      "1.7763568394002505e-15",
      "[2.94392, 2.853049, 0.00127, 0.005573]",
      "[10.55, 6.108, 3.886, 3.054, 2.918, 3.734]",
      "[10.204, 2.514]",
      "[18.195, 0.474]",
    ]) {
      expect(text, `${output} が正則化のJulia実測出力にない`).toContain(output);
    }
    expect(code).toContain("null_direction");
    expect(code).toContain("lambda == 0");
    expect(code).toContain("train_rows, test_rows");
    expect(code).toContain("X_train[training, :]");
    expect(code).not.toContain("mean(X_cv; dims = 1)");
  });

  it("Lasso・Elastic Net・選択後推論の反例を固定する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    const code = lesson.pages.map((page) => page.code || "").join("\n");
    for (const output of [
      "[0.0, 1.485, 0.185, 0.0]",
      "[0.725, 0.77, 0.217, 0.0]",
      "[49, 80, 99, 20]",
      "[100, 100, 100, 29]",
      "[0.6425, 0.0545]",
      "[0.035, 0.483]",
    ]) {
      expect(text, `${output} がLassoのJulia実測出力にない`).toContain(output);
    }
    expect(code).toContain("lambda * alpha");
    expect(code).toContain("lambda * (1 - alpha)");
    expect(code).toContain("X[1:40, j]");
    expect(code).toContain("X[41:80, chosen_split]");
    expect(text).toContain("64.25%");
    expect(text).toContain("5.45%");
  });

  it("正規性検定だけでは原因と処方箋を決めない反例を固定する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    expect(text).toContain("shapiro_p = 4.646e-15");
    expect(text).toContain("curve_signal = 0.822");
    expect(text).toContain("spread_signal = 0.434");
    expect(text).toContain("quadratic_gain = 0.269");
    expect(text).toContain("非正規性、平均の非線形性、分散不均一");
  });

  it("L30とVIF課題がロードマップ・NB4へ同期される", () => {
    const title = "回帰診断とVIF";
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    const notebook = readFileSync(join(ROOT, "public", "notebooks", "nb4-model.jl"), "utf8");
    const checker = readFileSync(join(ROOT, "scripts", "nb-exec-check.jl"), "utf8");
    expect(roadmap).toContain(title);
    expect(notebook).toContain(title);
    expect(notebook).toContain("vif_value");
    expect(notebook).toContain("1 / (1 - r2(vif_aux))");
    expect(notebook).toContain("diagnostic_signals");
    expect(notebook).toContain("condition_summary");
    expect(notebook).toContain("cond(condition_X_raw)");
    expect(notebook).toContain("ridge_summary");
    expect(notebook).toContain("rank(rank_X)");
    expect(notebook).toContain("rank_penalty");
    expect(notebook).toContain("penalty_updates");
    expect(notebook).toContain("penalty_alpha");
    expect(notebook).toContain("max.(abs.(penalty_scores)");
    expect(notebook).toContain("using LinearAlgebra");
    expect(notebook).toContain("ShapiroWilkTest(residuals(diagnostic_linear))");
    expect(notebook).toContain("r2(diagnostic_quadratic) - r2(diagnostic_linear)");
    expect(roadmap).toContain("QR対正規方程式");
    expect(roadmap).toContain("情報漏洩を防ぐ交差検証");
    expect(roadmap).toContain("nested CV");
    expect(roadmap).toContain("Lasso");
    expect(roadmap).toContain("post-selection");
    expect(checker).toContain('"nb4-model.jl" => 14');
    expect(roadmap).toContain('<span class="lnum">L31</span>');
  });
});

describe("ロジスティック回帰回の学習契約", () => {
  const id = "logistic-regression";

  it("L31として回帰診断の直後に並ぶ", () => {
    const numberedIds = LESSONS.filter((lesson) => lesson.num != null).map((lesson) => lesson.id);
    expect(numberedIds[29]).toBe("regression-diagnostics");
    expect(numberedIds[30]).toBe(id);
  });

  it("GLM/GLMM境界・解釈・診断・較正・意思決定を14ページ以上で統合する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    expect(lesson.title).toBe("ロジスティック回帰");
    expect(lesson.pages.length).toBeGreaterThanOrEqual(14);
    for (const concept of [
      "Bernoulli個票",
      "Binomial集計",
      "LogitLink",
      "interval = :confidence",
      "平均限界効果",
      "fweights",
      "DummyCoding",
      "severity * group",
      "deviance(reduced_model)",
      "完全分離",
      "Brier score",
      "AUC",
      "非可縮",
      "二項ロジットGLM",
      "GLM.glm",
      "ロジスティックGLMM",
      "subject-specific OR",
      "decision_metrics",
      "false_negative_cost",
      "cost_per_person",
      "C_FP / (C_FP + C_FN)",
      "calibration_model",
      "較正傾き",
      "ppv_by_prevalence",
      "高リスク者を選ぶこと",
      "treat-all",
    ]) {
      expect(text, `${concept} がロジスティック回帰回にない`).toContain(concept);
    }
  });

  it("個票と集計、参照水準、識別と較正の反例を固定する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    const code = lesson.pages.map((page) => page.code || "").join("\n");
    expect(text).toContain("[0.111, 0.217, 0.268, 0.192, 0.091]");
    expect(text).toContain("overconfident_brier = 0.216");
    expect(text).toContain("2.2e−16");
    expect(code).toContain("weights = fweights(grouped_df.trials)");
    expect(code).toContain('base = "control"');
    expect(code).toContain("Xoshiro(");
    expect(code).not.toContain("Random.seed!");
  });

  it("logit係数と意思決定閾値を分ける反例を固定する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    const code = lesson.pages.map((page) => page.code || "").join("\n");
    for (const output of [
      "threshold = 0.167, actions = 839",
      "threshold = 0.5, actions = 327",
      "cost = 0.588",
      "cost = 1.016",
      "[-0.098, 0.786]",
      "[-0.098, 0.314]",
      "[0.174, 0.5, 0.8]",
    ]) {
      expect(text, `${output} が意思決定のJulia実測出力にない`).toContain(output);
    }
    expect(code).toContain("false_negative_cost * fn");
    expect(code).toContain("predicted_logit");
    expect(text).toContain("テスト標本で最小値を探して");
    expect(text).toContain("個別介入効果");
  });

  it("L31の目的と予測確率課題がロードマップ・NB4へ同期される", () => {
    const title = "ロジスティック回帰";
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    const notebook = readFileSync(join(ROOT, "public", "notebooks", "nb4-model.jl"), "utf8");
    expect(roadmap).toContain(title);
    expect(roadmap).toContain("Bernoulli個票とBinomial集計");
    expect(roadmap).toContain("GLM ≠ GLMM");
    expect(roadmap).toContain("意思決定閾値");
    expect(notebook).toContain(title);
    expect(notebook).toContain("固定効果だけのロジスティックGLM");
    expect(notebook).toContain("予測確率");
    expect(notebook).toContain("predict(m7");
    expect(notebook).toContain("Xoshiro(3101)");
    expect(notebook).toContain("decision_summary");
    expect(notebook).toContain("decision_cost(0.5)");
    expect(notebook).toContain("false_positive_cost + false_negative_cost");
  });
});

describe("順序・多項ロジスティック回帰回の学習契約", () => {
  const id = "categorical-outcomes";

  it("L32として二項ロジットと測定ブロックの間に並ぶ", () => {
    const numberedIds = LESSONS.filter((lesson) => lesson.num != null).map((lesson) => lesson.id);
    expect(numberedIds[30]).toBe("logistic-regression");
    expect(numberedIds[31]).toBe(id);
    expect(numberedIds[32]).toBe("classical-test-theory");
  });

  it("実行を必須にせず、尺度選択・参照水準・仮定・階層化の境界を14ページ以上で統合する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    expect(lesson.title).toBe("順序・多項ロジスティック回帰");
    expect(lesson.tag).toContain("発展概説");
    expect(lesson.pages.length).toBeGreaterThanOrEqual(14);
    expect(lesson.ex.length).toBe(5);
    for (const concept of [
      "数式と掲載出力を読めば十分",
      "この章では学習環境を変更しない",
      "比例オッズ",
      "OrdinalMultinomialModels.jl 0.4.5",
      "MultinomialRegression.jl 0.4.0",
      "CategoricalArrays 0.10",
      "MLJLinearModels.jl",
      "GLMNet.jl",
      "predict_p",
      "polrtest",
      "Brant",
      "参照カテゴリ",
      "IIA",
      "完全／準分離",
      "OrderedLogistic",
      "MixedModels.jl",
      "Turing.jl",
      "multiclass log loss",
    ]) {
      expect(text, `${concept} が多カテゴリロジット回にない`).toContain(concept);
    }
    expect(lesson.pages.every((page) => page.code == null)).toBe(true);
    expect(lesson.ex.every((exercise) => exercise.code == null)).toBe(true);
  });

  it("閾値制約・確率和・参照カテゴリ変更後の確率不変性を出力読解で固定する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    expect(text).toContain("−0.496、0.691");
    expect(text).toContain("Low 0.378、Medium 0.288、High 0.334");
    expect(text).toContain("[18.858 12.997; −6.119 −4.079]");
    expect(text).toContain("[0.737661, 0.057143, 0.205196]");
    expect(text).toContain("[5.861 −12.997; −2.040 4.079]");
    expect(text).toContain("参照変更の前後");
  });

  it("L32と隔離数値検証がロードマップ・script・Projectへ同期される", () => {
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    const checker = readFileSync(join(ROOT, "scripts", "categorical-outcomes-check.jl"), "utf8");
    const setup = readFileSync(join(ROOT, "scripts", "setup-categorical-validation-env.jl"), "utf8");
    const project = readFileSync(join(ROOT, "validation", "categorical", "Project.toml"), "utf8");
    expect(roadmap).toContain("順序・多項ロジスティック回帰");
    expect(roadmap).toContain("全37レッスン公開中");
    expect(roadmap).toContain('<span class="lnum">L32</span>');
    expect(roadmap).toContain("実行環境を変更せず");
    expect(roadmap).toContain("発展概説");
    expect(checker).toContain("ordinal_thresholds");
    expect(checker).toContain("prob_b[reorder_b]");
    expect(setup).toContain("Pkg.instantiate()");
    expect(setup).toContain("Pkg.precompile()");
    expect(project).toContain("OrdinalMultinomialModels");
    expect(project).toContain("MultinomialRegression");
  });
});

describe("発展ブロックの学習深度契約", () => {
  const advancedIds = [
    "classical-test-theory",
    "convergent-discriminant-validity",
    "mixed-models",
    "measurement-error",
    "power-design",
  ];

  it("全章が必須理解・出力読解・任意実装を分離する", () => {
    for (const id of advancedIds) {
      const lesson = LESSONS.find((item) => item.id === id);
      const text = JSON.stringify(lesson);
      expect(text, `${id} に必須理解がない`).toContain("`必須理解`");
      expect(text, `${id} に出力読解がない`).toContain("`出力読解`");
      expect(text, `${id} に任意実装がない`).toContain("`任意実装`");
      expect(lesson.tag, `${id} のtagに任意性がない`).toContain("任意");
      const code = lesson.pages.map((page) => page.code || "").join("\n");
      expect(code).not.toMatch(/Pkg\.(add|activate|instantiate)/);
    }
  });

  it("ロードマップとNB5が任意実装の停止点を明示する", () => {
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    const notebook = readFileSync(join(ROOT, "public", "notebooks", "nb5-advanced.jl"), "utf8");
    expect(roadmap).toContain("必須概念→出力読解→任意実装");
    expect(roadmap).toContain("初回はコードを実行しなくても修了");
    expect(roadmap).toContain("formula必須");
    expect(roadmap).toContain("simulation任意");
    expect(notebook).toContain("任意実装ラボ");
    expect(notebook).toContain("ノートを実行しなくてもSTEP 5の学習は完了");
    expect(notebook).toContain("番号つき37本+ノートブック5冊");
  });
});

describe("古典的テスト理論と項目分析回の学習契約", () => {
  const id = "classical-test-theory";

  it("L33として測定ブロックの先頭に並ぶ", () => {
    const numberedIds = LESSONS.filter((lesson) => lesson.num != null).map((lesson) => lesson.id);
    expect(numberedIds[32]).toBe(id);
    expect(numberedIds[33]).toBe("convergent-discriminant-validity");
    expect(numberedIds[34]).toBe("mixed-models");
    expect(numberedIds[35]).toBe("measurement-error");
    expect(numberedIds[36]).toBe("power-design");
  });

  it("項目統計・測定モデル・信頼性係数・G理論・IRTを17ページ以上で統合する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    expect(lesson.title).toBe("古典的テスト理論と項目分析");
    expect(lesson.pages.length).toBeGreaterThanOrEqual(17);
    for (const concept of [
      "X = T + E",
      "wilson_interval",
      "修正済み項目–合計相関",
      "点双列相関",
      "part–whole",
      "coefficient_alpha",
      "τ等価性",
      "parallel",
      "congeneric",
      "KR-20",
      "omega_one_factor",
      "Cohen's κ",
      "prevalence",
      "G-study",
      "D-study",
      "relative_G",
      "項目反応理論",
      "2PL",
      "item_information",
      "局所独立",
      "alpha_duplicated",
      "一次元性",
      "SEM",
      "再検査相関",
      "完全一致",
    ]) {
      expect(text, `${concept} がCTT回にない`).toContain(concept);
    }
  });

  it("誤採点・冗長性・二次元性・範囲制限の反例を固定する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    const code = lesson.pages.map((page) => page.code || "").join("\n");
    expect(text).toContain("[-0.197, 0.197]");
    expect(text).toContain("[0.642, 0.833]");
    expect(text).toContain("(alpha = 0.642, kr20 = 0.642)");
    expect(text).toContain("congeneric = (alpha = 0.701, omega = 0.763)");
    expect(text).toContain("[0.91, 0.896, 0.135]");
    expect(text).toContain("[0.806, 0.893, 0.943]");
    expect(text).toContain("[0.102, 0.336, 0.562, 0.336, 0.102]");
    expect(text).toContain("alpha = 0.82");
    expect(text).toContain("alpha_narrow_ability_range = 0.163");
    expect(code).toContain("total .- raw_items[:, j]");
    expect(code).toContain("Xoshiro(3201)");
    expect(code).not.toContain("Random.seed!");
  });

  it("L33と項目分析課題がロードマップ・NB5へ同期される", () => {
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    const notebook = readFileSync(join(ROOT, "public", "notebooks", "nb5-advanced.jl"), "utf8");
    expect(roadmap).toContain("古典的テスト理論と項目分析");
    expect(roadmap).toContain("全37レッスン公開中");
    expect(notebook).toContain("ctt_stats");
    expect(notebook).toContain("ctt_total .- ctt_items[:, j]");
    expect(notebook).toContain("coefficient_alpha_nb");
    expect(notebook).toContain("kr20");
    expect(notebook).not.toContain("Random.seed!");
  });
});

describe("収束的・弁別的妥当性回の学習契約", () => {
  const id = "convergent-discriminant-validity";

  it("L34としてCTTと混合モデルの間に並ぶ", () => {
    const numberedIds = LESSONS.filter((lesson) => lesson.num != null).map((lesson) => lesson.id);
    expect(numberedIds[32]).toBe("classical-test-theory");
    expect(numberedIds[33]).toBe(id);
    expect(numberedIds[34]).toBe("mixed-models");
  });

  it("妥当性論証・MTMM・method効果・外的基準を10ページ以上で統合する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    expect(lesson.title).toBe("収束的・弁別的妥当性");
    expect(lesson.pages.length).toBeGreaterThanOrEqual(10);
    for (const concept of [
      "妥当性論証",
      "MTMM",
      "trait",
      "method",
      "same_method_heterotrait",
      "fisher_interval",
      "希薄化修正",
      "1.6",
      "共有項目",
      "future_outcome",
      "DIF",
    ]) {
      expect(text, `${concept} が妥当性回にない`).toContain(concept);
    }
  });

  it("収束・method共有・part-whole・外的基準の反例を固定する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    const code = lesson.pages.map((page) => page.code || "").join("\n");
    expect(text).toContain("[0.669, 0.286, 0.142]");
    expect(text).toContain("a_b_same_self_method = 0.364");
    expect(text).toContain("part_whole_correlation = 0.934");
    expect(text).toContain("future_outcome_correlation = 0.255");
    expect(code).toContain("Xoshiro(3301)");
    expect(code).not.toContain("Random.seed!");
  });

  it("L34とMTMM課題がロードマップ・NB5へ同期される", () => {
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    const notebook = readFileSync(join(ROOT, "public", "notebooks", "nb5-advanced.jl"), "utf8");
    expect(roadmap).toContain("収束的・弁別的妥当性");
    expect(notebook).toContain("mtmm_pattern");
    expect(notebook).toContain("mtmm_R[1,4]");
  });
});

describe("within／betweenデザインと混合効果モデル回の学習契約", () => {
  const id = "mixed-models";

  it("L35として妥当性と測定誤差の間に並ぶ", () => {
    const numberedIds = LESSONS.filter((lesson) => lesson.num != null).map((lesson) => lesson.id);
    expect(numberedIds[33]).toBe("convergent-discriminant-validity");
    expect(numberedIds[34]).toBe(id);
    expect(numberedIds[35]).toBe("measurement-error");
  });

  it("within／between・交差構造・パネル・推定・診断・出力を31ページ以上で統合する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    expect(lesson.title).toBe("within／betweenデザインと混合効果モデル");
    expect(lesson.pages.length).toBeGreaterThanOrEqual(31);
    expect(lesson.ex.length).toBe(9);
    for (const concept of [
      "擬似反復",
      "反復測定ANOVA",
      "between-subject",
      "within-subject",
      "(1 + condition_centered | subj)",
      "ランダム傾き",
      "difference-in-differences",
      "person-mean centering",
      "time_since_baseline",
      "micro-randomized design",
      "lag-1相関",
      "AR(1)",
      "forward split",
      "dynamic panel bias",
      "crossed",
      "nested",
      "G-study",
      "REML=true",
      "likelihoodratiotest",
      "zerocorr",
      "MixedModels.issingular",
      "Bernoulli()",
      "条件付きlog odds",
      "条件付きOR",
      "周辺OR",
      "plug-in周辺予測",
      "固定効果だけのロジスティックGLM",
      "母集団平均確率",
      "既知参加者×新規項目",
      "π²/3",
      "行を無作為分割",
      "leave-subject-out",
      "new_re_levels=:population",
      "proper scoring rule",
      "calibration-in-the-large",
      "完全・準完全分離",
      "nAGQ>1",
      "意思決定",
      "parametric bootstrap",
      "conditional R²",
      "RegressionTables.jl",
      "renderSettings = asciiOutput()",
      "DataFrame(coeftable(m_slope))",
      "VarCorr(m_slope)",
      "Effects.jl",
      "emmeans",
      "empairs",
      "MixedModelsMakie.jl",
      "random_structure_in_table = false",
    ]) {
      expect(text, `${concept} が混合モデル回にない`).toContain(concept);
    }
  });

  it("擬似反復・傾き欠落・within/between混同・境界推定を固定する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    const code = lesson.pages.map((page) => page.code || "").join("\n");
    expect(text).toContain("(naive = 5.47, mixed = 22.0)");
    expect(text).toContain("(random_intercept = 3.93, random_slope = 6.89)");
    expect(text).toContain("(conflated = 1.03, between = 3.02, within = 1.0)");
    expect(text).toContain("(lr = 7.27, p = 0.007)");
    expect(text).toContain("theta = [0.887, -0.0, 0.0]");
    expect(text).toContain("odds_ratio = 3.17");
    expect(text).toContain("conditional_or = 3.171");
    expect(text).toContain("marginal_or = 2.682");
    expect(text).toContain("marginal_difference = 0.241");
    expect(text).toContain("combined = 0.196");
    expect(text).toContain("deviance_difference = 19.772");
    expect(text).toContain("optimizer = :FTOL_REACHED");
    expect(text).toContain("row_conditional = (brier = 0.205, log_loss = 0.594)");
    expect(text).toContain("row_population = (brier = 0.255, log_loss = 0.704)");
    expect(text).toContain("calibration_in_the_large = 0.103");
    expect(text).toContain("time_by_treatment = 1.465");
    expect(text).toContain("random_intercept = 0.034");
    expect(text).toContain("random_slope = 0.086");
    expect(text).toContain("lag1_conditional_residual = 0.316");
    expect(text).toContain("predicted_rt");
    expect(text).toContain("451.47");
    expect(text).toContain("561.56");
    expect(text).toContain("all_pairwise_comparisons = 6");
    expect(code).toContain("Xoshiro(3401)");
    expect(code).toContain("Xoshiro(3404)");
    expect(code).toContain("Xoshiro(3405)");
    expect(code).toContain("Xoshiro(3410)");
    expect(code).toContain("Xoshiro(3420)");
    expect(code).toContain("(1 + time_since_baseline | subj)");
    expect(code).toContain("binary_random_slope.LMM.optsum");
    expect(code).not.toContain("Random.seed!");
  });

  it("L35とランダム傾き課題がロードマップ・NB5へ同期される", () => {
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    const notebook = readFileSync(join(ROOT, "public", "notebooks", "nb5-advanced.jl"), "utf8");
    expect(roadmap).toContain("within／betweenデザインと混合効果モデル");
    expect(roadmap).toContain("(1+cond|subj)");
    expect(roadmap).toContain("conditional／marginal");
    expect(roadmap).toContain("grouped CV");
    expect(roadmap).toContain("Brier score・log loss");
    expect(roadmap).toContain("panel／lag");
    expect(notebook).toContain("ランダム切片と傾きを復元する");
    expect(notebook).toContain("(1 + condition_centered | subj)");
    expect(notebook).toContain("slope_sd = 20");
    expect(notebook).toContain("GLMMの条件付き確率と周辺確率を分ける");
    expect(notebook).toContain("glmm_probability_summary");
    expect(notebook).toContain("conditional_or");
    expect(notebook).toContain("marginal_or");
    expect(notebook).toContain("配備対象ごとに確率予測を採点する");
    expect(notebook).toContain("deployment_metric_summary");
    expect(notebook).toContain("deployment_score_nb");
    expect(notebook).toContain("パネルのformulaをシナリオから組み立てる");
    expect(notebook).toContain("panel_model_nb");
    expect(notebook).toContain("panel_lag1_nb");
    expect(notebook).not.toContain("Random.seed!");
  });
});

describe("測定誤差と希薄化回の学習契約", () => {
  const id = "measurement-error";

  it("L36として混合モデルと検定力設計の間に並ぶ", () => {
    const numberedIds = LESSONS.filter((lesson) => lesson.num != null).map((lesson) => lesson.id);
    expect(numberedIds[34]).toBe("mixed-models");
    expect(numberedIds[35]).toBe(id);
    expect(numberedIds[36]).toBe("power-design");
  });

  it("誤差モデル・相関・回帰・誤分類・補正を16ページ以上で統合する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    expect(lesson.title).toBe("測定誤差と希薄化");
    expect(lesson.pages.length).toBeGreaterThanOrEqual(16);
    for (const concept of [
      "X = X* + U",
      "平行測定",
      "E[U]=0",
      "Cov(U, X*)=0",
      "regression dilution",
      "結果誤差",
      "説明変数誤差",
      "Cohen's d",
      "VIF",
      "差別的誤分類",
      "Berkson誤差",
      "感度P(W=1|X*=1)",
      "Cohen's κ",
      "validation subsample",
      "regression calibration",
      "SIMEX",
      "潜在変数SEM",
      "測定不変性",
      "person-mean centering",
    ]) {
      expect(text, `${concept} が測定誤差回にない`).toContain(concept);
    }
  });

  it("希薄化・回帰非対称・係数汚染・差別的誤差の反例を固定する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    const code = lesson.pages.map((page) => page.code || "").join("\n");
    expect(text).toContain("(observed = 0.442, theoretical = 0.443)");
    expect(text).toContain("(corrected = 0.699, incompatible = 1.6)");
    expect(text).toContain("predictor_error_slope = 0.896");
    expect(text).toContain("noisy_beta2 = 0.465");
    expect(text).toContain("reported_slope = 0.423");
    expect(text).toContain("berkson_slope = 1.505");
    expect(text).toContain("corrected_r");
    expect(text).toContain("0.712");
    expect(code).toContain("Xoshiro(3501)");
    expect(code).toContain("Xoshiro(3506)");
    expect(code).not.toContain("Random.seed!");
  });

  it("L36と回帰非対称課題がロードマップ・NB5へ同期される", () => {
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    const notebook = readFileSync(join(ROOT, "public", "notebooks", "nb5-advanced.jl"), "utf8");
    expect(roadmap).toContain("古典的誤差と差別的誤差");
    expect(roadmap).toContain("Berkson");
    expect(notebook).toContain("相関の希薄化と回帰の非対称性を分ける");
    expect(notebook).toContain("measurement_error_slopes");
    expect(notebook).toContain("measurement_effects");
    expect(notebook).not.toContain("Random.seed!");
  });
});

describe("デザインの検定力設計回の学習契約", () => {
  const id = "power-design";

  it("L37として番号付き本編の最後に並ぶ", () => {
    const numbered = LESSONS.filter((lesson) => lesson.num != null);
    expect(numbered.at(-1).id).toBe(id);
    expect(numbered.at(-1).num).toBe(37);
  });

  it("生成・解析・校正・感度・報告を19ページ以上で統合する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    expect(lesson.title).toBe("デザインの検定力設計");
    expect(lesson.pages.length).toBeGreaterThanOrEqual(19);
    for (const concept of [
      "post-hoc power",
      "winner's curse",
      "zerocorr",
      "refit!",
      "Wilson",
      "required_nsim",
      "第I種過誤",
      "一般化軸",
      "ランダム傾き",
      "測定信頼性",
      "MCAR",
      "MAR／MNAR",
      "assurance",
      "regular_only",
      "failure_rate",
      "familywise",
      "逐次",
      "Pareto",
      "parametricbootstrap",
      "Project.toml／Manifest.toml",
    ]) {
      expect(text, `${concept} が検定力設計回にない`).toContain(concept);
    }
  });

  it("MCSE・帰無校正・一般化軸・悲観シナリオを固定する", () => {
    const lesson = LESSONS.find((item) => item.id === id);
    const text = JSON.stringify(lesson);
    const code = lesson.pages.map((page) => page.code || "").join("\n");
    expect(text).toContain("power = 0.71, mcse = 0.032");
    expect(text).toContain("type1 = 0.047");
    expect(text).toContain("more_subjects = 0.87, more_items = 0.82");
    expect(text).toContain("heterogeneous = 0.345");
    expect(text).toContain("reliability_05 = 0.66");
    expect(text).toContain("missing_20pct = 0.635");
    expect(text).toContain("effect_10 = 0.27");
    expect(text).toContain("singular_rate = 0.16");
    expect(text).toContain("at_power_80_half_point = 6400");
    expect(text).toContain("worst_case_half_point = 10000");
    expect(code).toContain("Xoshiro(3601)");
    expect(code).toContain("MixedModels.issingular");
    expect(code).not.toContain("Random.seed!");
  });

  it("L37とMCSE付き卒業課題がロードマップ・NB5へ同期される", () => {
    const roadmap = readFileSync(join(ROOT, "public", "roadmap.html"), "utf8");
    const notebook = readFileSync(join(ROOT, "public", "notebooks", "nb5-advanced.jl"), "utf8");
    expect(roadmap).toContain("MCSE・Wilson区間・singular率");
    expect(notebook).toContain("参加者×項目の交差ランダム傾き");
    expect(notebook).toContain("power_lmm_nb");
    expect(notebook).toContain("design_result");
    expect(notebook).toContain("singular_rate");
    expect(notebook).not.toContain("Random.seed!");
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
