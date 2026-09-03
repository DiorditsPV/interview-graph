import { useEffect, useState } from "react";
import { api, type BlockDraft } from "../api";
import { useT } from "../i18n";
import type { PoolConfig } from "../types";
import { BlocksEditor, blocksValid, emptyBlock } from "./BlocksEditor";

// Создание направления (название, описание, набор вопросов = существующее направление, чьи колонки
// и вопросы копируются, либо «без пресета» — свои колонки в редакторе) и правка названия/описания/
// колонок. Пресет при правке не предлагается: колонки и вопросы после создания живут своей жизнью.
export function PoolFormModal({ mode, pools, pool, onClose, onSaved }: {
  mode: "create" | "edit";
  pools: PoolConfig[];
  pool?: PoolConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [label, setLabel] = useState(pool?.label ?? "");
  const [desc, setDesc] = useState(pool?.description ?? "");
  // "" — без пресета (свои колонки); без единого направления пресета и быть не может.
  const [preset, setPreset] = useState(pools[0]?.id ?? "");
  // id существующих колонок/под-колонок сохраняем — по ним сервер понимает, что удалено, а что переименовано.
  const [blocks, setBlocks] = useState<BlockDraft[]>(() =>
    pool
      ? pool.blocks.map((b) => ({ uid: b.id, id: b.id, label: b.label, color: b.color, subblocks: b.subblocks.map((s) => ({ id: s.id, label: s.label })) }))
      : [emptyBlock()],
  );
  // Число вопросов по колонке — для confirm при удалении колонки (её вопросы удалятся).
  const [nodeCounts, setNodeCounts] = useState<Record<string, number>>();
  const [busy, setBusy] = useState(false);
  const withEditor = mode === "edit" || !preset;

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
        /* без счётчиков удаление колонок остаётся заблокированным (см. BlocksEditor) */
      });
    return () => {
      alive = false;
    };
  }, [mode, pool]);

  const canSubmit = !!label.trim() && (!withEditor || blocksValid(blocks));

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    // Явные поля: клиентский uid в API не уходит.
    const payload = blocks.map((b) => ({
      id: b.id,
      label: b.label.trim(),
      color: b.color,
      subblocks: (b.subblocks ?? []).map((s) => ({ id: s.id, label: s.label.trim() })),
    }));
    try {
      if (mode === "create") {
        await api.createPool(
          preset
            ? { label: label.trim(), description: desc.trim(), preset }
            : { label: label.trim(), description: desc.trim(), blocks: payload },
        );
      } else if (pool) {
        await api.updatePool(pool.id, { label: label.trim(), description: desc.trim(), blocks: payload });
      }
      onSaved();
    } catch {
      alert(mode === "create" ? t("Не удалось создать направление") : t("Не удалось сохранить направление"));
      setBusy(false);
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__card poolform" onClick={(e) => e.stopPropagation()}>
        <h3>{mode === "create" ? t("Новое направление") : t("Направление · {label}", { label: pool?.label ?? "" })}</h3>
        <label className="drawer__field">
          {t("Название")}
          <input
            className="poolform__label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus
          />
        </label>
        <label className="drawer__field">
          {t("Описание")}
          <input className="poolform__desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </label>
        {mode === "create" && (
          <label className="drawer__field">
            {t("Набор вопросов")}
            <select className="pool-preset" value={preset} onChange={(e) => setPreset(e.target.value)}>
              <option value="">{t("Без пресета — свои колонки")}</option>
              {pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {t("{n} вопросов", { n: p.counts?.nodes ?? 0 })}
                </option>
              ))}
            </select>
          </label>
        )}
        {withEditor && (
          <div className="poolform__blocks">
            <div className="poolform__blocks-title">{t("Колонки")}</div>
            <BlocksEditor blocks={blocks} onChange={setBlocks} nodeCounts={nodeCounts} />
          </div>
        )}
        <div className="addform__btns">
          <button className="btn--primary poolform__submit" onClick={submit} disabled={busy || !canSubmit}>
            {mode === "create" ? t("Создать") : t("Сохранить")}
          </button>
          <button className="iconbtn" onClick={onClose}>{t("Отмена")}</button>
        </div>
      </div>
    </div>
  );
}
