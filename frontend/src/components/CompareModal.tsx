import { useEffect, useState } from "react";
import { api } from "../api";
import { BLOCK_LABEL, type Block, type Comparison, type SessionSummary } from "../types";

// Аналитическая модалка: выбрать сохранённые сессии и сравнить средние баллы по блокам.
export function CompareModal({ onClose }: { onClose: () => void }) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.listSessions().then(setSessions).catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = async () => {
    setLoading(true);
    try {
      setComparison(await api.compareSessions([...selected]));
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1));

  return (
    <div className="cmp-modal" onClick={onClose}>
      <div className="cmp-modal__card" onClick={(e) => e.stopPropagation()}>
        <div className="cmp-modal__head">
          <strong>Сравнение кандидатов</strong>
          <button className="cmp-modal__close" onClick={onClose} title="Закрыть (Esc)">
            ✕
          </button>
        </div>

        {sessions.length === 0 ? (
          <p className="cmp-modal__empty">Нет сохранённых сессий.</p>
        ) : (
          <>
            <div className="cmp-modal__list">
              {sessions.map((s) => (
                <label key={s.id} className="cmp-modal__item">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                  <span>{s.candidate}</span>
                  <span className="cmp-modal__date">{new Date(s.created_at).toLocaleDateString()}</span>
                </label>
              ))}
            </div>
            <button className="cmp-modal__run" disabled={selected.size === 0 || loading} onClick={run}>
              Сравнить выбранные ({selected.size})
            </button>
          </>
        )}

        {comparison && comparison.sessions.length > 0 && (
          <table className="cmp-table">
            <thead>
              <tr>
                <th>Блок</th>
                {comparison.sessions.map((s) => (
                  <th key={s.id}>{s.candidate}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.blocks.map((b) => (
                <tr key={b}>
                  <td>{BLOCK_LABEL[b as Block] ?? b}</td>
                  {comparison.sessions.map((s) => (
                    <td key={s.id}>{fmt(s.byBlock[b]?.avg)}</td>
                  ))}
                </tr>
              ))}
              <tr className="cmp-table__total">
                <td>Итого</td>
                {comparison.sessions.map((s) => (
                  <td key={s.id}>{fmt(s.overall.avg)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
