// 教材カタログとチートシートの横断検索ヘルパー。
// 教材本文チャンクを初期読込せず、軽量メタデータ(title / tag / kw / badge)と
// チートシート項目だけで高速に絞り込める純粋関数として保つ。

export function normalizeSearchText(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase();
}

export function tokenizeQuery(query) {
  const norm = normalizeSearchText(query).trim();
  if (!norm) return [];
  return norm.split(/\s+/).filter(Boolean);
}

export function lessonBadgeText(lesson, section) {
  if (lesson.num != null) {
    return String(lesson.num).padStart(2, "0");
  }
  return `${section?.mark || ""}${lesson.numInSection ?? ""}`;
}

export function filterLessonsByPath(lessons, pathSpec, progressDone = {}) {
  if (!pathSpec || pathSpec.id === "all" || !pathSpec.lessonIds) return lessons;
  if (pathSpec.lessonIds === "incomplete") {
    return lessons.filter((l) => (progressDone[l.id] || []).length < l.exCount);
  }
  const allow = new Set(pathSpec.lessonIds);
  return lessons.filter((l) => allow.has(l.id));
}

export function filterLessons(lessons, sections, query) {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return lessons;

  const sectionByDir = new Map(sections.map((sec) => [sec.dir, sec]));

  return lessons.filter((lesson) => {
    const sec = sectionByDir.get(lesson.section);
    const badge = lessonBadgeText(lesson, sec);
    const numAliases =
      lesson.num != null
        ? `${badge} ${lesson.num} l${lesson.num} lesson${lesson.num} レッスン${lesson.num}`
        : badge;
    const haystack = normalizeSearchText(
      [
        lesson.title,
        lesson.tag,
        lesson.id,
        lesson.kw || "",
        sec?.title || "",
        sec?.sub || "",
        numAliases,
      ].join(" ")
    );
    return tokens.every((tok) => haystack.includes(tok));
  });
}

export function filterCheats(cheats, group = "すべて", query = "") {
  const byGroup = group === "すべて" ? cheats : cheats.filter((card) => card.group === group);
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return byGroup;

  const results = [];
  for (const card of byGroup) {
    const headerText = normalizeSearchText(`${card.title} ${card.group}`);
    const headerMatchesAll = tokens.every((tok) => headerText.includes(tok));
    if (headerMatchesAll) {
      results.push(card);
      continue;
    }
    const matchingRows = card.rows.filter((row) => {
      const rowText = normalizeSearchText(`${card.title} ${card.group} ${row[0]} ${row[1]}`);
      return tokens.every((tok) => rowText.includes(tok));
    });
    if (matchingRows.length > 0) {
      results.push({ ...card, rows: matchingRows });
    }
  }
  return results;
}

export function countCheatRows(cards) {
  return cards.reduce((sum, card) => sum + card.rows.length, 0);
}

export function filterRosetta(items, group = "すべて", query = "") {
  const byGroup = group === "すべて" ? items : items.filter((item) => item.group === group);
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return byGroup;

  return byGroup.filter((item) => {
    const haystack = normalizeSearchText(
      [
        item.task,
        item.group,
        item.rCode,
        item.pyCode,
        item.juliaCode,
        item.pitfall,
        item.lessonTitle,
      ].join(" ")
    );
    return tokens.every((tok) => haystack.includes(tok));
  });
}
