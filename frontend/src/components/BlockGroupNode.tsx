import { memo } from "react";
import { BLOCK_COLOR, BLOCK_LABEL, hexA, type Block } from "../types";
import { SUPER_H } from "../layout";

export interface BlockGroupNodeData {
  block: Block;
  width: number;
  height: number;
  count: number;
  done: number;
  split: boolean;
  [key: string]: unknown;
}

// Фон всего блока (на всю группу под-колонок) + верхний заголовок направления.
function BlockGroupNodeImpl({ data }: { data: BlockGroupNodeData }) {
  const { block, width, height, count, done, split } = data;
  const color = BLOCK_COLOR[block];
  return (
    <div
      className="bgroup"
      style={{ width, height, background: hexA(color, 0.1), border: `1px solid ${hexA(color, 0.2)}` }}
    >
      <div
        className="bgroup__header"
        style={{ height: SUPER_H, background: hexA(color, 0.16), color }}
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
