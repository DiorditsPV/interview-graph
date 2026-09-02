import { useEffect, useState } from "react";
import { api } from "./api";
import BoardPage from "./pages/BoardPage";
import { BankPage } from "./pages/BankPage";
import { CandidatesPage } from "./pages/CandidatesPage";
import { ConnectPage } from "./pages/ConnectPage";
import { HomePage } from "./pages/HomePage";
import { SessionsPage } from "./pages/SessionsPage";
import { useRoute } from "./router";
import type { PoolConfig } from "./types";

// Раздаёт страницы по маршруту. Список пулов грузится один раз на вход: он нужен и меню,
// и доске (таксономия колонок), и банку. Неизвестный пул в адресе → меню с пометкой.
export default function Router() {
  const route = useRoute();
  const [pools, setPools] = useState<PoolConfig[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reloadPools = () => api.pools().then(setPools).catch((e) => setError(String(e)));
  useEffect(() => {
    reloadPools();
  }, []);

  if (error) return <div className="loading">Не удалось загрузить направления: {error}</div>;
  if (!pools) return <div className="loading">Загрузка…</div>;

  const poolOf = (id: string) => pools.find((p) => p.id === id) ?? null;

  switch (route.name) {
    case "board": {
      const pool = poolOf(route.pool);
      if (!pool) return <HomePage pools={pools} notice={`Направления «${route.pool}» нет`} onChanged={reloadPools} />;
      // key — чтобы смена пула пересоздавала доску целиком (состояние, таймеры, SSE).
      return <BoardPage key={pool.id} pool={pool} sessionFromUrl={route.session} />;
    }
    case "bank": {
      const pool = poolOf(route.pool);
      if (!pool) return <HomePage pools={pools} notice={`Направления «${route.pool}» нет`} onChanged={reloadPools} />;
      return <BankPage key={pool.id} pool={pool} onChanged={reloadPools} />;
    }
    case "candidates":
      return <CandidatesPage pools={pools} />;
    case "sessions":
      return <SessionsPage pools={pools} />;
    case "connect":
      return <ConnectPage pools={pools} />;
    default:
      return <HomePage pools={pools} startPool={route.name === "home" ? route.start : null} onChanged={reloadPools} />;
  }
}
