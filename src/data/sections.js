// セクション定義: 順序・配色・番号の有無・ノートブックの対応。
// レッスンの実体は lessons/<dir>/ 配下のファイル。レッスンが0本のセクションは表示されない。
// 新しいセクションを増やすときだけ、ここに1行足す。
export const SECTIONS = [
  { dir: "0-basics",   title: "基礎編",                     sub: "文法の土台",             color: "#2A2733", numbered: true },
  { dir: "1-setup",    title: "STEP 0 / 環境構築",           sub: "Juliaを手元に",          color: "#E8A33D", numbered: true },
  { dir: "2-data",     title: "STEP 1 / データ操作編",       sub: "実データを読み、整える",   color: "#CB3C33", numbered: true, notebook: "nb1-data.jl" },
  { dir: "3-stats",    title: "STEP 2 / 統計・可視化編",                 sub: "経験分布から確率分布へ",       color: "#389826", numbered: true, notebook: "nb2-stats.jl" },
  { dir: "4-sim",      title: "STEP 3 / 確率・推論・シミュレーション編", sub: "抽出、標本分布、推定、検定",   color: "#9558B2", numbered: true, notebook: "nb3-sim.jl" },
  { dir: "5-model",    title: "STEP 4 / 関連と一般線形モデル編",         sub: "関連から回帰とGLMへ",          color: "#4063D8", numbered: true, notebook: "nb4-model.jl" },
  { dir: "6-advanced", title: "STEP 5 / 測定・依存構造・研究計画編",     sub: "尺度、混合モデル、検定力",     color: "#6D3E86", numbered: true, notebook: "nb5-advanced.jl" },
  { dir: "bridge",     title: "R・Stanとの連携",              sub: "任意の外部engine",       color: "#276DC3", numbered: false, mark: "橋", notebook: "nb6-r.jl" },
  { dir: "extra",      title: "補講",                        sub: "いつでも差しこめる",      color: "#A79FB0", numbered: false, mark: "補" },
];
