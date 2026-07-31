/* ---------------- Juliaコードの簡易ハイライト ---------------- */

const KW = new Set([
  "function", "end", "for", "while", "if", "elseif", "else",
  "using", "return", "in", "true", "false", "break", "continue",
]);

function tokenizeLine(line) {
  const toks = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === "#") {
      toks.push(["com", line.slice(i)]);
      break;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') j += line[j] === "\\" ? 2 : 1;
      toks.push(["str", line.slice(i, Math.min(j + 1, line.length))]);
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < line.length && /[0-9.]/.test(line[j])) j++;
      toks.push(["num", line.slice(i, j)]);
      i = j;
      continue;
    }
    if ("\u00F7\u00D7\u2264\u2265\u2260\u221A\u03C0".includes(ch)) {
      // Julia\u7279\u6709\u306EUnicode\u6F14\u7B97\u5B50\u3002\u8B58\u5225\u5B50\u306E\u6587\u5B57\u7BC4\u56F2\u306B\u542B\u307E\u308C\u308B\u305F\u3081\u5148\u306B\u5224\u5B9A\u3059\u308B(\u76E3\u67FBA12)
      toks.push(["op", ch]);
      i++;
      continue;
    }
    if (/[A-Za-z_\u00C0-\uFFFF]/.test(ch)) {
      let j = i;
      while (j < line.length && /[A-Za-z0-9_!\u00C0-\uFFFF]/.test(line[j])) j++;
      const w = line.slice(i, j);
      toks.push([KW.has(w) ? "kw" : "id", w]);
      i = j;
      continue;
    }
    toks.push(["op", ch]);
    i++;
  }
  return toks;
}

const TOK_COLOR = {
  kw: { color: "#C792EA", fontWeight: 600 },
  str: { color: "#A8D8A0" },
  com: { color: "#8F86A3", fontStyle: "italic" }, // 旧 #7A7290 は 3.43:1(監査A6)。4.5:1 に調整
  num: { color: "#8AB4F8" },
  id: { color: "#ECEAF2" },
  op: { color: "#B8B2C8" },
};

const isCodey = (s) => !/[\u3040-\u30FF\u4E00-\u9FFF]/.test(s);

export { KW, tokenizeLine, TOK_COLOR, isCodey };
