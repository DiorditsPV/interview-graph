import type {
  Block,
  Candidate,
  Comparison,
  Difficulty,
  GraphResponse,
  ImportResult,
  Interviewer,
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

// auth-identity (#36): пользователь сессии (без password_hash).
export interface AuthUser {
  id: string;
  email: string;
  role: "owner" | "member" | "viewer";
  tenant_id: string;
}

// В dev /api проксируется Vite на :8000; в прод тот же origin (раздаёт FastAPI).
const BASE = "/api";

// auth-hardening (#40): 401 в середине сессии (протухла/инвалидирована) → перезагрузка,
// AuthGate заново покажет логин. skipAuthReload — для auth-проб (login/me), которые сами
// штатно отдают 401 (неверный пароль / нет сессии): без исключения была бы петля релоадов.
async function json<T>(res: Response, opts?: { skipAuthReload?: boolean }): Promise<T> {
  if (res.status === 401 && !opts?.skipAuthReload) {
    window.location.reload();
    throw new Error("session expired");
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  graph: () => fetch(`${BASE}/graph`).then(json<GraphResponse>),
  weights: () => fetch(`${BASE}/weights`).then(json<Record<string, number>>),
  tracks: () => fetch(`${BASE}/tracks`).then(json<Track[]>),
  createSession: (candidate: string, candidateId?: number, interviewerId?: number) =>
    fetch(`${BASE}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate, candidateId, interviewerId }),
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
  // people-schema: кандидаты и интервьюеры (сущности БD, per-tenant на бэкенде).
  listCandidates: () => fetch(`${BASE}/candidates`).then(json<Candidate[]>),
  createCandidate: (data: {
    name: string;
    position?: string;
    seniority?: string;
    contact?: string;
    note?: string;
  }) =>
    fetch(`${BASE}/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(json<Candidate>),
  updateCandidate: (id: number, fields: Partial<Omit<Candidate, "id">>) =>
    fetch(`${BASE}/candidates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    }).then(json<Candidate>),
  listInterviewers: () => fetch(`${BASE}/interviewers`).then(json<Interviewer[]>),
  createInterviewer: (data: { name: string; email?: string; role?: string }) =>
    fetch(`${BASE}/interviewers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(json<Interviewer>),
  // auth-identity (#36): server-side сессия в HttpOnly-cookie. credentials:"include" —
  // чтобы cookie слалась и в dev (Vite-прокси), и в прод (тот же origin).
  login: (email: string, password: string) =>
    fetch(`${BASE}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then((res) => json<AuthUser>(res, { skipAuthReload: true })),
  logout: () =>
    fetch(`${BASE}/auth/logout`, { method: "POST", credentials: "include" }).then(
      json<{ ok: boolean }>,
    ),
  me: () =>
    fetch(`${BASE}/auth/me`, { credentials: "include" }).then((res) =>
      json<AuthUser>(res, { skipAuthReload: true }),
    ),
};
