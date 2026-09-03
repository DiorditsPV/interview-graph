import { useEffect, useState } from "react";
import { api } from "./api";
import BoardPage from "./pages/BoardPage";
import { BankPage } from "./pages/BankPage";
import { CandidatesPage } from "./pages/CandidatesPage";
import { ConnectPage } from "./pages/ConnectPage";
import { HomePage } from "./pages/HomePage";
import { SessionsPage } from "./pages/SessionsPage";
import { SetupPage } from "./pages/SetupPage";
import { useRoute } from "./router";
import { useT } from "./i18n";
import type { PoolConfig } from "./types";

// Гость по ссылке-приглашению: единственная доступная страница — доска его сессии.
export interface GuestTarget {
  pool: string;
  session: number;
}

// Раздаёт страницы по маршруту. Список пулов грузится один раз на вход: он нужен и меню,
// и доске (таксономия колонок), и банку. Неизвестный пул в адресе → меню с пометкой.
export default function Router({ guest = null }: { guest?: GuestTarget | null }) {
  const t = useT();
  const route = useRoute();
  const [pools, setPools] = useState<PoolConfig[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reloadPools = () => api.pools().then(setPools).catch((e) => setError(String(e)));
  useEffect(() => {
    reloadPools();
  }, []);

  if (error) return <div className="loading">{t("Не удалось загрузить направления: {error}", { error })}</div>;
  if (!pools) return <div className="loading">{t("Загрузка…")}</div>;

  const poolOf = (id: string) => pools.find((p) => p.id === id) ?? null;

  // Гость: любой адрес ведёт на доску его сессии (другие страницы и сессии ему закрыты API).
  if (guest) {
    const pool = poolOf(guest.pool);
    if (!pool) return <div className="loading">{t("Направления «{pool}» нет", { pool: guest.pool })}</div>;
    return <BoardPage key={`guest-${guest.session}`} pool={pool} sessionFromUrl={guest.session} guest />;
  }

  switch (route.name) {
    case "board": {
      const pool = poolOf(route.pool);
      if (!pool) return <HomePage pools={pools} notice={t("Направления «{pool}» нет", { pool: route.pool })} onChanged={reloadPools} />;
      // key — чтобы смена пула пересоздавала доску целиком (состояние, таймеры, SSE).
      return <BoardPage key={pool.id} pool={pool} sessionFromUrl={route.session} />;
    }
    case "bank": {
      const pool = poolOf(route.pool);
      if (!pool) return <HomePage pools={pools} notice={t("Направления «{pool}» нет", { pool: route.pool })} onChanged={reloadPools} />;
      return <BankPage key={pool.id} pool={pool} onChanged={reloadPools} />;
    }
    case "setup": {
      const pool = poolOf(route.pool);
      if (!pool) return <HomePage pools={pools} notice={t("Направления «{pool}» нет", { pool: route.pool })} onChanged={reloadPools} />;
      return <SetupPage key={pool.id} pool={pool} initial={route.init} />;
    }
    case "candidates":
      return <CandidatesPage pools={pools} />;
    case "sessions":
      return <SessionsPage pools={pools} />;
    case "connect":
      return <ConnectPage pools={pools} />;
    default: {
      // Старый deep-link #/?start=<pool> — та же настройка интервью.
      const startPool = route.name === "home" && route.start ? poolOf(route.start) : null;
      if (startPool) return <SetupPage key={startPool.id} pool={startPool} initial={{}} />;
      return <HomePage pools={pools} onChanged={reloadPools} />;
    }
  }
}
