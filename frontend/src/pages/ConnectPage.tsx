import { useEffect, useState } from "react";
import { api } from "../api";
import { href } from "../router";
import type { PoolConfig, SessionMeta } from "../types";
import { PageShell } from "./PageShell";

// Подключение к идущей сессии (второй интервьюер / HR): выбор из последних сессий →
// доска нужного направления с ?session=, где SSE подтянет оценки.
export function ConnectPage({ pools }: { pools: PoolConfig[] }) {
  const [rows, setRows] = useState<SessionMeta[]>([]);
  useEffect(() => { api.listSessions().then(setRows).catch(() => setRows([])); }, []);
  const label = (id: string) => pools.find((p) => p.id === id)?.label ?? id;
  return (
    <PageShell title="Подключиться к сессии">
      <p className="muted">Откроется доска направления с оценками этой сессии; дальнейшие оценки синхронизируются live.</p>
      <div className="home__sections">
        {rows.slice(0, 30).map((s) => (
          <a key={s.id} className="menucard" href={href.board(s.pool, s.id)}>
            <strong>{s.candidate}</strong>
            <span>{label(s.pool)} · {s.created_at.slice(0, 16).replace("T", " ")}</span>
          </a>
        ))}
      </div>
      {rows.length === 0 && <p className="muted">Нет сессий, к которым можно подключиться.</p>}
    </PageShell>
  );
}
