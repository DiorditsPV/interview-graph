import type { Block, Difficulty, QNode } from "./types";

// Детерминированная swimlane-раскладка с под-блоками.
// Горизонталь: блоки (Фреймворки/Базы данных/Python/Платформа), причём блок может
// делиться на под-колонки по технологиям (Airflow/PySpark/dbt/Streaming).
// Вертикаль: выровненные по всем колонкам полосы сложности (junior→senior сверху вниз).

export const COL_W = 300;
export const CARD_W = 280;
export const CARD_H = 132;
export const VGAP = 22;
export const BAND_PAD = 24;
export const SUB_GUTTER = 28; // между под-колонками внутри блока
export const BLOCK_GUTTER = 84; // между блоками
export const SUPER_H = 40; // полоса заголовка блока
export const HEADER_H = 46; // полоса заголовка под-колонки (технологии)
export const LABEL_W = 120;
export const TOP_H = SUPER_H + HEADER_H;

export const BLOCK_ORDER: Block[] = ["frameworks", "databases", "python", "platform"];
export const DIFFS: Difficulty[] = ["base", "junior", "middle", "senior"];
export const DIFF_LABEL_FULL: Record<Difficulty, string> = {
  base: "BASE",
  junior: "JUNIOR",
  middle: "MIDDLE",
  senior: "SENIOR",
};

// Предпочтительный порядок под-блоков и их подписи.
const PREFERRED_SUB: Partial<Record<Block, string[]>> = {
  frameworks: ["airflow", "pyspark", "dbt", "streaming"],
  databases: ["sql", "engines"],
};
export const SUB_LABEL: Record<string, string> = {
  airflow: "Airflow",
  pyspark: "PySpark",
  dbt: "dbt",
  streaming: "Streaming",
  sql: "SQL",
  engines: "Движки и хранение",
};

export const subOf = (n: QNode): string => n.subblock || n.block;

export interface Column {
  block: Block;
  subblock: string;
  label: string | null; // подпись под-колонки (null = блок не делится → без под-хедера)
  x: number;
  width: number;
  height: number;
  count: number;
}
export interface BlockGroup {
  block: Block;
  x: number;
  width: number;
  height: number;
  label: string;
  split: boolean; // делится ли на под-колонки
}
export interface Band {
  difficulty: Difficulty;
  y: number;
  height: number;
  label: string;
}
export interface Placement {
  positions: Record<string, { x: number; y: number }>;
  columns: Column[];
  blockGroups: BlockGroup[];
  bands: Band[];
  width: number;
  height: number;
  order: string[][]; // упорядоченные id по колонкам (клавиатурная навигация)
  colOf: Record<string, number>;
  rowOf: Record<string, number>;
}

export function swimlaneLayout(nodes: QNode[]): Placement {
  const blocks: Block[] = [...BLOCK_ORDER];
  for (const n of nodes) if (!blocks.includes(n.block)) blocks.push(n.block);

  // Под-блоки каждого блока (в предпочтительном порядке + прочие).
  const subsByBlock: Record<string, string[]> = {};
  for (const b of blocks) {
    const present = Array.from(new Set(nodes.filter((n) => n.block === b).map(subOf)));
    const pref = PREFERRED_SUB[b] ?? [];
    const ordered = [
      ...pref.filter((s) => present.includes(s)),
      ...present.filter((s) => !pref.includes(s)).sort(),
    ];
    subsByBlock[b] = ordered.length ? ordered : [b];
  }

  // Группировка нод: (block, sub, difficulty).
  const cellNodes = (b: string, s: string, d: string) =>
    nodes
      .filter((n) => n.block === b && subOf(n) === s && n.difficulty === d)
      .sort((a, c) => a.topic.localeCompare(c.topic) || a.id.localeCompare(c.id));

  // Высота полос сложности — по самой плотной (block×sub×difficulty) ячейке.
  const bandRows: Record<string, number> = {};
  for (const d of DIFFS) {
    let mx = 1;
    for (const b of blocks) for (const s of subsByBlock[b]) mx = Math.max(mx, cellNodes(b, s, d).length);
    bandRows[d] = mx;
  }
  const bandHeight: Record<string, number> = {};
  const bandTop: Record<string, number> = {};
  let yCur = TOP_H;
  for (const d of DIFFS) {
    bandHeight[d] = bandRows[d] * (CARD_H + VGAP) - VGAP + 2 * BAND_PAD;
    bandTop[d] = yCur;
    yCur += bandHeight[d];
  }
  const totalHeight = yCur;

  const positions: Record<string, { x: number; y: number }> = {};
  const columns: Column[] = [];
  const blockGroups: BlockGroup[] = [];
  const order: string[][] = [];
  const colOf: Record<string, number> = {};
  const rowOf: Record<string, number> = {};

  let xCur = 0;
  blocks.forEach((block, bi) => {
    const subs = subsByBlock[block];
    const split = subs.length > 1 || subs[0] !== block;
    const blockStartX = xCur;

    subs.forEach((sub, si) => {
      const colX = xCur;
      const cardX = colX + (COL_W - CARD_W) / 2;
      const ordered: string[] = [];
      for (const d of DIFFS) {
        cellNodes(block, sub, d).forEach((n, row) => {
          positions[n.id] = { x: cardX, y: bandTop[d] + BAND_PAD + row * (CARD_H + VGAP) };
          ordered.push(n.id);
        });
      }
      const colIndex = columns.length;
      ordered.forEach((id, idx) => {
        colOf[id] = colIndex;
        rowOf[id] = idx;
      });
      order.push(ordered);
      columns.push({
        block,
        subblock: sub,
        label: split ? SUB_LABEL[sub] ?? sub : null,
        x: colX,
        width: COL_W,
        height: totalHeight,
        count: ordered.length,
      });
      xCur += COL_W;
      if (si < subs.length - 1) xCur += SUB_GUTTER;
    });

    blockGroups.push({
      block,
      x: blockStartX,
      width: xCur - blockStartX,
      height: totalHeight,
      label: "",
      split,
    });
    if (bi < blocks.length - 1) xCur += BLOCK_GUTTER;
  });

  const totalWidth = xCur;
  const bands: Band[] = DIFFS.map((d) => ({
    difficulty: d,
    y: bandTop[d],
    height: bandHeight[d],
    label: DIFF_LABEL_FULL[d],
  }));

  return { positions, columns, blockGroups, bands, width: totalWidth, height: totalHeight, order, colOf, rowOf };
}
