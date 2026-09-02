import { memo } from "react";
import { hexA, lighten } from "../types";
import { HEADER_H, SUPER_H } from "../layout";

export interface SubHeadNodeData {
  block: string;
  label: string;
  color: string;
  width: number;
  count: number;
  dark: boolean;
  done: number;
  [key: string]: unknown;
}

// Заголовок под-колонки (технологии) внутри блока + лёгкая заливка под ним.
function SubHeadNodeImpl({ data }: { data: SubHeadNodeData }) {
  const { label, color, width, count, done, dark } = data;
  const fg = dark ? lighten(color, 0.6) : color;
  return (
    <div
      className="subhead"
      style={{
        width,
        height: HEADER_H,
        marginTop: SUPER_H,
        background: hexA(color, dark ? 0.16 : 0.1),
        color: fg,
        borderTop: `1px solid ${hexA(color, dark ? 0.45 : 0.22)}`,
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
