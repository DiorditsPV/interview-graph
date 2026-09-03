import { Check, Ellipsis, GripVertical } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import type { BlockDraft } from "../api";
import { useT } from "../i18n";

// Фиксированная палитра разделов (600-ряд, как в pool.yaml): новый раздел берёт следующий за
// последним цвет, точка раздела открывает выбор из этих же восьми. Произвольный пикер не нужен —
// цвета семантические и должны совпадать с доской.
export const BLOCK_PALETTE = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#dc2626", "#0891b2", "#db2777", "#64748b"];

const nextColor = (c?: string): string => BLOCK_PALETTE[(BLOCK_PALETTE.indexOf(c ?? "") + 1) % BLOCK_PALETTE.length];

// uid — клиентский ключ ряда (в API не уходит): по индексу React переиспользовал бы DOM-узлы при
// перестановке, и фокус/undo-история инпутов уезжали бы в чужой ряд.
export const newUid = (): string => `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const emptyBlock = (after?: BlockDraft): BlockDraft => ({ uid: newUid(), label: "", color: nextColor(after?.color), subblocks: [] });

/** Хотя бы один раздел, у всех разделов и подкатегорий непустые названия — иначе сервер ответит 422. */
export const blocksValid = (blocks: BlockDraft[]): boolean =>
  blocks.length > 0 && blocks.every((b) => b.label.trim() !== "" && (b.subblocks ?? []).every((s) => s.label.trim() !== ""));

const ICON = { strokeWidth: 1.75 } as const;

// Что тащим: раздел (между разделами) или подкатегорию (внутри своего раздела).
type Drag = { kind: "section"; from: number } | { kind: "sub"; block: number; from: number };
// Куда наведено: раздел (sub нет) или подкатегория раздела.
type Over = { block: number; sub?: number };
type Popover = { kind: "palette" | "menu"; uid: string };

const uidOf = (b: BlockDraft, i: number): string => b.uid ?? b.id ?? `i${i}`;

// Структурный редактор направления: раздел → подкатегории. Ряд раздела = ⠿ · цветная точка (палитра)
// · название · ••• (вверх/вниз/удалить); под ним подкатегории (⠿ · название · ×) и «+ Добавить
// подкатегорию». Порядок — drag & drop (HTML5 DnD); стрелки в меню ••• — для клавиатуры/тача.
// nodeCounts (по id раздела) — confirm перед удалением раздела с вопросами: сервер удалит их вместе с ним.
export function BlocksEditor({ blocks, onChange, nodeCounts }: {
  blocks: BlockDraft[];
  onChange: (b: BlockDraft[]) => void;
  nodeCounts?: Record<string, number>;
}) {
  const t = useT();
  // draggable включается только на ряду, за ⠿ которого зажата мышь: у постоянно draggable-предка
  // Chrome не даёт выделять текст в input'ах мышью.
  const [armed, setArmed] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  // dragover/drop читают состояние через ref: события идут чаще, чем React успевает перерисовать.
  const dragRef = useRef<Drag | null>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  // Ключ поля, которое надо сфокусировать после добавления (autoFocus срабатывает при монтировании).
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // Палитра и меню ••• закрываются кликом мимо и Esc — как обычный dropdown.
  useEffect(() => {
    if (!popover) return;
    const close = () => setPopover(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [popover]);

  const patch = (i: number, p: Partial<BlockDraft>) => onChange(blocks.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const moveSection = (from: number, to: number) => {
    if (from === to || to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    const [b] = next.splice(from, 1);
    next.splice(to, 0, b);
    onChange(next);
  };
  const moveSub = (bi: number, from: number, to: number) => {
    const subs = [...(blocks[bi].subblocks ?? [])];
    if (from === to || to < 0 || to >= subs.length) return;
    const [s] = subs.splice(from, 1);
    subs.splice(to, 0, s);
    patch(bi, { subblocks: subs });
  };
  const removeSection = (i: number) => {
    const b = blocks[i];
    const n = b.id ? (nodeCounts?.[b.id] ?? 0) : 0;
    if (n > 0 && !window.confirm(t("Удалить раздел «{label}» и его вопросы ({n})?", { label: b.label, n }))) return;
    onChange(blocks.filter((_, j) => j !== i));
  };
  const addSection = () => {
    const b = emptyBlock(blocks[blocks.length - 1]);
    setFocusKey(`${b.uid}:name`);
    onChange([...blocks, b]);
  };
  const addSub = (i: number) => {
    const subs = blocks[i].subblocks ?? [];
    setFocusKey(`${uidOf(blocks[i], i)}:sub:${subs.length}`);
    patch(i, { subblocks: [...subs, { label: "" }] });
  };
  const patchSub = (i: number, si: number, label: string) =>
    patch(i, { subblocks: (blocks[i].subblocks ?? []).map((s, j) => (j === si ? { ...s, label } : s)) });
  const removeSub = (i: number, si: number) => patch(i, { subblocks: (blocks[i].subblocks ?? []).filter((_, j) => j !== si) });

  const startDrag = (e: DragEvent, d: Drag, key: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", key); // без данных Firefox drag не начинает
    dragRef.current = d;
    setDrag(d);
  };
  const endDrag = () => {
    dragRef.current = null;
    setDrag(null);
    setOver(null);
    setArmed(null);
  };
  const toggle = (p: Popover) => setPopover((cur) => (cur && cur.kind === p.kind && cur.uid === p.uid ? null : p));

  return (
    <div className="struct">
      {blocks.map((b, i) => {
        const uid = uidOf(b, i);
        const subs = b.subblocks ?? [];
        const isDragging = drag?.kind === "section" && drag.from === i;
        const isOver = drag?.kind === "section" && drag.from !== i && over?.block === i && over.sub === undefined;
        const cls = ["struct__section", isDragging && "struct__section--dragging", isOver && "struct__section--over", isOver && drag.from < i && "struct__section--over-after"]
          .filter(Boolean)
          .join(" ");
        return (
          <div
            key={uid}
            className={cls}
            draggable={armed === uid}
            onDragStart={(e) => {
              if (armed !== uid) {
                e.preventDefault();
                return;
              }
              startDrag(e, { kind: "section", from: i }, uid);
            }}
            onDragOver={(e) => {
              if (dragRef.current?.kind !== "section") return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (over?.block !== i || over.sub !== undefined) setOver({ block: i });
            }}
            onDrop={(e) => {
              const d = dragRef.current;
              if (d?.kind !== "section") return;
              e.preventDefault(); // иначе браузер вставит текст из dataTransfer в input под курсором
              moveSection(d.from, i);
              endDrag();
            }}
            onDragEnd={endDrag}
          >
            <div className="struct__head">
              <span
                className="struct__grip"
                title={t("Перетащите, чтобы изменить порядок")}
                onMouseDown={() => setArmed(uid)}
                onMouseUp={() => setArmed(null)}
              >
                <GripVertical size={16} {...ICON} aria-hidden="true" />
              </span>
              <span className="struct__dotwrap" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="struct__dot"
                  aria-label={t("Цвет раздела")}
                  aria-haspopup="true"
                  aria-expanded={popover?.kind === "palette" && popover.uid === uid}
                  style={{ background: b.color }}
                  onClick={() => toggle({ kind: "palette", uid })}
                />
                {popover?.kind === "palette" && popover.uid === uid && (
                  <div className="struct__palette" role="group" aria-label={t("Цвет раздела")}>
                    {BLOCK_PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="struct__swatch"
                        data-color={c}
                        aria-pressed={c === b.color}
                        title={c}
                        style={{ background: c }}
                        onClick={() => {
                          patch(i, { color: c });
                          setPopover(null);
                        }}
                      >
                        {c === b.color && <Check size={13} strokeWidth={2.5} aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                )}
              </span>
              <input
                className="struct__name"
                placeholder={t("Название раздела")}
                aria-label={t("Название раздела")}
                value={b.label}
                autoFocus={focusKey === `${uid}:name`}
                onChange={(e) => patch(i, { label: e.target.value })}
              />
              <span className="struct__menuwrap" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="struct__menu"
                  aria-label={t("Меню раздела")}
                  aria-haspopup="menu"
                  aria-expanded={popover?.kind === "menu" && popover.uid === uid}
                  onClick={() => toggle({ kind: "menu", uid })}
                >
                  <Ellipsis size={16} {...ICON} aria-hidden="true" />
                </button>
                {popover?.kind === "menu" && popover.uid === uid && (
                  <div className="struct__dropdown" role="menu">
                    <button type="button" role="menuitem" className="struct__up" disabled={i === 0} onClick={() => { setPopover(null); moveSection(i, i - 1); }}>
                      {t("Вверх")}
                    </button>
                    <button type="button" role="menuitem" className="struct__down" disabled={i === blocks.length - 1} onClick={() => { setPopover(null); moveSection(i, i + 1); }}>
                      {t("Вниз")}
                    </button>
                    <div className="struct__dropdown-sep" role="separator" />
                    {/* Пока число вопросов не загружено, удалять раздел с id нельзя — иначе confirm не спросится. */}
                    <button type="button" role="menuitem" className="struct__del" disabled={!!b.id && !nodeCounts} onClick={() => { setPopover(null); removeSection(i); }}>
                      {t("Удалить раздел")}
                    </button>
                  </div>
                )}
              </span>
            </div>
            <div className="struct__subs">
              {subs.map((s, si) => {
                const key = `${uid}:sub:${si}`;
                const subDragging = drag?.kind === "sub" && drag.block === i && drag.from === si;
                const subOver = drag?.kind === "sub" && drag.block === i && drag.from !== si && over?.block === i && over.sub === si;
                const subCls = ["struct__sub", subDragging && "struct__sub--dragging", subOver && "struct__sub--over", subOver && drag.from < si && "struct__sub--over-after"]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div
                    key={si}
                    className={subCls}
                    draggable={armed === key}
                    onDragStart={(e) => {
                      e.stopPropagation(); // иначе dragstart дойдёт до раздела и он отменит перетаскивание
                      if (armed !== key) {
                        e.preventDefault();
                        return;
                      }
                      startDrag(e, { kind: "sub", block: i, from: si }, key);
                    }}
                    onDragOver={(e) => {
                      const d = dragRef.current;
                      if (d?.kind !== "sub" || d.block !== i) return; // раздел над подкатегорией → обработает раздел
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = "move";
                      if (over?.block !== i || over.sub !== si) setOver({ block: i, sub: si });
                    }}
                    onDrop={(e) => {
                      const d = dragRef.current;
                      if (d?.kind !== "sub" || d.block !== i) return;
                      e.preventDefault();
                      e.stopPropagation();
                      moveSub(i, d.from, si);
                      endDrag();
                    }}
                    onDragEnd={(e) => {
                      e.stopPropagation();
                      endDrag();
                    }}
                  >
                    <span
                      className="struct__subgrip"
                      title={t("Перетащите, чтобы изменить порядок")}
                      onMouseDown={() => setArmed(key)}
                      onMouseUp={() => setArmed(null)}
                    >
                      <GripVertical size={14} {...ICON} aria-hidden="true" />
                    </span>
                    <input
                      className="struct__subname"
                      placeholder={t("Название подкатегории")}
                      aria-label={t("Название подкатегории")}
                      value={s.label}
                      autoFocus={focusKey === key}
                      onChange={(e) => patchSub(i, si, e.target.value)}
                      onKeyDown={(e) => {
                        // Enter в последней подкатегории — сразу следующая: список набивается без мыши.
                        if (e.key === "Enter" && si === subs.length - 1 && s.label.trim()) {
                          e.preventDefault();
                          addSub(i);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="struct__subdel"
                      title={t("Убрать подкатегорию")}
                      aria-label={t("Убрать подкатегорию")}
                      onClick={() => removeSub(i, si)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              <button type="button" className="struct__addsub" onClick={() => addSub(i)}>
                {t("+ Добавить подкатегорию")}
              </button>
            </div>
          </div>
        );
      })}
      <button type="button" className="iconbtn struct__addsection" onClick={addSection}>
        {t("+ Добавить раздел")}
      </button>
    </div>
  );
}
