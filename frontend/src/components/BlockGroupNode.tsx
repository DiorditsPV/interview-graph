import { memo } from "react";
import { BLOCK_COLOR, BLOCK_LABEL, hexA, lighten, type Block } from "../types";
import { SUPER_H } from "../layout";

export interface BlockGroupNodeData {
  block: Block;
  width: number;
  height: number;
  count: number;
  done: number;
  split: boolean;
  dark: boolean;
  [key: string]: unknown;
}

// Фон всего блока (на всю группу под-колонок) + верхний заголовок направления.
function BlockGroupNodeImpl({ data }: { data: BlockGroupNodeData }) {
  const { block, width, height, count, done, split, dark } = data;
  const color = BLOCK_COLOR[block];
  const label = dark ? lighten(color, 0.45) : color;
  return (
    <div
      className="bgroup"
      style={{
        width,
        height,
        background: hexA(color, dark ? 0.07 : 0.1),
        border: `1px solid ${hexA(color, dark ? 0.28 : 0.2)}`,
      }}
    >
      <div
        className="bgroup__header"
        style={{ height: SUPER_H, background: hexA(color, dark ? 0.12 : 0.16), color: label }}
      >
        <span className="bgroup__name">{BLOCK_LABEL[block]}</span>
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
