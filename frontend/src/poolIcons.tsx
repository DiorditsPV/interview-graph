import { ChartNoAxesCombined, Database, FolderKanban, Workflow, type LucideIcon } from "lucide-react";

// Иконка и мягкий оттенок направления на главной (ТЗ «иконки в интерфейсе карточек»): известным
// пулам — подобранные по смыслу, остальным (созданным из UI) — общая иконка и оттенок по id,
// стабильный между перезагрузками. Все иконки — outline из Lucide, одна плотность штриха.
export type PoolTint = "blue" | "teal" | "violet" | "amber" | "slate";

const KNOWN: Record<string, { Icon: LucideIcon; tint: PoolTint }> = {
  "data-engineer": { Icon: Database, tint: "blue" },
  "data-engineer-x5": { Icon: Workflow, tint: "teal" },
  "system-analyst": { Icon: ChartNoAxesCombined, tint: "violet" },
};

const TINTS: PoolTint[] = ["blue", "teal", "violet", "amber", "slate"];

export function poolIcon(id: string): { Icon: LucideIcon; tint: PoolTint } {
  if (KNOWN[id]) return KNOWN[id];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { Icon: FolderKanban, tint: TINTS[h % TINTS.length] };
}
