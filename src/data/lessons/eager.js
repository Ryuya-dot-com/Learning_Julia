// 検証専用: 教材本文・演習をすべて読み込み、内容面の契約を横断検査する。
// 本番アプリからは import しないこと。index.js は選択レッスンだけを遅延読込する。
import { addLessonPositions } from "./registry.js";

const modules = import.meta.glob("./*/*.js", { eager: true });

export const LESSONS = addLessonPositions(
  Object.entries(modules).map(([path, module]) => ({
    ...module.default,
    path: path.slice(2),
  }))
);
