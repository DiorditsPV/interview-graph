import { useEffect, useState } from "react";

import Router, { type GuestTarget } from "./Router.tsx";
import { api } from "./api";
import { Login } from "./components/Login";
import { t } from "./i18n";
import { href, navigate } from "./router";

// auth-identity (#36): обёртка над Router. Проверяет сессию через /api/auth/me;
// 401 → экран входа, иначе рендерит роутер страниц. Router не трогаем — его data-эффекты
// стартуют только когда AuthGate отрендерит <Router/> (после успешной аутентификации).
// v1-closure: ссылка-приглашение #/join/<token> — гостевой вход без аккаунта; гость ограничен
// одной сессией, поэтому Router получает её как guestTarget и показывает только эту доску.
// Недействительная ссылка (отозвана, истекла, не существует) — экран входа с пояснением.
export function AuthGate() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [guest, setGuest] = useState<GuestTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const boot = async () => {
      try {
        const m = window.location.hash.match(/^#\/join\/([^/?#]+)/);
        if (m) {
          try {
            const j = await api.join(m[1]);
            navigate(href.board(j.pool, j.session_id));
          } catch (e) {
            const msg = String(e);
            setNotice(msg.includes("410") ? t("Ссылка отозвана или её срок истёк") : t("Ссылка недействительна"));
            navigate(href.home);
          }
        }
        const me = await api.me();
        if (me.guest && me.scope_session_id) {
          const s = await api.getSession(me.scope_session_id);
          setGuest({ pool: s.pool, session: s.id });
        }
        setAuthed(true);
      } catch {
        setAuthed(false);
      }
    };
    boot();
  }, []);

  if (authed === null) return null; // первичная проверка сессии
  if (!authed) return <Login onLogin={() => setAuthed(true)} notice={notice} />;
  return <Router guest={guest} />;
}
