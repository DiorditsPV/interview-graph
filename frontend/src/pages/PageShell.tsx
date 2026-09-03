import type { ReactNode } from "react";
import { LangSwitch } from "../components/LangSwitch";
import { useT } from "../i18n";
import { href } from "../router";

// Каркас всех страниц, кроме доски: тонкая полоса «← Меню · заголовок [· действия · RU/EN]»,
// ниже — содержимое. Оформление (37 и альтернативы) приходит через те же токены.
export function PageShell({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="page">
      <header className="pageshell">
        <a className="pageshell__back" href={href.home}>{t("← Меню")}</a>
        <h1 className="pageshell__title">{title}</h1>
        <div className="pageshell__actions">
          {actions}
          <LangSwitch />
        </div>
      </header>
      <main className="page__body">{children}</main>
    </div>
  );
}
