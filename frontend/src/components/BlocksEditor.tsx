import type { BlockDraft } from "../api";
import { useT } from "../i18n";

// Палитра колонок (600-ряд, как в pool.yaml): свотч циклически переключает цвет, новая колонка
// берёт следующий за последней. Произвольный color-picker не нужен — цвета семантические.
export const BLOCK_PALETTE = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#dc2626", "#0891b2", "#db2777", "#64748b"];

const nextColor = (c?: string): string => BLOCK_PALETTE[(BLOCK_PALETTE.indexOf(c ?? "") + 1) % BLOCK_PALETTE.length];

// uid — клиентский ключ ряда (в API не уходит): по индексу React переиспользует DOM-узлы при ↑/↓/✕,
// и недопечатанный текст в поле «+ под-колонка» уезжал бы в чужой ряд.
export const newUid = (): string => `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const emptyBlock = (after?: BlockDraft): BlockDraft => ({ uid: newUid(), label: "", color: nextColor(after?.color), subblocks: [] });

/** Все колонки названы и хотя бы одна есть — иначе сервер ответит 422. */
export const blocksValid = (blocks: BlockDraft[]): boolean => blocks.length > 0 && blocks.every((b) => b.label.trim() !== "");

// Редактор колонок направления: ряд = цвет · название · под-колонки (чипы) · ↑ ↓ ✕.
// Порядок — кнопками, без drag&drop. nodeCounts (по id колонки) — чтобы спросить подтверждение
// перед удалением колонки с вопросами: сервер удалит их вместе с колонкой.
export function BlocksEditor({ blocks, onChange, nodeCounts }: {
  blocks: BlockDraft[];
  onChange: (b: BlockDraft[]) => void;
  nodeCounts?: Record<string, number>;
}) {
  const t = useT();
  const patch = (i: number, p: Partial<BlockDraft>) => onChange(blocks.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...blocks];
    const [b] = next.splice(i, 1);
    next.splice(i + d, 0, b);
    onChange(next);
  };
  const remove = (i: number) => {
    const b = blocks[i];
    const n = b.id ? (nodeCounts?.[b.id] ?? 0) : 0;
    if (n > 0 && !window.confirm(t("Удалить колонку «{label}» и её вопросы ({n})?", { label: b.label, n }))) return;
    onChange(blocks.filter((_, j) => j !== i));
  };
  const addSub = (i: number, label: string) => {
    const v = label.trim();
    if (!v) return;
    patch(i, { subblocks: [...(blocks[i].subblocks ?? []), { label: v }] });
  };
  const removeSub = (i: number, si: number) =>
    patch(i, { subblocks: (blocks[i].subblocks ?? []).filter((_, j) => j !== si) });

  return (
    <div className="blocks-editor">
      {blocks.map((b, i) => (
        <div key={b.uid ?? b.id ?? i} className="blocks-editor__row">
          <button
            type="button"
            className="blocks-editor__color"
            title={b.color}
            aria-label={t("Цвет колонки")}
            style={{ background: b.color }}
            onClick={() => patch(i, { color: nextColor(b.color) })}
          />
          <div className="blocks-editor__main">
            <input
              className="blocks-editor__label"
              placeholder={t("Название колонки")}
              value={b.label}
              onChange={(e) => patch(i, { label: e.target.value })}
            />
            <div className="blocks-editor__subs">
              {(b.subblocks ?? []).map((s, si) => (
                <span key={si} className="blocks-editor__sub" style={{ background: b.color }}>
                  {s.label}
                  <button
                    type="button"
                    className="blocks-editor__subdel"
                    title={t("Убрать под-колонку «{label}»", { label: s.label })}
                    onClick={() => removeSub(i, si)}
                  >
                    ×
                  </button>
                </span>
              ))}
              {/* Неконтролируемый input: Enter добавляет чип и очищает поле; состояние ряду не нужно. */}
              <input
                className="blocks-editor__subadd"
                placeholder={t("+ под-колонка")}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  addSub(i, e.currentTarget.value);
                  e.currentTarget.value = "";
                }}
              />
            </div>
          </div>
          <div className="blocks-editor__btns">
            <button type="button" className="iconbtn btn--quiet blocks-editor__up" title={t("Вверх")} disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button
              type="button"
              className="iconbtn btn--quiet blocks-editor__down"
              title={t("Вниз")}
              disabled={i === blocks.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
            {/* Пока число вопросов не загружено, удалять колонку с id нельзя — иначе confirm не спросится. */}
            <button
              type="button"
              className="iconbtn btn--quiet blocks-editor__del"
              title={t("Удалить колонку")}
              disabled={!!b.id && !nodeCounts}
              onClick={() => remove(i)}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="iconbtn blocks-editor__add" onClick={() => onChange([...blocks, emptyBlock(blocks[blocks.length - 1])])}>
        {t("+ Колонка")}
      </button>
    </div>
  );
}
