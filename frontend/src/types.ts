// Типы соответствуют ответу бэкенда (FastAPI сериализует по alias → camelCase).

export type Block = "frameworks" | "databases" | "python" | "platform";
export type Difficulty = "base" | "junior" | "middle" | "senior";
export type Kind = "question" | "task";

export interface QNode {
  id: string;
  kind: Kind;
  block: Block;
  subblock?: string | null;
  topic: string;
  title?: string | null;
  difficulty: Difficulty;
  weight: number;
  question: string;
  answer: string;
  starterCode?: string | null;
  rubric: string[];
  tags: string[];
}

export interface ImportErr {
  file: string;
  error: string;
}

// Направление интервью (трек/роль) — профиль-охват над block/subblock.
export interface Track {
  id: string;
  label: string;
  include: string[];
}

// Нода входит в трек: include пуст ИЛИ совпал block / "block/subblock".
export function nodeInTrack(n: QNode, include: string[]): boolean {
  if (!include.length) return true;
  if (include.includes(n.block)) return true;
  return !!n.subblock && include.includes(`${n.block}/${n.subblock}`);
}

export interface GraphResponse {
  nodes: QNode[];
  errors: ImportErr[];
}

// Результат загрузки файла вопросов (POST /api/import).
export interface ImportAdded {
  id: string;
  block: Block;
  title: string;
  path: string;
}
export interface ImportResult {
  added: ImportAdded[];
  errors: ImportErr[];
}

// Кандидат/специалист (people-schema) — запись в БД, история сессий по candidate_id.
export interface Candidate {
  id: number;
  tenant_id?: string;
  name: string;
  position?: string | null;
  seniority?: string | null;
  contact?: string | null;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

// Интервьюер (кто проводит). user_id — шов к auth-пользователю (пока null).
export interface Interviewer {
  id: number;
  tenant_id?: string;
  name: string;
  email?: string | null;
  role?: string | null;
  user_id?: string | null;
  created_at?: string;
}

export interface SessionMeta {
  id: number;
  candidate: string;
  candidate_id?: number | null;
  interviewer_id?: number | null;
  created_at: string;
}

export interface Session extends SessionMeta {
  scores: Record<string, { node_id: string; score: number; note?: string; created_at: string }>;
}

// Сессия без оценок — для списков (GET /api/sessions возвращает SELECT * без scores).
export interface SessionSummary {
  id: number;
  candidate: string;
  candidate_id?: number | null;
  interviewer_id?: number | null;
  created_at: string;
}

export const BLOCK_LABEL: Record<Block, string> = {
  frameworks: "Фреймворки",
  databases: "Базы данных",
  python: "Python",
  platform: "Платформа",
};

export const BLOCK_COLOR: Record<Block, string> = {
  frameworks: "#2563eb",
  databases: "#16a34a",
  python: "#d97706",
  platform: "#9333ea",
};

export const DIFF_LABEL: Record<Difficulty, string> = {
  base: "base",
  junior: "junior",
  middle: "middle",
  senior: "senior",
};

export const DIFF_COLOR: Record<Difficulty, string> = {
  base: "#1e40af",
  junior: "#166534",
  middle: "#854d0e",
  senior: "#991b1b",
};

// rgba из hex-цвета с заданной прозрачностью (для полупрозрачных дорожек).
// Осветлить цвет блока для тёмной темы: синий/фиолетовый на тёмном фоне иначе
// сливаются с подложкой, и заголовки колонок перестают читаться.
export function lighten(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix(parseInt(h.slice(0, 2), 16));
  const g = mix(parseInt(h.slice(2, 4), 16));
  const b = mix(parseInt(h.slice(4, 6), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

export function hexA(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
