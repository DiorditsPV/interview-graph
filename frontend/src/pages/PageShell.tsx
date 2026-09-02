import type { ReactNode } from "react";
import { href } from "../router";

// Каркас всех страниц, кроме доски: тонкая полоса «← Меню · заголовок [· действия]»,
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
  return (
    <div className="page">
      <header className="pageshell">
        <a className="pageshell__back" href={href.home}>← Меню</a>
        <h1 className="pageshell__title">{title}</h1>
        {actions && <div className="pageshell__actions">{actions}</div>}
      </header>
      <main className="page__body">{children}</main>
    </div>
  );
}
