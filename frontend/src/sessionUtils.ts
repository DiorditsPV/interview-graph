import type { Session } from "./types";

// Снимок сессии с сервера → плоская карта оценок, которой оперирует UI.
export function scoresOf(s: { scores: Session["scores"] }): Record<string, number> {
  return Object.fromEntries(Object.entries(s.scores).map(([id, v]) => [id, v.score]));
}

// То же для заметок: они лежат в схеме оценок (score+note) и должны переживать
// перезагрузку/подключение к сессии, иначе выглядят как потерянные.
export function notesOf(s: { scores: Session["scores"] }): Record<string, string> {
  return Object.fromEntries(
    Object.entries(s.scores)
      .filter(([, v]) => v.note)
      .map(([id, v]) => [id, v.note as string]),
  );
}
