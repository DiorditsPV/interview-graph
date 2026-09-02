import { useEffect, useState } from "react";
import { api } from "../api";
import { href, navigate } from "../router";
import type { Candidate, PoolConfig } from "../types";

// Старт интервью с главной (переехал из шапки доски): существующий кандидат или новый
// (имя + позиция/грейд) → сессия → доска с ?session=<id>, где joinSession подхватит её.
// Интервьюер не выбирается — бэкенд подставляет первого интервьюера тенанта.
export function StartSessionForm({ pool, onClose }: { pool: PoolConfig; onClose: () => void }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [seniority, setSeniority] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listCandidates().then(setCandidates).catch(() => setCandidates([]));
  }, []);

  const start = async () => {
    let candidateId = pickedId;
    let candName = name.trim();
    if (candidateId != null) candName = candidates.find((c) => c.id === candidateId)?.name ?? candName;
    if (candidateId == null && !candName) return;
    setBusy(true);
    try {
      if (candidateId == null) {
        try {
          const created = await api.createCandidate({
            name: candName,
            position: position.trim() || undefined,
            seniority: seniority.trim() || undefined,
          });
          candidateId = created.id;
        } catch {
          /* при сбое создания кандидата сессия всё равно стартует по свободному имени */
        }
      }
      const s = await api.createSession(pool.id, candName || "—", candidateId ?? undefined);
      // Именованная сессия персистит в БД — локальный черновик оценок больше не нужен;
      // таймер интервью стартует здесь, доска читает timerStart:<pool>.
      localStorage.removeItem(`draftScores:${pool.id}`);
      localStorage.setItem(`timerStart:${pool.id}`, String(Date.now()));
      navigate(href.board(pool.id, s.id));
    } catch {
      alert("Не удалось начать сессию");
      setBusy(false);
    }
  };

  // stopPropagation: карточка целиком — ссылка-«растяжка» на доску, клики по форме не должны уводить.
  return (
    <div className="poolcard__form" onClick={(e) => e.stopPropagation()}>
      {candidates.length > 0 && (
        <select
          className="cand-pick"
          value={pickedId ?? ""}
          title="Выбрать существующего кандидата"
          onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : null;
            setPickedId(v);
            if (v != null) setName("");
          }}
        >
          <option value="">Новый кандидат…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.seniority ? ` · ${c.seniority}` : ""}
            </option>
          ))}
        </select>
      )}
      {pickedId == null && (
        <>
          <input
            placeholder="Кандидат…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()}
            autoFocus
          />
          <input
            className="cand-pos"
            placeholder="Позиция (опц.)"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          />
          <input
            className="cand-sen"
            placeholder="Грейд (опц.)"
            value={seniority}
            onChange={(e) => setSeniority(e.target.value)}
          />
        </>
      )}
      <div className="poolcard__form-actions">
        <button className="btn--primary" onClick={start} disabled={busy}>Начать</button>
        <button className="iconbtn" onClick={onClose}>Отмена</button>
      </div>
    </div>
  );
}
