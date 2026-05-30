import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { BLOCK_COLOR, BLOCK_LABEL, type Difficulty, type QNode } from "../types";
import type { NodeUpdate } from "../api";

interface Props {
  node: QNode | null;
  score?: number;
  fullscreen: boolean;
  hidden: boolean;
  onToggleHide: (nodeId: string) => void;
  onScore: (nodeId: string, score: number) => void;
  onDelete: (nodeId: string) => void;
  onUpdate: (nodeId: string, fields: NodeUpdate) => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
}

const DIFF_OPTS: Difficulty[] = ["base", "junior", "middle", "senior"];

// Немодальный drawer: полный текст вопроса/ответа. Закрывается с клавиатуры (Esc).
export function DetailDrawer({ node, score, fullscreen, hidden, onToggleHide, onScore, onDelete, onUpdate, onToggleFullscreen, onClose }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ title: string; difficulty: Difficulty; question: string; answer: string }>(
    { title: "", difficulty: "middle", question: "", answer: "" },
  );

  // Сброс режима правки при переключении на другой вопрос.
  useEffect(() => setEditing(false), [node?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editing) setEditing(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, editing]);

  if (!node) return null;
  const color = BLOCK_COLOR[node.block];

  const startEdit = () => {
    setDraft({ title: node.title ?? "", difficulty: node.difficulty, question: node.question, answer: node.answer });
    setEditing(true);
  };
  const saveEdit = () => {
    onUpdate(node.id, {
      title: draft.title.trim() || undefined,
      difficulty: draft.difficulty,
      question: draft.question,
      answer: draft.answer,
    });
    setEditing(false);
  };

  return (
    <aside
      className={`drawer ${fullscreen ? "drawer--full" : ""}`}
      role="dialog"
      aria-label="Детали вопроса"
      aria-modal="false"
      tabIndex={-1}
    >
      <header className="drawer__bar" style={{ borderTopColor: color }}>
        <span className="drawer__badge" style={{ background: color }}>
          {BLOCK_LABEL[node.block]} · {node.topic}
        </span>
        <span className="drawer__diff" data-diff={node.difficulty}>
          {node.kind === "task" ? "🛠 задача" : "❓ вопрос"} · {node.difficulty}
        </span>
        <div className="drawer__actions">
          <button
            className="drawer__hide"
            onClick={() => onToggleHide(node.id)}
            title={hidden ? "Вернуть на доску" : "Скрыть с доски (локально, обратимо)"}
          >
            {hidden ? "↩ Вернуть" : "🙈 Скрыть"}
          </button>
          <button
            className="drawer__delete"
            onClick={() => {
              if (window.confirm(`Удалить вопрос «${node.title || node.id}» из банка безвозвратно?`)) {
                onDelete(node.id);
              }
            }}
            title="Удалить вопрос из банка (необратимо)"
          >
            🗑 Удалить
          </button>
          {!editing && (
            <button className="drawer__edit" onClick={startEdit} title="Редактировать вопрос (в банке)">
              ✏ Редактировать
            </button>
          )}
          <button onClick={onToggleFullscreen} title="Развернуть/свернуть">
            {fullscreen ? "⤢ свернуть" : "⤢ на весь экран"}
          </button>
          <button onClick={onClose} title="Закрыть (Esc)">
            ✕
          </button>
        </div>
      </header>

      <div className="drawer__body">
        {editing ? (
          <div className="drawer__editform">
            <label className="drawer__field">
              Заголовок
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="drawer__field">
              Сложность
              <select
                value={draft.difficulty}
                onChange={(e) => setDraft({ ...draft, difficulty: e.target.value as Difficulty })}
              >
                {DIFF_OPTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="drawer__field">
              {node.kind === "task" ? "Задача" : "Вопрос"}
              <textarea rows={4} value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} />
            </label>
            <label className="drawer__field">
              {node.kind === "task" ? "Эталон / решение" : "Ответ"}
              <textarea rows={8} value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} />
            </label>
            <div className="drawer__editbtns">
              <button className="btn--primary" onClick={saveEdit} disabled={!draft.question.trim()}>
                💾 Сохранить
              </button>
              <button onClick={() => setEditing(false)}>Отмена</button>
            </div>
          </div>
        ) : (
        <>
        {node.title && <h1 className="drawer__title">{node.title}</h1>}

        {node.tags.length > 0 && (
          <div className="drawer__tags">
            {node.tags.map((t) => (
              <span key={t} className="tagchip">
                {t}
              </span>
            ))}
          </div>
        )}

        <section>
          <h2>{node.kind === "task" ? "Задача" : "Вопрос"}</h2>
          <div className="md">
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {node.question}
            </Markdown>
          </div>
        </section>

        {node.starterCode && (
          <section>
            <h3>Стартовый код</h3>
            <div className="md">
              <Markdown rehypePlugins={[rehypeHighlight]}>
                {"```python\n" + node.starterCode + "\n```"}
              </Markdown>
            </div>
          </section>
        )}

        <section>
          <h2>{node.kind === "task" ? "Эталон / решение" : "Ответ"}</h2>
          <div className="md">
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {node.answer}
            </Markdown>
          </div>
        </section>

        {node.rubric.length > 0 && (
          <section>
            <h3>Критерии оценки</h3>
            <ul className="rubric">
              {node.rubric.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="drawer__scoring">
          <h3>Оценка</h3>
          <div className="scorebar">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                className={score != null && i <= score ? "scorebtn scorebtn--on" : "scorebtn"}
                onClick={() => onScore(node.id, i)}
                aria-label={`Оценка ${i}`}
              >
                ●
              </button>
            ))}
            {score != null && <span className="scoreval">{score}/5</span>}
          </div>
        </section>
        </>
        )}
      </div>
    </aside>
  );
}
