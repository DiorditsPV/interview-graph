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

export interface Session {
  id: number;
  candidate: string;
  created_at: string;
  scores: Record<string, { node_id: string; score: number; note?: string; created_at: string }>;
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
export function hexA(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
