import { useEffect } from "react";
import { useT } from "../i18n";

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
  const t = useT();
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
    <div className="setdrawer" role="dialog" aria-label={t("Настройки")} aria-modal="false">
      <div className="setdrawer__head">
        <strong>{t("Настройки")}</strong>
        <button className="setdrawer__close" onClick={onClose} title={t("Закрыть (Esc)")}>✕</button>
      </div>

      <div className="settings__group">
        <div className="settings__title">{t("Оформление")}</div>
        <div className="settings__chips" role="radiogroup" aria-label={t("Оформление доски")}>
          {DESIGNS.map(([id, label]) => (
            <button key={id} className={`tb__toggle ${s.design === id ? "tb__toggle--on" : ""}`}
              onClick={() => s.onSetDesign(id)} role="radio" aria-checked={s.design === id}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings__group">
        <div className="settings__title">{t("Цветовая тема")}</div>
        <div className="settings__chips">
          <Chip className="themebtn" on={s.theme === "dark"} onClick={s.onToggleTheme} title={t("Выбор запоминается")}>{t("Тёмная тема")}</Chip>
        </div>
      </div>

      <div className="settings__group">
        <div className="settings__title">{t("Холст")}</div>
        <div className="settings__chips" role="group" aria-label={t("Отображение холста")}>
          <Chip on={s.bgDots} onClick={s.onToggleBgDots}>{t("Точки на фоне")}</Chip>
          <Chip on={s.guidesV} onClick={s.onToggleGuidesV} title={t("Границы блоков")}>{t("Вертикальные направляющие")}</Chip>
          <Chip on={s.guidesH} onClick={s.onToggleGuidesH} title={t("Уровни Base / Junior / Middle / Senior")}>{t("Горизонтальные направляющие")}</Chip>
        </div>
      </div>

      <div className="settings__group">
        <div className="settings__title">{t("Панели")}</div>
        <div className="settings__chips" role="group" aria-label={t("Панели")}>
          <Chip on={s.agendaOpen} onClick={s.onToggleAgenda} title={t("Сайдбар со списком вопросов")}>{t("Агенда")}</Chip>
          <Chip on={s.showHidden} onClick={s.onToggleHidden} title={t("Показывать вопросы, убранные с доски")}>
            {t("Скрытые вопросы")}{s.hiddenCount ? ` (${s.hiddenCount})` : ""}
          </Chip>
          <Chip on={s.showTimer} onClick={s.onToggleTimer} title={t("Время на вопрос и на сессию в нижней панели")}>{t("Таймер")}</Chip>
        </div>
      </div>

      <div className="settings__group">
        <div className="settings__title">{t("Банк вопросов")}</div>
        <a className="setdrawer__act" href={s.bankHref}>{t("Открыть банк направления →")}</a>
      </div>

      <div className="settings__group">
        <div className="settings__title">{t("Справка")}</div>
        <button className="setdrawer__act helpbtn" onClick={() => { onClose(); s.onShowHelp(); }}>{t("Горячие клавиши")}</button>
      </div>
    </div>
  );
}
