import { useEffect, useRef } from "react";

// Поповер настроек отображения (⚙ в шапке). Раньше эти пять тумблеров лежали прямо в
// топбаре и занимали половину служебного ряда — во время интервью к ним обращаются редко,
// поэтому они уехали под иконку.
//
// Класс `.tb__toggle` сохранён намеренно: это тот же язык управления, что и в остальной
// шапке, и на него завязан smoke.mjs.
//
// Закрывается по Esc и клику вне. Esc глушится в capture-фазе, иначе он же снял бы
// выделение вопроса на доске (обработчик в App).

export type DisplaySettings = {
  bgDots: boolean;
  onToggleBgDots: () => void;
  guidesV: boolean;
  onToggleGuidesV: () => void;
  guidesH: boolean;
  onToggleGuidesH: () => void;
  agendaOpen: boolean;
  onToggleAgenda: () => void;
  showHidden: boolean;
  onToggleHidden: () => void;
  hiddenCount: number;
  showTimer: boolean;
  onToggleTimer: () => void;
  design: string;
  onSetDesign: (id: string) => void;
};

// Оформления доски — итог design-funnel (номера сквозные из воронки).
const DESIGNS: [string, string][] = [
  ["37", "Брутализм в цвете"],
  ["56", "Атлас"],
  ["57", "Полевой журнал"],
  ["58", "Изыскания"],
];

export function SettingsMenu({
  settings,
  onClose,
}: {
  settings: DisplaySettings;
  onClose: () => void;
}) {
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return; // прочие хоткеи доски продолжают работать
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    // Клик мимо поповера закрывает его. mousedown, а не click: иначе кнопка ⚙ успевала бы
    // получить свой click и открыть панель заново сразу после закрытия.
    const onDown = (e: MouseEvent) => {
      const pop = popRef.current;
      if (pop && !pop.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const s = settings;

  return (
    <div className="settings__pop" ref={popRef} role="dialog" aria-label="Настройки отображения">
      <div className="settings__group">
        <div className="settings__title">Оформление</div>
        <div className="settings__chips" role="radiogroup" aria-label="Оформление доски">
          {DESIGNS.map(([id, label]) => (
            <button
              key={id}
              className={`tb__toggle ${s.design === id ? "tb__toggle--on" : ""}`}
              onClick={() => s.onSetDesign(id)}
              role="radio"
              aria-checked={s.design === id}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings__group">
        <div className="settings__title">Холст</div>
        <div className="settings__chips" role="group" aria-label="Отображение холста">
          <button
            className={`tb__toggle ${s.bgDots ? "tb__toggle--on" : ""}`}
            onClick={s.onToggleBgDots}
            aria-pressed={s.bgDots}
          >
            Точки на фоне
          </button>
          <button
            className={`tb__toggle ${s.guidesV ? "tb__toggle--on" : ""}`}
            onClick={s.onToggleGuidesV}
            aria-pressed={s.guidesV}
            title="Границы блоков"
          >
            Вертикальные направляющие
          </button>
          <button
            className={`tb__toggle ${s.guidesH ? "tb__toggle--on" : ""}`}
            onClick={s.onToggleGuidesH}
            aria-pressed={s.guidesH}
            title="Уровни Base / Junior / Middle / Senior"
          >
            Горизонтальные направляющие
          </button>
        </div>
      </div>

      <div className="settings__group">
        <div className="settings__title">Панели</div>
        <div className="settings__chips" role="group" aria-label="Панели">
          <button
            className={`tb__toggle ${s.agendaOpen ? "tb__toggle--on" : ""}`}
            onClick={s.onToggleAgenda}
            aria-pressed={s.agendaOpen}
            title="Сайдбар со списком вопросов и переходом по ним"
          >
            Агенда
          </button>
          <button
            className={`tb__toggle ${s.showHidden ? "tb__toggle--on" : ""}`}
            onClick={s.onToggleHidden}
            aria-pressed={s.showHidden}
            title="Показывать вопросы, убранные с доски"
          >
            Скрытые вопросы{s.hiddenCount ? ` (${s.hiddenCount})` : ""}
          </button>
          <button
            className={`tb__toggle ${s.showTimer ? "tb__toggle--on" : ""}`}
            onClick={s.onToggleTimer}
            aria-pressed={s.showTimer}
            title="Время на вопрос и на всю сессию в нижней панели"
          >
            Таймер
          </button>
        </div>
      </div>
    </div>
  );
}
