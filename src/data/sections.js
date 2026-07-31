// セクション定義: 順序・配色・番号の有無・ノートブックの対応。
// レッスンの実体は lessons/<dir>/ 配下のファイル。レッスンが0本のセクションは表示されない。
// 新しいセクションを増やすときだけ、ここに1行足す。
export const SECTIONS = [
  { dir: "0-basics",   title: "基礎編",                     sub: "文法の土台",             color: "#2A2733", numbered: true },
  { dir: "1-setup",    title: "STEP 0 / 環境構築",           sub: "Juliaを手元に",          color: "#E8A33D", numbered: true },
  { dir: "2-data",     title: "STEP 1 / データ操作編",       sub: "実データを読み、整える",   color: "#CB3C33", numbered: true, notebook: "nb1-data.jl" },
  { dir: "3-stats",    title: "STEP 2 / 統計・可視化編",     sub: "数字と図で、結果を語る",   color: "#389826", numbered: true, notebook: "nb2-stats.jl" },
  { dir: "4-sim",      title: "STEP 3 / シミュレーション基礎編", sub: "乱数で統計を体験する", color: "#9558B2", numbered: true, notebook: "nb3-sim.jl" },
  { dir: "5-model",    title: "STEP 4 / 統計モデリング編",   sub: "生成 → 推定 → 復元",     color: "#4063D8", numbered: true, notebook: "nb4-model.jl" },
  { dir: "6-advanced", title: "STEP 5 / 発展編",             sub: "研究の現場レベルへ",      color: "#6D3E86", numbered: true, notebook: "nb5-advanced.jl" },
  { dir: "bridge",     title: "R との連携",                  sub: "独立トラック",           color: "#276DC3", numbered: false, mark: "R", notebook: "nb6-r.jl" },
  { dir: "extra",      title: "補講",                        sub: "いつでも差しこめる",      color: "#A79FB0", numbered: false, mark: "補" },
];
