import { useLang, useT } from "../i18n";

// Переключатель языка интерфейса: показывает язык, НА который переключит (EN при русском).
export function LangSwitch() {
  const [lang, setLang] = useLang();
  const t = useT();
  const next = lang === "en" ? "ru" : "en";
  return (
    <button
      className="langswitch iconbtn btn--quiet"
      aria-label="Switch language"
      aria-pressed={lang === "en"}
      title={next === "en" ? t("English") : t("Русский")}
      onClick={() => setLang(next)}
    >
      {next.toUpperCase()}
    </button>
  );
}
