import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { EN } from "./i18n/en";

// Локализация без библиотек: ключ — русская строка ровно как в коде, перевод — из словаря EN
// (i18n/en.ts). Нет перевода → показываем русскую строку: ничего не ломается, просто не переведено.
// Подстановки — {name} через vars. Контент (вопросы, подписи из pool.yaml) не переводится.
export type Lang = "ru" | "en";
type Vars = Record<string, string | number>;

function readLang(): Lang {
  try {
    return localStorage.getItem("lang") === "en" ? "en" : "ru";
  } catch {
    return "ru";
  }
}

// Модульное состояние: `t` нужна и вне React (report.ts генерирует HTML отчёта).
let current: Lang = readLang();

export function getLang(): Lang {
  return current;
}

export function t(s: string, vars?: Vars): string {
  const out = current === "en" ? (EN[s] ?? s) : s;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : out;
}

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: current,
  setLang: () => void 0,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);
  const setLang = useCallback((l: Lang) => {
    current = l;
    try {
      localStorage.setItem("lang", l);
    } catch {
      /* приватный режим — язык живёт до перезагрузки */
    }
    setLangState(l);
  }, []);
  useEffect(() => {
    // index.html вне React-дерева: lang и заголовок вкладки подтягиваем к выбранному языку здесь.
    document.documentElement.lang = lang;
    document.title = t("Интервью · граф вопросов");
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useLang(): [Lang, (l: Lang) => void] {
  const { lang, setLang } = useContext(LangCtx);
  return [lang, setLang];
}

/** `t`, привязанная к контексту: компонент перерисуется при смене языка. */
export function useT(): typeof t {
  useContext(LangCtx);
  return t;
}
