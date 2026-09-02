import { useState } from "react";
import { api } from "../api";
import { DIFFS } from "../layout";
import { blockLabel, blockOrder, type PoolConfig } from "../types";

const EMPTY = { block: "", topic: "", difficulty: "middle", kind: "question", title: "", question: "", answer: "", tags: "" };

// Модалка «Новый вопрос» (question-management): POST /api/nodes в пул страницы банка.
export function AddQuestionModal({ pool, onClose, onCreated }: {
  pool: PoolConfig; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [d, setD] = useState({ ...EMPTY, block: blockOrder(pool)[0] ?? "" });
  const create = async () => {
    let res: { id: string };
    try {
      res = await api.createNode({
        pool: pool.id,
        block: d.block,
        topic: d.topic.trim(),
        difficulty: d.difficulty as "base" | "junior" | "middle" | "senior",
        kind: d.kind as "question" | "task",
        title: d.title.trim() || undefined,
        question: d.question,
        answer: d.answer,
        tags: d.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
    } catch {
      alert("Не удалось создать вопрос");
      return;
    }
    onCreated(res.id);
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__card addform" onClick={(e) => e.stopPropagation()}>
        <h3>Новый вопрос · {pool.label}</h3>
        <div className="addform__row">
          <label className="drawer__field">
            Блок
            <select value={d.block} onChange={(e) => setD({ ...d, block: e.target.value })}>
              {blockOrder(pool).map((b) => <option key={b} value={b}>{blockLabel(pool, b)}</option>)}
            </select>
          </label>
          <label className="drawer__field">
            Тема
            <input value={d.topic} onChange={(e) => setD({ ...d, topic: e.target.value })} placeholder="например, sql" />
          </label>
        </div>
        <div className="addform__row">
          <label className="drawer__field">
            Сложность
            <select value={d.difficulty} onChange={(e) => setD({ ...d, difficulty: e.target.value })}>
              {DIFFS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label className="drawer__field">
            Тип
            <select value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value })}>
              <option value="question">вопрос</option>
              <option value="task">задача</option>
            </select>
          </label>
        </div>
        <label className="drawer__field">Заголовок<input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></label>
        <label className="drawer__field">{d.kind === "task" ? "Задача" : "Вопрос"}
          <textarea rows={3} value={d.question} onChange={(e) => setD({ ...d, question: e.target.value })} /></label>
        <label className="drawer__field">{d.kind === "task" ? "Эталон / решение" : "Ответ"}
          <textarea rows={5} value={d.answer} onChange={(e) => setD({ ...d, answer: e.target.value })} /></label>
        <label className="drawer__field">Теги (через запятую)<input value={d.tags} onChange={(e) => setD({ ...d, tags: e.target.value })} /></label>
        <div className="addform__btns">
          <button className="btn--primary" onClick={create} disabled={!d.topic.trim() || !d.question.trim()}>Создать</button>
          <button onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}
