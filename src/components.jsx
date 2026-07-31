import { useState, useEffect, useRef } from "react";
import { C, MONO } from "./theme.js";
import { tokenizeLine, TOK_COLOR } from "./highlight.js";


/* ---------------- 小さな部品 ---------------- */

// 本文中の `code` をインラインコード表示にする
function T({ children }) {
  const parts = String(children).split("`");
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <code
            key={i}
            className="rounded px-1.5 py-0.5"
            style={{
              background: C.purpleSoft,
              color: C.purpleDeep,
              fontFamily: MONO,
              fontSize: "0.88em",
              margin: "0 1px",
            }}
          >
            {p}
          </code>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

function CodeBlock({ code, output, error }) {
  const lines = code.split("\n");
  return (
    <div className="my-4 overflow-hidden rounded-xl" style={{ border: "1px solid " + C.line }}>
      <div className="flex items-center gap-1.5 px-4 pt-3" style={{ background: C.night }}>
        <span className="h-2 w-2 rounded-full" style={{ background: C.red }} />
        <span className="h-2 w-2 rounded-full" style={{ background: C.green }} />
        <span className="h-2 w-2 rounded-full" style={{ background: C.purple }} />
        <span className="ml-2 text-xs font-semibold tracking-wide" style={{ color: "#8F86A3" }}>
          Julia
        </span>
      </div>
      <pre
        className="overflow-x-auto px-4 pb-4 pt-2 text-sm leading-7"
        style={{ background: C.night, fontFamily: MONO }}
      >
        {lines.map((ln, i) => (
          <div key={i}>
            {ln === ""
              ? "\u00A0"
              : tokenizeLine(ln).map((t, j) => (
                  <span key={j} style={TOK_COLOR[t[0]]}>
                    {t[1]}
                  </span>
                ))}
          </div>
        ))}
      </pre>
      {output != null && (
        <div className="px-4 py-3" style={{ background: "#FFFFFF", borderTop: "1px solid " + C.line }}>
          <div
            className="mb-1 text-xs font-bold tracking-wide"
            style={{ color: error ? C.red : C.greenText }}
          >
            ▶ 実行結果
          </div>
          <pre
            className="overflow-x-auto whitespace-pre-wrap text-sm leading-6"
            style={{ fontFamily: MONO, color: error ? C.red : C.ink }}
          >
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}

// Juliaの3色ドット(進捗のシグネチャ)
function TriDots({ filled = 3, size = 12 }) {
  const cols = [C.red, C.green, C.purple];
  return (
    <span className="inline-flex items-center" style={{ gap: size / 2 }}>
      {cols.map((col, i) => (
        <span
          key={i}
          className="rounded-full"
          style={{
            width: size,
            height: size,
            background: i < filled ? col : "transparent",
            border: "2px solid " + col,
            opacity: i < filled ? 1 : 0.4,
            transition: "background 0.3s, opacity 0.3s",
          }}
        />
      ))}
    </span>
  );
}

function Btn({ kind = "primary", className = "", style = {}, ...props }) {
  const base =
    "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-85 active:opacity-70 disabled:cursor-not-allowed disabled:opacity-40";
  const kinds = {
    primary: { background: C.purple, color: "#FFFFFF" },
    ghost: { background: "transparent", color: C.purple, border: "1.5px solid " + C.purple },
    quiet: { background: "#FFFFFF", color: C.sub, border: "1px solid " + C.line },
  };
  return <button className={base + " " + className} style={{ ...kinds[kind], ...style }} {...props} />;
}

function ResetButton({ onReset }) {
  // 確認状態は時間で勝手に解除しない(時間制限はWCAG違反——監査A15)。フォーカスが外れたら解除する
  const [arm, setArm] = useState(false);
  const hit = "inline-flex min-h-11 items-center px-2"; // タッチターゲット44px確保(監査A16)
  return arm ? (
    <button
      className={hit + " text-xs font-bold underline"}
      style={{ color: C.red }}
      onClick={onReset}
      onBlur={() => setArm(false)}
    >
      本当にリセットする(進みぐあいが消えます)
    </button>
  ) : (
    <button className={hit + " text-xs underline"} style={{ color: C.faint }} onClick={() => setArm(true)}>
      進みぐあいをリセット
    </button>
  );
}

const PRAISE = ["正解です!", "すばらしい!", "その調子です!", "バッチリです!"];

function Feedback({ status, why, hint, showHint, onHint }) {
  // 常設のライブリージョンで正誤を読み上げ環境へ伝える(監査A4)。
  // 正解時は操作していた要素がdisabledになりフォーカスが落ちるため、ここへ移す(監査A5)。
  // ただし「正解した瞬間」の遷移のみ。クリア済み問題は status="correct" で初期マウントされるため、
  // マウント時にも発火させるとページ送りのたびにフォーカスを奪ってしまう(検証で検出)
  const boxRef = useRef(null);
  const prevStatus = useRef(status);
  useEffect(() => {
    if (status === "correct" && prevStatus.current !== "correct" && boxRef.current) {
      boxRef.current.focus();
    }
    prevStatus.current = status;
  }, [status]);

  return (
    <div role="status" aria-live="polite" ref={boxRef} tabIndex={-1} className="focus:outline-none">
      {status === "correct" && (
        <div className="pop mt-4 rounded-xl p-4" style={{ background: C.greenSoft, border: "1px solid #BFE3B4" }}>
          <div className="mb-1.5 flex items-center gap-2 text-sm font-bold" style={{ color: C.greenText }}>
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full text-xs"
              style={{ background: C.greenText, color: "#FFFFFF" }}
            >
              ✓
            </span>
            {PRAISE[why.length % PRAISE.length]}
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "#2E5626" }}>
            <T>{why}</T>
          </p>
        </div>
      )}
      {status === "wrong" && (
        <div className="rise mt-4 rounded-xl p-4" style={{ background: "#FFF7E8", border: "1px solid #F1DFB8" }}>
          <div className="mb-1.5 text-sm font-bold" style={{ color: "#82590F" }}>
            おしい!もう一度考えてみましょう
          </div>
          {showHint ? (
            <p className="text-sm leading-relaxed" style={{ color: "#7A5A1A" }}>
              ヒント:<T>{hint}</T>
            </p>
          ) : (
            <button
              className="inline-flex min-h-11 items-center text-sm font-bold underline"
              style={{ color: "#82590F" }}
              onClick={onHint}
            >
              ヒントを見る
            </button>
          )}
        </div>
      )}
    </div>
  );
}
export { T, CodeBlock, TriDots, Btn, ResetButton, Feedback };
