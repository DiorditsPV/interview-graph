import { useEffect, useState } from "react";

import Router, { type GuestTarget } from "./Router.tsx";
import { api } from "./api";
import { Login } from "./components/Login";
import { href, navigate } from "./router";

// auth-identity (#36): обёртка над Router. Проверяет сессию через /api/auth/me;
// 401 → экран входа, иначе рендерит роутер страниц. Router не трогаем — его data-эффекты
// стартуют только когда AuthGate отрендерит <Router/> (после успешной аутентификации).
// v1-closure: ссылка-приглашение #/join/<token> — гостевой вход без аккаунта; гость ограничен
// одной сессией, поэтому Router получает её как guestTarget и показывает только эту доску.
export function AuthGate() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [guest, setGuest] = useState<GuestTarget | null>(null);

  useEffect(() => {
    const boot = async () => {
      try {
        const m = window.location.hash.match(/^#\/join\/([^/?#]+)/);
        if (m) {
          const j = await api.join(m[1]);
          navigate(href.board(j.pool, j.session_id));
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
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;
  return <Router guest={guest} />;
}
