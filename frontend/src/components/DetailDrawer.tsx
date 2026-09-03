import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { blockColor, blockLabel, type Difficulty, type PoolConfig, type QNode } from "../types";
import type { NodeUpdate } from "../api";
import { useT } from "../i18n";

interface Props {
  node: QNode | null;
  pool: PoolConfig;
  score?: number;
  note?: string;
  fullscreen: boolean;
  hidden: boolean;
  onToggleHide: (nodeId: string) => void;
  onScore: (nodeId: string, score: number) => void;
  onNote: (nodeId: string, text: string) => void;
  onDelete: (nodeId: string) => void;
  onUpdate: (nodeId: string, fields: NodeUpdate) => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
}

const DIFF_OPTS: Difficulty[] = ["base", "junior", "middle", "senior"];

// Немодальный drawer: полный текст вопроса/ответа. Закрывается с клавиатуры (Esc).
export function DetailDrawer({ node, pool, score, note, fullscreen, hidden, onToggleHide, onScore, onNote, onDelete, onUpdate, onToggleFullscreen, onClose }: Props) {
  const t = useT();
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
  const color = blockColor(pool, node.block);

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
      aria-label={t("Детали вопроса")}
      aria-modal="false"
      tabIndex={-1}
    >
      <header className="drawer__bar" style={{ borderTopColor: color }}>
        <span className="drawer__badge" style={{ background: color }}>
          {blockLabel(pool, node.block)} · {node.topic}
        </span>
        <span className="drawer__diff" data-diff={node.difficulty}>
          {node.kind === "task" ? t("🛠 задача") : t("❓ вопрос")} · {node.difficulty}
        </span>
        <div className="drawer__actions">
          <button
            className="drawer__hide"
            onClick={() => onToggleHide(node.id)}
            title={hidden ? t("Вернуть на доску") : t("Скрыть с доски (локально, обратимо)")}
          >
            {hidden ? t("Вернуть") : t("Скрыть")}
          </button>
          <button
            className="drawer__delete"
            onClick={() => {
              if (window.confirm(t("Удалить вопрос «{name}» из банка безвозвратно?", { name: node.title || node.id }))) {
                onDelete(node.id);
              }
            }}
            title={t("Удалить вопрос из банка (необратимо)")}
          >
            {t("Удалить")}
          </button>
          {!editing && (
            <button className="drawer__edit" onClick={startEdit} title={t("Редактировать вопрос (в банке)")}>
              {t("Редактировать")}
            </button>
          )}
          <button onClick={onToggleFullscreen} title={t("Развернуть/свернуть")}>
            {fullscreen ? t("Свернуть") : t("На весь экран")}
          </button>
          <button onClick={onClose} title={t("Закрыть (Esc)")}>
            ✕
          </button>
        </div>
      </header>

      <div className="drawer__body">
        {editing ? (
          <div className="drawer__editform">
            <label className="drawer__field">
              {t("Заголовок")}
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="drawer__field">
              {t("Сложность")}
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
              {node.kind === "task" ? t("Задача") : t("Вопрос")}
              <textarea rows={4} value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} />
            </label>
            <label className="drawer__field">
              {node.kind === "task" ? t("Эталон / решение") : t("Ответ")}
              <textarea rows={8} value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} />
            </label>
            <div className="drawer__editbtns">
              <button className="btn--primary" onClick={saveEdit} disabled={!draft.question.trim()}>
                {t("💾 Сохранить")}
              </button>
              <button onClick={() => setEditing(false)}>{t("Отмена")}</button>
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
          <h2>{node.kind === "task" ? t("Задача") : t("Вопрос")}</h2>
          <div className="md">
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {node.question}
            </Markdown>
          </div>
        </section>

        {node.starterCode && (
          <section>
            <h3>{t("Стартовый код")}</h3>
            <div className="md">
              <Markdown rehypePlugins={[rehypeHighlight]}>
                {"```python\n" + node.starterCode + "\n```"}
              </Markdown>
            </div>
          </section>
        )}

        <section>
          <h2>{node.kind === "task" ? t("Эталон / решение") : t("Ответ")}</h2>
          <div className="md">
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {node.answer}
            </Markdown>
          </div>
        </section>

        {node.rubric.length > 0 && (
          <section>
            <h3>{t("Критерии оценки")}</h3>
            <ul className="rubric">
              {node.rubric.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="drawer__scoring">
          <h3>{t("Оценка")}</h3>
          <div className="scorebar">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                className={score != null && i <= score ? "scorebtn scorebtn--on" : "scorebtn"}
                onClick={() => onScore(node.id, i)}
                aria-label={t("Оценка {n}", { n: i })}
              >
                ●
              </button>
            ))}
            {score != null && <span className="scoreval">{score}/5</span>}
          </div>
          <textarea
            className="drawer__note"
            placeholder={t("Заметка интервьюера…")}
            value={note ?? ""}
            onChange={(e) => onNote(node.id, e.target.value)}
          />
        </section>
        </>
        )}
      </div>
    </aside>
  );
}
