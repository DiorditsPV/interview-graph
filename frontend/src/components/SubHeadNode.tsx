import { memo } from "react";
import { BLOCK_COLOR, hexA, type Block } from "../types";
import { HEADER_H, SUPER_H } from "../layout";

export interface SubHeadNodeData {
  block: Block;
  label: string;
  width: number;
  count: number;
  done: number;
  [key: string]: unknown;
}

// Заголовок под-колонки (технологии) внутри блока + лёгкая заливка под ним.
function SubHeadNodeImpl({ data }: { data: SubHeadNodeData }) {
  const { block, label, width, count, done } = data;
  const color = BLOCK_COLOR[block];
  return (
    <div
      className="subhead"
      style={{
        width,
        height: HEADER_H,
        marginTop: SUPER_H,
        background: hexA(color, 0.1),
        color,
        borderTop: `1px solid ${hexA(color, 0.22)}`,
      }}
    >
      <span className="subhead__name">{label}</span>
      <span className="subhead__count">
        {done}/{count}
      </span>
    </div>
  );
}

export const SubHeadNode = memo(SubHeadNodeImpl);
