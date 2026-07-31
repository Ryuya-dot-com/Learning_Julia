// Dropbox 配下で node_modules を同期対象から外す（macOS）。
// npm install のたびに自動適用される（監査指摘: xattr は node_modules 再作成で剥がれるため）。
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

if (process.platform === "darwin" && existsSync("node_modules")) {
  try {
    execSync("xattr -w com.dropbox.ignored 1 node_modules");
    console.log("node_modules を Dropbox 同期から除外しました");
  } catch {
    // Dropbox 外・xattr 不可でもインストールは失敗させない
  }
}
