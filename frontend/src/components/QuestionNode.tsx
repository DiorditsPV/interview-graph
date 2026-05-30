import { type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { BLOCK_COLOR, type QNode } from "../types";

export interface QuestionNodeData {
  node: QNode;
  score?: number;
  current?: boolean;
  dimmed?: boolean;
  hidden?: boolean;
  [key: string]: unknown;
}

// Компактная карточка: короткий заголовок (title) вместо полного текста вопроса —
// полный текст/код живёт в drawer. Теги показываем чипами.
function QuestionNodeImpl({ data, selected }: NodeProps) {
  const { node, score, current, dimmed, hidden } = data as QuestionNodeData;
  const color = BLOCK_COLOR[node.block];
  const isTask = node.kind === "task";
  const heading = node.title || node.question;

  return (
    <div
      className={[
        "qnode",
        selected ? "qnode--selected" : "",
        current ? "qnode--current" : "",
        score != null ? "qnode--scored" : "",
        dimmed ? "qnode--dimmed" : "",
        hidden ? "qnode--hidden" : "",
      ].join(" ")}
      style={{ borderTopColor: color }}
      title={node.question}
    >
      <div className="qnode__head">
        <span className="qnode__kind">
          {hidden ? "🙈 " : ""}
          {isTask ? "🛠 задача" : "❓ вопрос"}
        </span>
        <span className="qnode__diff" data-diff={node.difficulty}>
          {node.difficulty}
        </span>
      </div>

      <div className="qnode__title">{heading}</div>

      {node.tags.length > 0 && (
        <div className="qnode__tags">
          {node.tags.slice(0, 4).map((t) => (
            <span key={t} className="tagchip">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="qnode__foot">
        <span className="qnode__topic" style={{ background: color }}>
          {node.topic}
        </span>
        <span className="qnode__score">
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={score != null && i <= score ? "star star--on" : "star"}>
              ●
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

export const QuestionNode = memo(QuestionNodeImpl);
