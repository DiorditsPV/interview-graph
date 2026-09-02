import { useState, type FormEvent } from "react";

import { api } from "../api";

// auth-identity (#36): экран входа. Показывается AuthGate, когда /api/auth/me даёт 401.
// Успешный логин ставит HttpOnly-cookie сессии → onLogin() переключает на доску.
export function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password);
      onLogin();
    } catch {
      setError("Неверный email или пароль");
      setBusy(false);
    }
  };

  return (
    <div
      className="login"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f172a",
      }}
    >
      <form
        className="login__card"
        onSubmit={submit}
        // Логин на бэкенде — непрозрачная строка (LoginIn.email: str, min_length=1), а не
        // обязательно адрес: INTERVIEW_OWNER_EMAIL может быть и «admin». type="email"
        // оставлен ради подсказки клавиатуры, но браузерную проверку формата снимаем,
        // иначе такой аккаунт нельзя ввести в форму.
        noValidate
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          width: 320,
          padding: 28,
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 10px 40px rgba(0,0,0,.3)",
        }}
      >
        <h2 style={{ margin: 0, color: "#1e293b" }}>Вход</h2>
        <input
          className="login__input"
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          required
          style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8 }}
        />
        <input
          className="login__input"
          type="password"
          placeholder="пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8 }}
        />
        {error && (
          <div className="login__error" style={{ color: "#dc2626", fontSize: 13 }}>
            {error}
          </div>
        )}
        <button
          className="btn btn--primary"
          type="submit"
          disabled={busy}
          style={{ padding: "10px 12px" }}
        >
          {busy ? "…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
