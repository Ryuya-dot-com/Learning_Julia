// 配色・フォント・グローバルCSS（Julia三色のアイデンティティ）
const C = {
  paper: "#FBFAF7",
  ink: "#2A2733",
  body: "#4A4454",
  sub: "#6E6879",
  faint: "#726B7E", // 旧 #A79FB0 は 2.44:1 でWCAG AA不合格だった(監査A6)。4.8:1 に調整
  purple: "#9558B2",
  purpleDeep: "#6D3E86",
  purpleSoft: "#F3ECF7",
  green: "#389826",
  greenText: "#2B7A1E", // 白背景上のテキスト・小型チップ背景用(4.5:1以上)。green は装飾用
  greenSoft: "#EAF6E6",
  red: "#CB3C33",
  redText: "#B02E26", // redSoft 背景上のテキスト用(5.6:1)
  redSoft: "#FBEDEC",
  night: "#272134",
  line: "#E8E4DC",
  edge: "#8A8296", // 入力欄など操作要素の境界線(非テキスト3:1を満たす)
  track: "#EFEBE2",
};

const JP =
  '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Yu Gothic", Meiryo, system-ui, sans-serif';
const MONO =
  'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

const GLOBAL_CSS = `
@keyframes riseIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.rise { animation: riseIn 0.28s ease-out both; }
@keyframes popIn { from { transform: scale(0.94); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.pop { animation: popIn 0.22s ease-out both; }
@media (prefers-reduced-motion: reduce) { .rise, .pop { animation: none; } }
input::placeholder { color: #6E6879; opacity: 1; }
:where(button, a, input, [tabindex]):focus-visible { outline: 3px solid #6D3E86; outline-offset: 2px; }
`;

export { C, JP, MONO, GLOBAL_CSS };
