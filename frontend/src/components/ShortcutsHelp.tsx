import { useEffect } from "react";

// Шпаргалка горячих клавиш. Пока открыта — перехватывает ВСЮ клавиатуру в capture-фазе
// (stopImmediatePropagation), чтобы прочие хоткеи не срабатывали; Esc/«?» закрывают. Capture-фаза
// гарантирует приоритет над bubble-listener'ами App/DetailDrawer независимо от ре-рендеров.
const SHORTCUTS: [string[], string][] = [
  [["1", "…", "5"], "оценить текущий вопрос"],
  [["Enter"], "открыть карточку текущего вопроса"],
  [["n"], "перейти к следующему неоценённому"],
  [["↑", "↓", "←", "→"], "навигация по сетке вопросов"],
  [["Esc"], "снять выделение / закрыть эту шпаргалку"],
  [["?"], "показать / скрыть эту шпаргалку"],
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation(); // захват: глушим прочие хоткеи, пока шпаргалка открыта
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [onClose]);

  return (
    <div className="help-modal" onClick={onClose}>
      <div className="help-modal__card" onClick={(e) => e.stopPropagation()}>
        <div className="help-modal__head">
          <strong>Горячие клавиши</strong>
          <button className="help-modal__close" onClick={onClose} title="Закрыть (Esc)">
            ✕
          </button>
        </div>
        <div className="help-modal__list">
          {SHORTCUTS.map(([keys, desc]) => (
            <div className="help-row" key={desc}>
              <span className="help-row__keys">
                {keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </span>
              <span className="help-row__desc">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
