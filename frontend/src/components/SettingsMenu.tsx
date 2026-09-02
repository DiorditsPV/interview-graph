import { useEffect } from "react";

// Боковая панель настроек (⚙ в шапке доски), выезжает слева — справа живут фильтры
// и drawer вопроса. Шапка оставляет себе ход интервью; всё, что настраивают редко —
// оформление, тема, холст, панели, справка — собрано здесь. Работа с банком — отдельная
// страница (#/bank/<pool>), отсюда на неё только ссылка.
//
// `.tb__toggle`, `.themebtn`, `.helpbtn` сохранены — на них ходит smoke.mjs.
// Закрывается по ✕, Esc и клику вне; Esc глушится в capture-фазе (иначе снимет
// выделение вопроса), mousedown слушаем в capture-фазе (канва React Flow гасит всплытие)
// и не считаем «мимо» клики внутри .settings (панель + кнопка ⚙).

export type DisplaySettings = {
  design: string;
  onSetDesign: (id: string) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
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
  onShowHelp: () => void;
  bankHref: string;
};

// Оформления доски — итог design-funnel (номера сквозные из воронки).
const DESIGNS: [string, string][] = [
  ["37", "Брутализм в цвете"],
  ["56", "Атлас"],
  ["57", "Полевой журнал"],
  ["58", "Изыскания"],
];

function Chip({ on, onClick, title, className = "", children }: {
  on: boolean; onClick: () => void; title?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <button className={`tb__toggle ${className} ${on ? "tb__toggle--on" : ""}`} onClick={onClick} aria-pressed={on} title={title}>
      {children}
    </button>
  );
}

export function SettingsMenu({ settings: s, onClose }: { settings: DisplaySettings; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t && t.closest(".settings")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    document.addEventListener("mousedown", onDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      document.removeEventListener("mousedown", onDown, { capture: true });
    };
  }, [onClose]);

  return (
    <div className="setdrawer" role="dialog" aria-label="Настройки" aria-modal="false">
      <div className="setdrawer__head">
        <strong>Настройки</strong>
        <button className="setdrawer__close" onClick={onClose} title="Закрыть (Esc)">✕</button>
      </div>

      <div className="settings__group">
        <div className="settings__title">Оформление</div>
        <div className="settings__chips" role="radiogroup" aria-label="Оформление доски">
          {DESIGNS.map(([id, label]) => (
            <button key={id} className={`tb__toggle ${s.design === id ? "tb__toggle--on" : ""}`}
              onClick={() => s.onSetDesign(id)} role="radio" aria-checked={s.design === id}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings__group">
        <div className="settings__title">Тема</div>
        <div className="settings__chips">
          <Chip className="themebtn" on={s.theme === "dark"} onClick={s.onToggleTheme} title="Выбор запоминается">Тёмная тема</Chip>
        </div>
      </div>

      <div className="settings__group">
        <div className="settings__title">Холст</div>
        <div className="settings__chips" role="group" aria-label="Отображение холста">
          <Chip on={s.bgDots} onClick={s.onToggleBgDots}>Точки на фоне</Chip>
          <Chip on={s.guidesV} onClick={s.onToggleGuidesV} title="Границы блоков">Вертикальные направляющие</Chip>
          <Chip on={s.guidesH} onClick={s.onToggleGuidesH} title="Уровни Base / Junior / Middle / Senior">Горизонтальные направляющие</Chip>
        </div>
      </div>

      <div className="settings__group">
        <div className="settings__title">Панели</div>
        <div className="settings__chips" role="group" aria-label="Панели">
          <Chip on={s.agendaOpen} onClick={s.onToggleAgenda} title="Сайдбар со списком вопросов">Агенда</Chip>
          <Chip on={s.showHidden} onClick={s.onToggleHidden} title="Показывать вопросы, убранные с доски">
            Скрытые вопросы{s.hiddenCount ? ` (${s.hiddenCount})` : ""}
          </Chip>
          <Chip on={s.showTimer} onClick={s.onToggleTimer} title="Время на вопрос и на сессию в нижней панели">Таймер</Chip>
        </div>
      </div>

      <div className="settings__group">
        <div className="settings__title">Банк вопросов</div>
        <a className="setdrawer__act" href={s.bankHref}>Открыть банк направления →</a>
      </div>

      <div className="settings__group">
        <div className="settings__title">Справка</div>
        <button className="setdrawer__act helpbtn" onClick={() => { onClose(); s.onShowHelp(); }}>Горячие клавиши</button>
      </div>
    </div>
  );
}
