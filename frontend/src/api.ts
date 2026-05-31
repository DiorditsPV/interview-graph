import type {
  Block,
  Comparison,
  Difficulty,
  GraphResponse,
  ImportResult,
  Session,
  SessionMeta,
  Track,
} from "./types";

// question-management: правка/создание вопроса банка (бэкенд пишет в БД, не в content/*.md).
export interface NodeUpdate {
  title?: string;
  difficulty?: Difficulty;
  question?: string;
  answer?: string;
}

export interface NodeCreate {
  block: Block;
  topic: string;
  difficulty: Difficulty;
  kind: "question" | "task";
  title?: string;
  question: string;
  answer: string;
  tags: string[];
}

// В dev /api проксируется Vite на :8000; в прод тот же origin (раздаёт FastAPI).
const BASE = "/api";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  graph: () => fetch(`${BASE}/graph`).then(json<GraphResponse>),
  weights: () => fetch(`${BASE}/weights`).then(json<Record<string, number>>),
  tracks: () => fetch(`${BASE}/tracks`).then(json<Track[]>),
  createSession: (candidate: string) =>
    fetch(`${BASE}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate }),
    }).then(json<Session>),
  setScore: (sessionId: number, nodeId: string, score: number, note?: string) =>
    fetch(`${BASE}/sessions/${sessionId}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId, score, note }),
    }).then(json<Session>),
  getSession: (sessionId: number) =>
    fetch(`${BASE}/sessions/${sessionId}`).then(json<Session>),
  listSessions: () => fetch(`${BASE}/sessions`).then(json<SessionMeta[]>),
  compareSessions: (ids: number[]) =>
    fetch(`${BASE}/sessions/compare?ids=${ids.join(",")}`).then(json<Comparison>),
  importFile: (filename: string, content: string) =>
    fetch(`${BASE}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, content }),
    }).then(json<ImportResult>),
  eventsUrl: (sessionId: number) => `${BASE}/sessions/${sessionId}/events`,
  // question-management CRUD банка вопросов (источник правды — БД на бэкенде).
  createNode: (data: NodeCreate) =>
    fetch(`${BASE}/nodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(json<{ id: string; block: string; title: string }>),
  updateNode: (id: string, fields: NodeUpdate) =>
    fetch(`${BASE}/nodes/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    }).then(json<{ updated: string }>),
  deleteNode: (id: string) =>
    fetch(`${BASE}/nodes/${encodeURIComponent(id)}`, { method: "DELETE" }).then(
      json<{ deleted: string }>,
    ),
};
