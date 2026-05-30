import { memo } from "react";
import { DIFF_COLOR, hexA, type Difficulty } from "../types";
import type { Band } from "../layout";

export interface BandsNodeData {
  bands: Band[];
  width: number;
  labelW: number;
  height: number;
  [key: string]: unknown;
}

// Левая ось сложности (junior→senior сверху вниз). Горизонтальные разделители полос
// вынесены в GuidesNode (переключаемые направляющие).
function BandsNodeImpl({ data }: { data: BandsNodeData }) {
  const { bands, width, labelW, height } = data;
  return (
    <div className="bands" style={{ width: labelW + width, height }}>
      {bands.map((b) => {
        const color = DIFF_COLOR[b.difficulty as Difficulty];
        return (
          <div
            key={b.difficulty}
            className="bands__label"
            style={{ top: b.y, height: b.height, width: labelW, color, background: hexA(color, 0.1) }}
          >
            <span>{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export const BandsNode = memo(BandsNodeImpl);
