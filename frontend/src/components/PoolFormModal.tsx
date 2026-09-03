import { useState } from "react";
import { api } from "../api";
import type { PoolConfig } from "../types";

// Создание направления (название, описание, набор вопросов = существующее направление, чьи
// колонки и вопросы копируются) и правка названия/описания. Пресет при правке не предлагается:
// колонки и вопросы после создания живут своей жизнью (банк вопросов).
export function PoolFormModal({ mode, pools, pool, onClose, onSaved }: {
  mode: "create" | "edit";
  pools: PoolConfig[];
  pool?: PoolConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(pool?.label ?? "");
  const [desc, setDesc] = useState(pool?.description ?? "");
  const [preset, setPreset] = useState(pools[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!label.trim() || (mode === "create" && !preset)) return;
    setBusy(true);
    try {
      if (mode === "create") await api.createPool({ label: label.trim(), description: desc.trim(), preset });
      else if (pool) await api.updatePool(pool.id, { label: label.trim(), description: desc.trim() });
      onSaved();
    } catch {
      alert(mode === "create" ? "Не удалось создать направление" : "Не удалось сохранить направление");
      setBusy(false);
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__card poolform" onClick={(e) => e.stopPropagation()}>
        <h3>{mode === "create" ? "Новое направление" : `Направление · ${pool?.label ?? ""}`}</h3>
        <label className="drawer__field">
          Название
          <input
            className="poolform__label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus
          />
        </label>
        <label className="drawer__field">
          Описание
          <input className="poolform__desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </label>
        {mode === "create" && (
          <label className="drawer__field">
            Набор вопросов
            <select className="pool-preset" value={preset} onChange={(e) => setPreset(e.target.value)}>
              {pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.counts?.nodes ?? 0} вопросов
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="addform__btns">
          <button className="btn--primary poolform__submit" onClick={submit} disabled={busy || !label.trim()}>
            {mode === "create" ? "Создать" : "Сохранить"}
          </button>
          <button className="iconbtn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}
