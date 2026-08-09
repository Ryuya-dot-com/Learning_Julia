import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

const p2LocalApiTarget = process.env.P2_LOCAL_API_TARGET;
if (p2LocalApiTarget && !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(p2LocalApiTarget)) {
  throw new Error("P2_LOCAL_API_TARGET must be a loopback HTTP origin");
}

// base はリポジトリ名と完全一致させる（大文字・アンダースコア含む）。
// 誤ると GitHub Pages で真っ白になる。dev では適用されないため preview で確認すること。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/Learning_Julia/",
  // The research preview is a public, unlisted participant entry. It remains
  // separate from src/main.jsx and the lesson catalog, but must be emitted by
  // the Pages production build so participants see the exact tested artifact.
  build: {
    rollupOptions: {
      input: {
        main: resolve(rootDir, "index.html"),
        p2ResearchParticipantPreview: resolve(
          rootDir,
          "validation/p2-likelihood/ui-preview.html"
        ),
      },
    },
  },
  // Playwrightの e2e/*.spec.js をVitestが誤収集しないよう、契約テストの境界を明示する。
  test: {
    include: ["src/**/*.test.js"],
  },
  // Opt-in research proxy. It is absent from normal dev/build/preview and can
  // target only a loopback Julia server.
  server: p2LocalApiTarget ? {
    proxy: {
      "/Learning_Julia/api/research/p2": {
        target: p2LocalApiTarget,
        changeOrigin: false,
      },
    },
  } : undefined,
});
