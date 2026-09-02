import { useEffect, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";
import { href, navigate } from "../router";
import type { Candidate, PoolConfig } from "../types";

// Старт интервью с главной (переехал из шапки доски): существующий кандидат или новый
// (имя + позиция/грейд) → сессия → доска с ?session=<id>, где joinSession подхватит её.
// Интервьюер не выбирается — бэкенд подставляет первого интервьюера тенанта.
export function StartSessionForm({ pool, onClose }: { pool: PoolConfig; onClose: () => void }) {
  const t = useT();
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
    if (busy) return; // Enter в инпуте обходит disabled кнопки — иначе повторный старт плодит сессии
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
      alert(t("Не удалось начать сессию"));
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
          title={t("Выбрать существующего кандидата")}
          onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : null;
            setPickedId(v);
            if (v != null) setName("");
          }}
        >
          <option value="">{t("Новый кандидат…")}</option>
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
            placeholder={t("Кандидат…")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()}
            autoFocus
          />
          <input
            className="cand-pos"
            placeholder={t("Позиция (опц.)")}
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          />
          <input
            className="cand-sen"
            placeholder={t("Грейд (опц.)")}
            value={seniority}
            onChange={(e) => setSeniority(e.target.value)}
          />
        </>
      )}
      <div className="poolcard__form-actions">
        <button className="btn--primary" onClick={start} disabled={busy}>{t("Начать")}</button>
        <button className="iconbtn" onClick={onClose}>{t("Отмена")}</button>
      </div>
    </div>
  );
}
