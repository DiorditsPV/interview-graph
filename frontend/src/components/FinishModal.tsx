import { useState } from "react";
import { useT } from "../i18n";
import type { Decision, Session } from "../types";

// Итог интервью (инкремент 2 закрытия v1): решение + общий комментарий. Открывается с доски
// кнопкой «Завершить»; повторное открытие у завершённой сессии правит итог.
export const DECISIONS: Decision[] = ["hire", "no_hire", "hold"];

export function decisionLabel(t: (s: string) => string, d: Decision | null | undefined): string {
  if (d === "hire") return t("Нанимать");
  if (d === "no_hire") return t("Не нанимать");
  if (d === "hold") return t("Подумать");
  return "—";
}

export function FinishModal({ session, scored, total, onClose, onFinish }: {
  session: Session;
  scored: number;
  total: number;
  onClose: () => void;
  onFinish: (decision: Decision, summary: string) => Promise<void>;
}) {
  const t = useT();
  const [decision, setDecision] = useState<Decision | null>(session.decision ?? null);
  const [summary, setSummary] = useState(session.summary ?? "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!decision || busy) return;
    setBusy(true);
    try {
      await onFinish(decision, summary.trim());
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__card finish" onClick={(e) => e.stopPropagation()}>
        <h3>{t("Итог интервью · {name}", { name: session.candidate })}</h3>
        <div className="finish__stats muted">{t("оценено {done} / {total}", { done: scored, total })}</div>
        <div className="finish__decisions" role="radiogroup">
          {DECISIONS.map((d) => (
            <label key={d} className={`finish__decision finish__decision--${d} ${decision === d ? "finish__decision--on" : ""}`}>
              <input type="radio" name="decision" value={d} checked={decision === d} onChange={() => setDecision(d)} />
              {decisionLabel(t, d)}
            </label>
          ))}
        </div>
        <label className="drawer__field">
          {t("Общий комментарий")}
          <textarea
            className="finish__summary"
            rows={4}
            placeholder={t("Сильные и слабые стороны, что перепроверить…")}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>
        <div className="addform__btns">
          <button className="btn--primary finish__submit" onClick={submit} disabled={!decision || busy}>
            {session.status === "finished" ? t("Сохранить итог") : t("Завершить интервью")}
          </button>
          <button className="iconbtn" onClick={onClose}>{t("Отмена")}</button>
        </div>
      </div>
    </div>
  );
}
