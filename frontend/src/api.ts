import type {
  Block,
  Candidate,
  Decision,
  Difficulty,
  GraphResponse,
  ImportResult,
  Interviewer,
  PoolConfig,
  Session,
  SessionMeta,
} from "./types";

// План интервью для POST /api/sessions: manual — nodeIds или все подходящие в порядке матрицы,
// auto — сэмплер по весам разделов (count вопросов).
export interface PlanIn {
  mode: "manual" | "auto";
  blocks?: string[];
  subblocks?: Record<string, string[]>;
  difficulties?: string[];
  count?: number;
  nodeIds?: string[];
  seed?: number;
}

// question-management: правка/создание вопроса банка (бэкенд пишет в БД, не в content/*.md).
export interface NodeUpdate {
  title?: string;
  difficulty?: Difficulty;
  question?: string;
  answer?: string;
}

export interface NodeCreate {
  pool: string;
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
  guest?: boolean; // вошёл по ссылке-приглашению: доступ только к одной сессии
  scope_session_id?: number | null;
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

// pool-blocks-editor: колонка направления из формы. id — только у существующих (сервер сохраняет
// их как есть), у новых id генерится из названия; weight из UI не правится.
export interface BlockDraft {
  uid?: string; // клиентский ключ ряда в редакторе; в запрос не попадает
  id?: string;
  label: string;
  color: string;
  subblocks?: { id?: string; label: string }[];
}

export const api = {
  pools: () => fetch(`${BASE}/pools`).then(json<PoolConfig[]>),
  // pool-crud: направления живут в БД; ровно одно из preset (существующее направление: колонки +
  // вопросы копируются) / blocks (свои колонки, без вопросов).
  createPool: (data: { label: string; description?: string; preset?: string; blocks?: BlockDraft[] }) =>
    fetch(`${BASE}/pools`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(json<PoolConfig>),
  // blocks: колонка вне списка удаляется вместе с вопросами, под-колонка — вопросы остаются в колонке.
  updatePool: (id: string, fields: { label?: string; description?: string; blocks?: BlockDraft[] }) =>
    fetch(`${BASE}/pools/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    }).then(json<PoolConfig>),
  deletePool: (id: string) =>
    fetch(`${BASE}/pools/${encodeURIComponent(id)}`, { method: "DELETE" }).then(
      json<{ deleted: string; nodes_removed: number; sessions_kept: number }>,
    ),
  graph: (pool: string) =>
    fetch(`${BASE}/graph?pool=${encodeURIComponent(pool)}`).then(json<GraphResponse>),
  // plan — набор вопросов сессии (см. SetupPage); без него сессия идёт по всей матрице.
  createSession: (pool: string, candidate: string, candidateId?: number, interviewerId?: number, plan?: PlanIn) =>
    fetch(`${BASE}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pool, candidate, candidateId, interviewerId, plan }),
    }).then(json<Session>),
  setScore: (sessionId: number, nodeId: string, score: number, note?: string) =>
    fetch(`${BASE}/sessions/${sessionId}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId, score, note }),
    }).then(json<Session>),
  getSession: (sessionId: number) =>
    fetch(`${BASE}/sessions/${sessionId}`).then(json<Session>),
  // Итог сессии: статус finished + решение и комментарий; повторный вызов правит итог.
  finishSession: (sessionId: number, data: { decision: Decision; summary?: string }) =>
    fetch(`${BASE}/sessions/${sessionId}/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(json<Session>),
  listSessions: (pool?: string) =>
    fetch(`${BASE}/sessions${pool ? `?pool=${encodeURIComponent(pool)}` : ""}`).then(json<SessionMeta[]>),
  importFile: (pool: string, filename: string, content: string) =>
    fetch(`${BASE}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pool, filename, content }),
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
  // Приглашение коллеги в сессию: ссылка #/join/<token>; гость входит без аккаунта.
  invite: (sessionId: number, role: "viewer" | "member") =>
    fetch(`${BASE}/sessions/${sessionId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    }).then(json<{ token: string; role: string; session_id: number; url: string }>),
  join: (token: string) =>
    fetch(`${BASE}/join/${encodeURIComponent(token)}`, { method: "POST", credentials: "include" }).then((res) =>
      json<{ session_id: number; pool: string; role: string }>(res, { skipAuthReload: true }),
    ),
};
