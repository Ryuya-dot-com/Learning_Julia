// Dropbox 配下で依存・ビルド成果物・ローカル検証出力を同期対象から外す（macOS）。
// npm install / build / test:e2e のたびに再適用する（ディレクトリ再作成で xattr が剥がれるため）。
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DROPBOX_IGNORE_TARGETS = [
  "node_modules",
  "dist",
  ".e2e-dist",
  "playwright-report",
  "test-results",
  "examples/reproducible-study/.cmdstan",
  "examples/reproducible-study/output",
  "examples/reproducible-study/data/derived",
  "examples/reproducible-study/metadata/runs",
];

export function applyDropboxIgnore(targets = DROPBOX_IGNORE_TARGETS) {
  if (process.platform !== "darwin") return [];
  const applied = [];
  for (const target of targets) {
    if (!existsSync(target)) continue;
    try {
      execFileSync("xattr", ["-w", "com.dropbox.ignored", "1", target]);
      applied.push(target);
    } catch {
      // Dropbox 外・xattr 不可でもインストールやビルドは失敗させない
    }
  }
  return applied;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const applied = applyDropboxIgnore();
  if (applied.length > 0) {
    console.log(`Dropbox 同期から除外しました: ${applied.join(", ")}`);
  }
}
