// Типы соответствуют ответу бэкенда (FastAPI сериализует по alias → camelCase).

// Блок — строка: таксономию задаёт pool.yaml пула (см. PoolConfig), а не union-тип.
export type Block = string;
export type Difficulty = "base" | "junior" | "middle" | "senior";
export type Kind = "question" | "task";

export interface QNode {
  id: string;
  kind: Kind;
  pool: string;
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

// Пул направления — зеркало content/<pool>/pool.yaml (GET /api/pools).
export interface SubblockCfg {
  id: string;
  label: string;
}
export interface BlockCfg {
  id: string;
  label: string;
  color: string; // семантический цвет блока (600-ряд)
  weight: number;
  subblocks: SubblockCfg[];
}
export interface PoolConfig {
  id: string;
  label: string;
  description: string;
  blocks: BlockCfg[];
  counts?: { nodes: number; sessions: number };
}

const FALLBACK_COLOR = "#64748b";

export function blockOrder(pool: PoolConfig): string[] {
  return pool.blocks.map((b) => b.id);
}
export function blockLabel(pool: PoolConfig, block: string): string {
  return pool.blocks.find((b) => b.id === block)?.label ?? block;
}
export function blockColor(pool: PoolConfig, block: string): string {
  return pool.blocks.find((b) => b.id === block)?.color ?? FALLBACK_COLOR;
}
export function subLabel(pool: PoolConfig, block: string, sub: string): string {
  return pool.blocks.find((b) => b.id === block)?.subblocks.find((s) => s.id === sub)?.label ?? sub;
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

// План интервью (sessions.plan): условия подбора и итоговый порядок вопросов. null — сессия по всей матрице.
export interface SessionPlan {
  mode: "manual" | "auto";
  blocks?: string[] | null;
  subblocks?: Record<string, string[]> | null;
  difficulties?: string[] | null;
  count: number;
  order: string[];
}

export interface SessionMeta {
  id: number;
  candidate: string;
  pool: string;
  candidate_id?: number | null;
  interviewer_id?: number | null;
  created_at: string;
  plan_count?: number | null; // в списках вместо самого плана
  // Итог сессии: active → finished с решением и комментарием интервьюера.
  status?: "active" | "finished";
  decision?: Decision | null;
  summary?: string | null;
  finished_at?: string | null;
}

export type Decision = "hire" | "no_hire" | "hold";

export interface Session extends SessionMeta {
  plan?: SessionPlan | null;
  scores: Record<string, { node_id: string; score: number; note?: string; created_at: string }>;
}

// Сессия без оценок — для списков (GET /api/sessions возвращает SELECT * без scores).
export interface SessionSummary {
  id: number;
  candidate: string;
  pool: string;
  candidate_id?: number | null;
  interviewer_id?: number | null;
  created_at: string;
}

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

// Относительная яркость sRGB (WCAG 2.x); контраст с белым = 1.05 / (L + 0.05).
function relLuminance(r: number, g: number, b: number): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** Цвет плашки заголовка блока: затемняем цвет блока (от 0.15 шагом 0.05), пока белый текст
 *  не даст ≥ 4.5:1 (WCAG AA). Синему/фиолетовому хватает 0.15 (700-ряд), зелёному/янтарному
 *  нужно 0.2 — так плашка держит AA для любых цветов из pool.yaml. */
export function plateColor(hex: string): string {
  const h = hex.replace("#", "");
  const base = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  for (let amount = 0.15; amount <= 0.61; amount += 0.05) {
    const [r, g, b] = base.map((c) => Math.round(c * (1 - amount)));
    if (1.05 / (relLuminance(r, g, b) + 0.05) >= 4.5) return `rgb(${r}, ${g}, ${b})`;
  }
  return "#000";
}

export function hexA(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
