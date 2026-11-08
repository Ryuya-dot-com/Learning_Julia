// URLハッシュと画面状態(home / cheat / toolkit / lesson)の相互変換。
// スキップリンク(#main-content)は画面遷移ではないため null を返して無視する。

export function parseHashRoute(hash, lessons) {
  const raw = String(hash || "").replace(/^#/, "").trim();
  if (!raw) return { name: "home" };
  if (raw === "main-content") return null;
  if (raw === "cheat") return { name: "cheat" };
  if (raw === "why-julia" || raw === "toolkit/why") return { name: "toolkit", tab: "why" };
  if (raw === "toolkit" || raw === "toolkit/rosetta") return { name: "toolkit", tab: "rosetta" };
  if (raw === "toolkit/recipes") return { name: "toolkit", tab: "recipes" };

  const parts = raw.split("/");
  if (parts[0] === "lesson" && parts[1]) {
    let id = "";
    try {
      id = decodeURIComponent(parts[1]);
    } catch {
      return { name: "home" };
    }
    if (!Array.isArray(lessons) || !lessons.some((l) => l.id === id)) {
      return { name: "home" };
    }
    const rawStep = parts[2];
    const step = rawStep && /^[1-9]\d*$/.test(rawStep) ? Number(rawStep) : 1;
    return { name: "lesson", id, step };
  }
  return { name: "home" };
}

export function formatHashRoute(view) {
  if (!view || view.name === "home") return "";
  if (view.name === "cheat") return "#cheat";
  if (view.name === "toolkit") {
    if (view.tab === "why") return "#why-julia";
    return view.tab === "recipes" ? "#toolkit/recipes" : "#toolkit";
  }
  if (view.name === "lesson" && view.id) {
    const step = Number.isInteger(view.step) && view.step > 1 ? `/${view.step}` : "";
    return `#lesson/${encodeURIComponent(view.id)}${step}`;
  }
  return "";
}
