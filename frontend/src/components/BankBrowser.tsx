import { useEffect, useMemo, useState } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { blockColor, blockLabel, blockOrder, subLabel, DIFF_COLOR, type Difficulty, type Kind, type PoolConfig, type QNode } from "../types";
import { DIFFS, subOf } from "../layout";

const KIND_LABEL: Record<Kind, string> = { question: "вопрос", task: "задача" };

interface Props {
  nodes: QNode[];
  pool: PoolConfig;
  onClose?: () => void;   // оверлей на доске; на странице банка не передаётся
  embedded?: boolean;     // true — рендер как содержимое страницы, без overlay-обёртки и Esc
}

// Полноэкранный оверлей «Все вопросы»: просмотр всего банка (поиск + фильтры + раскрытие
// вопрос/ответ/критерии). Читает уже загруженный graph; данные/бэк/персист не трогает.
export function BankBrowser({ nodes, pool, onClose, embedded }: Props) {
  const [q, setQ] = useState("");
  const [blocks, setBlocks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(blockOrder(pool).map((b) => [b, true])),
  );
  const [diffs, setDiffs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DIFFS.map((d) => [d, true])),
  );
  const [kinds, setKinds] = useState<Record<string, boolean>>({ question: true, task: true });
  const [open, setOpen] = useState<Set<string>>(new Set());

  // Escape перехватываем в capture-фазе и гасим дальше: оверлей — верхняя модалка,
  // он должен закрываться первым, не отдавая Escape нижним слушателям (drawer/канва).
  useEffect(() => {
    if (embedded || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, embedded]);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      nodes.filter((n) => {
        if (!blocks[n.block] || !diffs[n.difficulty] || !kinds[n.kind]) return false;
        if (!needle) return true;
        const hay = [n.title ?? "", n.question, n.answer, n.topic, ...n.tags].join(" ").toLowerCase();
        return hay.includes(needle);
      }),
    [nodes, blocks, diffs, kinds, needle],
  );

  const drank = (d: Difficulty) => DIFFS.indexOf(d);
  const grouped = useMemo(() => {
    const order: string[] = [...blockOrder(pool)];
    for (const n of filtered) if (!order.includes(n.block)) order.push(n.block);
    return order
      .map((block) => {
        const inBlock = filtered.filter((n) => n.block === block);
        const subs = Array.from(new Set(inBlock.map(subOf)));
        const subGroups = subs
          .map((sub) => ({
            sub,
            items: inBlock
              .filter((n) => subOf(n) === sub)
              .sort((a, c) => drank(a.difficulty) - drank(c.difficulty) || a.id.localeCompare(c.id)),
          }))
          .filter((s) => s.items.length);
        return { block, count: inBlock.length, subGroups };
      })
      .filter((g) => g.count > 0);
  }, [filtered, pool]);

  const toggleOpen = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className={embedded ? "bankbrowser bankbrowser--embedded" : "bankbrowser"} role={embedded ? undefined : "dialog"} aria-label="Все вопросы" aria-modal={embedded ? undefined : "true"}>
      <header className="bankbrowser__bar">
        <strong>Все вопросы</strong>
        <span className="bankbrowser__count">
          показано {filtered.length} из {nodes.length}
        </span>
        <input
          className="bankbrowser__search"
          placeholder="Поиск по тексту, теме, тегам…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <button className="iconbtn" onClick={() => setOpen(new Set(filtered.map((n) => n.id)))}>
          Развернуть всё
        </button>
        <button className="iconbtn" onClick={() => setOpen(new Set())}>
          Свернуть всё
        </button>
        {onClose && (
          <button className="iconbtn bankbrowser__close" onClick={onClose} title="Закрыть (Esc)">
            ✕
          </button>
        )}
      </header>

      <div className="bankbrowser__filters">
        <div className="bankbrowser__chips">
          {blockOrder(pool).map((b) => (
            <button
              key={b}
              className={`fp__chip ${blocks[b] ? "" : "fp__chip--off"}`}
              style={{
                borderColor: blockColor(pool, b),
                color: blocks[b] ? "#fff" : blockColor(pool, b),
                background: blocks[b] ? blockColor(pool, b) : "transparent",
              }}
              onClick={() => setBlocks((s) => ({ ...s, [b]: !s[b] }))}
            >
              {blockLabel(pool, b)}
            </button>
          ))}
        </div>
        <div className="bankbrowser__chips">
          {DIFFS.map((d) => (
            <button
              key={d}
              className={`fp__chip ${diffs[d] ? "" : "fp__chip--off"}`}
              style={{
                borderColor: DIFF_COLOR[d],
                color: diffs[d] ? "#fff" : DIFF_COLOR[d],
                background: diffs[d] ? DIFF_COLOR[d] : "transparent",
              }}
              onClick={() => setDiffs((s) => ({ ...s, [d]: !s[d] }))}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="bankbrowser__chips">
          {(["question", "task"] as Kind[]).map((k) => (
            <button
              key={k}
              className={`fp__chip ${kinds[k] ? "" : "fp__chip--off"}`}
              onClick={() => setKinds((s) => ({ ...s, [k]: !s[k] }))}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="bankbrowser__body">
        {filtered.length === 0 && <p className="bankbrowser__empty">Ничего не найдено</p>}
        {grouped.map((g) => (
          <section key={g.block} className="bankblock">
            <h2 className="bankblock__head" style={{ borderColor: blockColor(pool, g.block) }}>
              {blockLabel(pool, g.block)} <span className="bankblock__n">{g.count}</span>
            </h2>
            {g.subGroups.map((sg) => (
              <div key={sg.sub} className="banksub">
                <h3 className="banksub__head">{subLabel(pool, g.block, sg.sub)}</h3>
                {sg.items.map((n) => {
                  const isOpen = open.has(n.id);
                  return (
                    <div key={n.id} className={`bankrow ${isOpen ? "bankrow--open" : ""}`}>
                      <button
                        className="bankrow__head"
                        onClick={() => toggleOpen(n.id)}
                        aria-expanded={isOpen}
                      >
                        <span className="bankrow__diff" style={{ background: DIFF_COLOR[n.difficulty] }}>
                          {n.difficulty}
                        </span>
                        <span className="bankrow__kind">{KIND_LABEL[n.kind]}</span>
                        <span className="bankrow__title">{n.title || n.question}</span>
                        {n.tags.length > 0 && (
                          <span className="bankrow__tags">
                            {n.tags.map((t) => (
                              <span key={t} className="tagchip">
                                {t}
                              </span>
                            ))}
                          </span>
                        )}
                        <span className="bankrow__caret">{isOpen ? "▾" : "▸"}</span>
                      </button>
                      {isOpen && (
                        <div className="bankrow__body">
                          <section>
                            <h4>{n.kind === "task" ? "Задача" : "Вопрос"}</h4>
                            <div className="md">
                              <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                                {n.question}
                              </Markdown>
                            </div>
                          </section>
                          {n.starterCode && (
                            <section>
                              <h4>Стартовый код</h4>
                              <div className="md">
                                <Markdown rehypePlugins={[rehypeHighlight]}>
                                  {"```python\n" + n.starterCode + "\n```"}
                                </Markdown>
                              </div>
                            </section>
                          )}
                          <section>
                            <h4>{n.kind === "task" ? "Эталон / решение" : "Ответ"}</h4>
                            <div className="md">
                              <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                                {n.answer}
                              </Markdown>
                            </div>
                          </section>
                          {n.rubric.length > 0 && (
                            <section>
                              <h4>Критерии оценки</h4>
                              <ul className="rubric">
                                {n.rubric.map((r, i) => (
                                  <li key={i}>{r}</li>
                                ))}
                              </ul>
                            </section>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
