import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type BlockDraft } from "../api";
import { nWord, useT } from "../i18n";
import type { PoolConfig } from "../types";
import { BlocksEditor, blocksValid, emptyBlock, newUid } from "./BlocksEditor";

type Step = 1 | 2 | 3;

// Разделы направления → черновики редактора. id сохраняем: по ним сервер отличает переименование
// от «удалить и создать заново» (и не трогает вопросы).
const fromPool = (blocks: PoolConfig["blocks"]): BlockDraft[] =>
  blocks.map((b) => ({ uid: newUid(), id: b.id, label: b.label, color: b.color, subblocks: b.subblocks.map((s) => ({ id: s.id, label: s.label })) }));

// Явные поля для API: клиентский uid не уходит, названия обрезаны. Та же форма — ключ сравнения
// «структура отличается от пресетной?».
const toPayload = (blocks: BlockDraft[]): BlockDraft[] =>
  blocks.map((b) => ({
    id: b.id,
    label: b.label.trim(),
    color: b.color,
    subblocks: (b.subblocks ?? []).map((s) => ({ id: s.id, label: s.label.trim() })),
  }));

// Мастер направления в три шага: Основное (название, описание, набор вопросов) → Структура
// (разделы/подкатегории в BlocksEditor) → Проверка (компактный предпросмотр) → Создать/Сохранить.
// С пресетом копируются его разделы и вопросы; если структуру на шаге 2 поправили — после создания
// досылаем updatePool. Пресет при правке не предлагается: разделы и вопросы живут своей жизнью.
export function PoolFormModal({ mode, pools, pool, onClose, onSaved }: {
  mode: "create" | "edit";
  pools: PoolConfig[];
  pool?: PoolConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [step, setStep] = useState<Step>(1);
  const [label, setLabel] = useState(pool?.label ?? "");
  const [desc, setDesc] = useState(pool?.description ?? "");
  // "" — без пресета (свои разделы); без единого направления пресета и быть не может.
  const [preset, setPreset] = useState(pools[0]?.id ?? "");
  const [blocks, setBlocks] = useState<BlockDraft[]>(() => (pool ? fromPool(pool.blocks) : [emptyBlock()]));
  // Из какого пресета заполнен редактор: сменили пресет на шаге 1 → редактор перезаполняется,
  // вернулись «Назад» без смены → правки остаются. null — ещё не заполнялся.
  const [blocksSrc, setBlocksSrc] = useState<string | null>(null);
  // Число вопросов по разделу — для confirm при удалении раздела (его вопросы удалятся).
  const [nodeCounts, setNodeCounts] = useState<Record<string, number>>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !pool) return;
    let alive = true;
    api
      .graph(pool.id)
      .then((g) => {
        if (!alive) return;
        const counts: Record<string, number> = {};
        for (const n of g.nodes) counts[n.block] = (counts[n.block] ?? 0) + 1;
        setNodeCounts(counts);
      })
      .catch(() => {
        /* без счётчиков удаление разделов остаётся заблокированным (см. BlocksEditor) */
      });
    return () => {
      alive = false;
    };
  }, [mode, pool]);

  const labelOk = label.trim() !== "";
  const structureOk = blocksValid(blocks);

  const next = () => {
    if (step === 1) {
      if (!labelOk) return;
      if (mode === "create" && blocksSrc !== preset) {
        const src = pools.find((p) => p.id === preset);
        setBlocks(src ? fromPool(src.blocks) : [emptyBlock()]);
        setBlocksSrc(preset);
      }
      setStep(2);
    } else if (step === 2 && structureOk) {
      setStep(3);
    }
  };
  const back = () => setStep((s) => (s > 1 ? ((s - 1) as Step) : s));

  const submit = async () => {
    if (!labelOk || !structureOk || busy) return;
    setBusy(true);
    const fields = { label: label.trim(), description: desc.trim() };
    const payload = toPayload(blocks);
    let created: PoolConfig | undefined;
    try {
      if (mode === "create") {
        if (!preset) {
          await api.createPool({ ...fields, blocks: payload });
        } else {
          created = await api.createPool({ ...fields, preset });
          const src = pools.find((p) => p.id === preset)?.blocks ?? [];
          if (JSON.stringify(payload) !== JSON.stringify(toPayload(fromPool(src)))) {
            await api.updatePool(created.id, { blocks: payload });
          }
        }
      } else if (pool) {
        await api.updatePool(pool.id, { ...fields, blocks: payload });
      }
      onSaved();
    } catch {
      if (created) {
        // Направление уже есть (с разделами пресета), не применилась только правка структуры —
        // список обновляем, чтобы карточка не «пропала».
        alert(t("Направление создано, но структуру сохранить не удалось"));
        onSaved();
        return;
      }
      alert(mode === "create" ? t("Не удалось создать направление") : t("Не удалось сохранить направление"));
      setBusy(false);
    }
  };

  const steps = mode === "create" ? [t("Основное"), t("Структура вопросов"), t("Проверка")] : [t("Основное"), t("Структура"), t("Проверка")];
  const nSections = blocks.length;

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__card poolform wizard" onClick={(e) => e.stopPropagation()}>
        <h3>{mode === "create" ? t("Новое направление") : t("Направление · {label}", { label: pool?.label ?? "" })}</h3>
        <ol className="wizard__steps" aria-label={t("Шаг {n} из {total}", { n: step, total: steps.length })}>
          {steps.map((name, i) => {
            const n = (i + 1) as Step;
            const cls = ["wizard__step", n === step && "wizard__step--on", n < step && "wizard__step--done"].filter(Boolean).join(" ");
            return (
              <li key={n} className={cls} aria-current={n === step ? "step" : undefined}>
                <span className="wizard__step-n" aria-hidden="true">{n < step ? <Check size={12} strokeWidth={2.5} /> : n}</span>
                <span className="wizard__step-name">{name}</span>
              </li>
            );
          })}
        </ol>

        <div className="wizard__body">
          {step === 1 && (
            <>
              <label className="drawer__field">
                {t("Название")}
                <input
                  className="poolform__label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && next()}
                  autoFocus
                />
              </label>
              <label className="drawer__field">
                {t("Описание")}
                <input className="poolform__desc" value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && next()} />
              </label>
              {mode === "create" && (
                <label className="drawer__field">
                  {t("Набор вопросов")}
                  <select className="pool-preset" value={preset} onChange={(e) => setPreset(e.target.value)}>
                    <option value="">{t("Без пресета — создать самостоятельно")}</option>
                    {pools.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} · {t("{n} вопросов", { n: p.counts?.nodes ?? 0 })}
                      </option>
                    ))}
                  </select>
                  <span className="wizard__hint">{t("С пресетом копируются его разделы и вопросы; структуру можно поправить на следующем шаге.")}</span>
                </label>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <p className="wizard__hint wizard__hint--top">
                {t("Разделы — колонки матрицы вопросов, подкатегории — под-колонки внутри раздела. Порядок меняется перетаскиванием за ⠿.")}
              </p>
              <BlocksEditor blocks={blocks} onChange={setBlocks} nodeCounts={mode === "edit" ? nodeCounts : {}} />
            </>
          )}
          {step === 3 && (
            <div className="wizard__preview">
              {blocks.map((b, i) => {
                const subs = (b.subblocks ?? []).map((s) => s.label.trim()).filter(Boolean);
                return (
                  <div key={b.uid ?? b.id ?? i} className="wizard__preview-row">
                    <span className="wizard__preview-dot" style={{ background: b.color }} aria-hidden="true" />
                    <div className="wizard__preview-text">
                      <div className="wizard__preview-title">{b.label.trim().toUpperCase()}</div>
                      <div className="wizard__preview-subs">
                        {subs.length === 0
                          ? "—"
                          : subs.map((s, j) => (
                              <span key={j}>
                                {j > 0 && <span className="wizard__preview-sep"> | </span>}
                                {s}
                              </span>
                            ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="wizard__summary">
                <strong>{label.trim()}</strong> · {nSections} {nWord(nSections, ["раздел", "раздела", "разделов"], ["section", "sections"])}
                {desc.trim() && <span className="wizard__summary-desc"> · {desc.trim()}</span>}
              </div>
            </div>
          )}
        </div>

        <div className="wizard__foot">
          {step === 1 ? (
            <button type="button" className="iconbtn" onClick={onClose}>{t("Отмена")}</button>
          ) : (
            <button type="button" className="iconbtn wizard__back" onClick={back} disabled={busy}>{t("← Назад")}</button>
          )}
          {step < 3 ? (
            <button type="button" className="btn--primary wizard__next" onClick={next} disabled={step === 1 ? !labelOk : !structureOk}>
              {t("Далее →")}
            </button>
          ) : (
            <button type="button" className="btn--primary poolform__submit" onClick={submit} disabled={busy || !labelOk || !structureOk}>
              {mode === "create" ? t("Создать") : t("Сохранить")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
