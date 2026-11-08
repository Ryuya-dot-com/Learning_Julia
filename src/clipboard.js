// コードブロックの1クリックコピー補助。
// REPL例示の `julia> ` / `pkg> ` / `(@v1.12) pkg> ` プロンプトを自動除去し、
// 穴埋め問題の空欄 `〔?〕` やディレクトリ木構造はコピー対象外と判定する。

const PROMPT_LINE_RE = /^(?:\([^)\n]+\)\s*)?(?:julia|pkg|shell|help\?)>(?:\s?(.*))?$/;
const TREE_DRAWING_RE = /[├└]─/;

export function isCopyableCode(raw) {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed.includes("〔?〕")) return false;
  if (TREE_DRAWING_RE.test(trimmed)) return false;
  return true;
}

export function hasReplPrompt(raw) {
  if (typeof raw !== "string") return false;
  return raw.split("\n").some((line) => PROMPT_LINE_RE.test(line));
}

export function extractCopyableCode(raw) {
  const text = String(raw ?? "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  if (!lines.some((line) => PROMPT_LINE_RE.test(line))) {
    return text.trimEnd();
  }

  // コメント行や通常のシェル行を含まない純REPLトランスクリプト(例: `julia> 1 + 1\n2`)では、
  // プロンプト幅(例: `julia> ` の7文字)以上のインデントを持つ継続行だけを残し、REPL出力行を除外する。
  const nonEmpty = lines.filter((l) => l.trim() !== "");
  const hasComment = nonEmpty.some((l) => l.trimStart().startsWith("#"));
  const startsWithPrompt = nonEmpty.length > 0 && PROMPT_LINE_RE.test(nonEmpty[0]);

  const out = [];
  let promptIndent = 0;
  for (const line of lines) {
    const m = line.match(PROMPT_LINE_RE);
    if (m) {
      const rest = m[1] ?? "";
      promptIndent = Math.max(2, line.length - rest.length);
      out.push(rest);
    } else if (line.trim() === "") {
      if (hasComment || !startsWithPrompt) {
        out.push("");
      }
      promptIndent = 0;
    } else if (!hasComment && startsWithPrompt) {
      const pad = promptIndent > 0 ? " ".repeat(promptIndent) : null;
      if (pad && line.startsWith(pad)) {
        out.push(line.slice(promptIndent));
      } else {
        promptIndent = 0;
      }
    } else {
      out.push(line);
    }
  }

  return out.join("\n").trimEnd();
}

export async function copyTextToClipboard(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard API が権限等で拒否された場合は textarea フォールバックへ進む
    }
  }
  if (typeof document === "undefined") return false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
