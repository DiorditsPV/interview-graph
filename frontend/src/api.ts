import type { GraphResponse, Session, SessionSummary, Track } from "./types";

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
  listSessions: () => fetch(`${BASE}/sessions`).then(json<SessionSummary[]>),
};
