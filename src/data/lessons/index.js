// ホームと目次には軽量カタログだけを同期読込し、教材本文は選択時に取得する。
// これにより、教材の増加が初期JavaScriptの大きさへ直結しない。
import { LESSON_CATALOG } from "./catalog.js";
import { addLessonPositions } from "./registry.js";

const lessonModules = import.meta.glob("./*/*.js");
const cache = new Map();

export const LESSONS = addLessonPositions(LESSON_CATALOG);

export function loadLesson(id) {
  const meta = LESSONS.find((lesson) => lesson.id === id);
  if (!meta) return Promise.reject(new Error(`Unknown lesson id: ${id}`));
  if (cache.has(id)) return cache.get(id);

  const loader = lessonModules[`./${meta.path}`];
  if (!loader) return Promise.reject(new Error(`Lesson module is missing: ${meta.path}`));

  const promise = loader()
    .then((module) => {
      const lesson = module.default;
      const stale =
        lesson.id !== meta.id ||
        lesson.title !== meta.title ||
        lesson.tag !== meta.tag ||
        lesson.ex.length !== meta.exCount;
      if (stale) throw new Error(`Lesson catalog is stale: ${meta.path}`);
      return { ...lesson, section: meta.section, num: meta.num, numInSection: meta.numInSection };
    })
    .catch((error) => {
      // 一時的なchunk取得失敗を永続キャッシュせず、再読込で再試行できるようにする。
      cache.delete(id);
      throw error;
    });

  cache.set(id, promise);
  return promise;
}
