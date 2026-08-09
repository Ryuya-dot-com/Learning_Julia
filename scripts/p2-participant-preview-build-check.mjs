import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const outputDir = resolve(process.argv[2] || "dist");
const participantHtmlPath = join(
  outputDir,
  "validation",
  "p2-likelihood",
  "ui-preview.html"
);
const mainHtmlPath = join(outputDir, "index.html");

const fail = (message) => {
  throw new Error(`P2 participant preview build check failed: ${message}`);
};

for (const path of [participantHtmlPath, mainHtmlPath]) {
  if (!existsSync(path)) fail(`required output is missing: ${relative(outputDir, path)}`);
}

const participantHtml = readFileSync(participantHtmlPath, "utf8");
const mainHtml = readFileSync(mainHtmlPath, "utf8");
if (!participantHtml.includes('name="robots" content="noindex,nofollow"')) {
  fail("participant preview must remain noindex,nofollow");
}
if (!participantHtml.includes('name="referrer" content="no-referrer"')) {
  fail("participant preview must remain no-referrer");
}
if (mainHtml.includes("ui-preview") || mainHtml.includes("p2ResearchParticipantPreview")) {
  fail("main lesson entry must not link or import the participant preview");
}

const files = [];
const visit = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else files.push(path);
  }
};
visit(outputDir);

const relativeFiles = files.map((path) => relative(outputDir, path));
for (const forbiddenName of [
  "learner-usability-observation",
  "learner-usability-round-summary",
]) {
  if (relativeFiles.some((path) => path.includes(forbiddenName))) {
    fail(`private usability record artifact was emitted: ${forbiddenName}`);
  }
}

const searchableExtensions = new Set([".html", ".js", ".css", ".json", ".csv"]);
const searchable = files
  .filter((path) => searchableExtensions.has(extname(path)))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
for (const forbiddenContent of [
  "learning-julia.p2.learner-usability-observation",
  '"record_kind":"participant_observation"',
  '"record_kind": "participant_observation"',
]) {
  if (searchable.includes(forbiddenContent)) {
    fail(`private usability record content was emitted: ${forbiddenContent}`);
  }
}

const jsonFixtures = relativeFiles.filter((path) =>
  /assets\/selection-count-report-v1-[^/]+\.json$/.test(path)
);
const csvFixtures = relativeFiles.filter((path) =>
  /assets\/selection-count-report-v1-[^/]+\.csv$/.test(path)
);
if (jsonFixtures.length !== 1 || csvFixtures.length !== 1) {
  fail("exactly one synthetic report JSON and CSV download must be emitted");
}

console.log(
  "P2_PARTICIPANT_PREVIEW_BUILD_PASS " +
  "noindex=true no_referrer=true catalog_link=false private_records=0 synthetic_downloads=2"
);
