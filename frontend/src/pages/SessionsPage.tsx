import { useEffect, useState } from "react";
import { api } from "../api";
import { downloadReport } from "../report";
import { href } from "../router";
import { notesOf, scoresOf } from "../sessionUtils";
import type { Interviewer, PoolConfig, Session, SessionMeta } from "../types";
import { PageShell } from "./PageShell";

// Все сессии всех направлений: открыть на доске или скачать отчёт. «Оценено» — из детали
// сессии (одна подгрузка на строку; для локального инструмента это дёшево).
export function SessionsPage({ pools }: { pools: PoolConfig[] }) {
  const [rows, setRows] = useState<SessionMeta[]>([]);
  const [details, setDetails] = useState<Record<number, Session>>({});
  const [ivs, setIvs] = useState<Interviewer[]>([]);

  useEffect(() => {
    api.listSessions().then(async (list) => {
      setRows(list);
      const full = await Promise.all(list.map((s) => api.getSession(s.id).catch(() => null)));
      setDetails(Object.fromEntries(full.filter((s): s is Session => !!s).map((s) => [s.id, s])));
    }).catch(() => setRows([]));
    api.listInterviewers().then(setIvs).catch(() => setIvs([]));
  }, []);

  const poolOf = (id: string) => pools.find((p) => p.id === id);
  const report = async (s: SessionMeta) => {
    const pool = poolOf(s.pool);
    const full = details[s.id];
    if (!pool || !full) return;
    const nodes = (await api.graph(pool.id)).nodes;
    const iv = ivs.find((i) => i.id === full.interviewer_id);
    downloadReport(full.candidate, nodes, scoresOf(full), pool, notesOf(full), { interviewer: iv?.name ?? null, position: null, seniority: null });
  };

  return (
    <PageShell title="Сессии">
      <table className="table sessions">
        <thead><tr><th>Направление</th><th>Кандидат</th><th>Интервьюер</th><th>Дата</th><th>Оценено</th><th></th></tr></thead>
        <tbody>
          {rows.map((s) => {
            const pool = poolOf(s.pool);
            const scored = details[s.id] ? Object.keys(details[s.id].scores).length : null;
            return (
              <tr key={s.id} data-session={s.id}>
                <td>{pool?.label ?? s.pool}</td>
                <td>{s.candidate}</td>
                <td>{ivs.find((i) => i.id === s.interviewer_id)?.name ?? "—"}</td>
                <td>{s.created_at.slice(0, 16).replace("T", " ")}</td>
                <td>{scored == null ? "…" : `${scored} / ${pool?.counts?.nodes ?? "?"}`}</td>
                <td>
                  <a className="iconbtn" href={href.board(s.pool, s.id)}>Открыть</a>{" "}
                  <button className="iconbtn" onClick={() => report(s)} disabled={!details[s.id] || scored === 0}>Отчёт</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">Сессий пока нет — начните интервью с доски направления.</p>}
    </PageShell>
  );
}
