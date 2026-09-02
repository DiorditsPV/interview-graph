import { memo } from "react";
import { hexA, lighten, plateColor } from "../types";
import { SUPER_H } from "../layout";

export interface BlockGroupNodeData {
  block: string;
  label: string;
  color: string;
  width: number;
  height: number;
  count: number;
  done: number;
  split: boolean;
  dark: boolean;
  [key: string]: unknown;
}

// Тёмная тема: подложки выровнены по фактическому контрасту к канве (~1.3) — у синего
// и фиолетового низкая светимость, им нужна большая альфа, чем у зелёного и янтарного.
const DARK_ZONE_ALPHA: Record<string, number> = {
  frameworks: 0.28,
  databases: 0.22,
  python: 0.22,
  platform: 0.3,
};

// Фон всего блока (на всю группу под-колонок) + верхний заголовок направления.
function BlockGroupNodeImpl({ data }: { data: BlockGroupNodeData }) {
  const { block, label: blockLabel, color, width, height, count, done, split, dark } = data;
  const fg = dark ? lighten(color, 0.45) : color;
  return (
    <div
      className="bgroup"
      style={{
        width,
        height,
        background: hexA(color, dark ? DARK_ZONE_ALPHA[block] ?? 0.24 : 0.1),
        border: `1px solid ${hexA(color, dark ? 0.45 : 0.2)}`,
      }}
    >
      <div
        className="bgroup__header"
        data-block={block}
        style={{
          height: SUPER_H,
          background: hexA(color, dark ? 0.12 : 0.16),
          color: fg,
          // плашка 37/тёмной темы: затемнение цвета блока до контраста белого ≥ 4.5:1 (design-themes.css → var(--plate))
          ["--plate" as string]: plateColor(color),
        }}
      >
        <span className="bgroup__name">{blockLabel}</span>
        {!split && (
          <span className="bgroup__count">
            {done}/{count}
          </span>
        )}
      </div>
    </div>
  );
}

export const BlockGroupNode = memo(BlockGroupNodeImpl);
