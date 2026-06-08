import { useEffect, useState } from "react";

import App from "./App";
import { api } from "./api";
import { Login } from "./components/Login";

// auth-identity (#36): обёртка над App. Проверяет сессию через /api/auth/me;
// 401 → экран входа, иначе рендерит доску. App не трогаем — его data-эффекты
// стартуют только когда AuthGate отрендерит <App/> (после успешной аутентификации).
export function AuthGate() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .me()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null; // первичная проверка сессии
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;
  return <App />;
}
