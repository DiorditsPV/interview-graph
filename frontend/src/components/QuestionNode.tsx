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
        <span className={`qnode__kind ${isTask ? "qnode__kind--task" : ""}`}>
          {hidden ? "скрыт · " : ""}
          {isTask ? "задача" : "вопрос"}
        </span>
        <span className="qnode__diff" data-diff={node.difficulty}>
          {node.difficulty}
        </span>
      </div>

      <div className="qnode__title">{heading}</div>

      {node.tags.length > 0 && (
        <div className="qnode__tags">
          {node.tags.slice(0, 2).map((t) => (
            <span key={t} className="tagchip">
              {t}
            </span>
          ))}
          {node.tags.length > 2 && (
            <span className="tagchip tagchip--more">+{node.tags.length - 2}</span>
          )}
        </div>
      )}

      <div className="qnode__foot">
        <span className="qnode__topic" style={{ background: color }}>
          {node.topic}
        </span>
        {/* Балл цифрой, а не пятью точками: на масштабе «вся доска» точки нечитаемы,
            а оценённость карточки — главный сигнал во время интервью. */}
        {score != null ? (
          <span className="qnode__grade" data-band={score >= 4 ? "high" : score === 3 ? "mid" : "low"}>
            {score}/5
          </span>
        ) : (
          <span className="qnode__grade qnode__grade--empty">—</span>
        )}
      </div>
    </div>
  );
}

export const QuestionNode = memo(QuestionNodeImpl);
