import { Fragment, memo } from "react";
import type { Band, Column } from "../layout";

export interface GuidesNodeData {
  columns: Column[];
  bands: Band[];
  width: number;
  height: number;
  guidesH: boolean;
  guidesV: boolean;
  [key: string]: unknown;
}

// Переключаемые направляющие: горизонтальные — по полосам сложности (Base/Junior/…),
// вертикальные — по границам КАЖДОЙ под-колонки внутри блока. Только линии; подписи дают оси/заголовки.
function GuidesNodeImpl({ data }: { data: GuidesNodeData }) {
  const { columns, bands, width, height, guidesH, guidesV } = data;
  return (
    <div className="guides" style={{ width, height }}>
      {guidesH &&
        bands.map((b) => (
          <div key={`h-${b.difficulty}`} className="guides__h" style={{ top: b.y, width }} />
        ))}
      {guidesH && bands.length > 0 && <div className="guides__h" style={{ top: height, width }} />}

      {guidesV &&
        columns.map((c) => (
          <Fragment key={`v-${c.block}-${c.subblock}`}>
            <div className="guides__v" style={{ left: c.x, height }} />
            <div className="guides__v" style={{ left: c.x + c.width, height }} />
          </Fragment>
        ))}
    </div>
  );
}

export const GuidesNode = memo(GuidesNodeImpl);
