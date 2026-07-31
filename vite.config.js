import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base はリポジトリ名と完全一致させる（大文字・アンダースコア含む）。
// 誤ると GitHub Pages で真っ白になる。dev では適用されないため preview で確認すること。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/Learning_Julia/",
});
