import { useEffect, useState } from "react";
import { api } from "../api";
import { decisionLabel } from "../components/FinishModal";
import { downloadReport } from "../report";
import { href } from "../router";
import { useT } from "../i18n";
import { notesOf, scoresOf } from "../sessionUtils";
import type { Interviewer, PoolConfig, Session, SessionMeta } from "../types";
import { PageShell } from "./PageShell";

type Tab = "all" | "active" | "finished";

// Все сессии всех направлений: статус (идёт / завершена), решение, открыть на доске, отчёт.
// «Оценено» — из детали сессии (одна подгрузка на строку; для локального инструмента это дёшево);
// знаменатель — план сессии, если он есть, иначе весь банк направления.
export function SessionsPage({ pools }: { pools: PoolConfig[] }) {
  const t = useT();
  const [rows, setRows] = useState<SessionMeta[]>([]);
  const [details, setDetails] = useState<Record<number, Session>>({});
  const [ivs, setIvs] = useState<Interviewer[]>([]);
  const [tab, setTab] = useState<Tab>("all");

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
    downloadReport(full.candidate, nodes, scoresOf(full), pool, notesOf(full), { interviewer: iv?.name ?? null, position: null, seniority: null }, full);
  };

  const visible = rows.filter((s) => tab === "all" || (s.status ?? "active") === tab);
  const counts = {
    all: rows.length,
    active: rows.filter((s) => (s.status ?? "active") === "active").length,
    finished: rows.filter((s) => s.status === "finished").length,
  };

  return (
    <PageShell title={t("Сессии")}>
      <div className="tabs" role="tablist">
        {(["all", "active", "finished"] as Tab[]).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={`tabs__tab ${tab === k ? "tabs__tab--on" : ""}`}
            data-tab={k}
            onClick={() => setTab(k)}
          >
            {k === "all" ? t("Все") : k === "active" ? t("Идут") : t("Завершены")} · {counts[k]}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="table sessions">
          <thead>
            <tr>
              <th>{t("Направление")}</th>
              <th>{t("Кандидат")}</th>
              <th>{t("Статус")}</th>
              <th>{t("Решение")}</th>
              <th>{t("Интервьюер")}</th>
              <th>{t("Дата")}</th>
              <th>{t("Оценено")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => {
              const pool = poolOf(s.pool);
              const scored = details[s.id] ? Object.keys(details[s.id].scores).length : null;
              const total = s.plan_count ?? pool?.counts?.nodes ?? "?";
              const finished = s.status === "finished";
              return (
                <tr key={s.id} data-session={s.id} data-status={s.status ?? "active"}>
                  <td>{pool?.label ?? s.pool}</td>
                  <td>{s.candidate}</td>
                  <td>
                    <span className={`badge ${finished ? "badge--done" : "badge--live"}`}>
                      {finished ? t("Завершена") : t("Идёт")}
                    </span>
                  </td>
                  <td>
                    {s.decision ? (
                      <span className={`badge badge--${s.decision}`} title={s.summary ?? ""}>{decisionLabel(t, s.decision)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{ivs.find((i) => i.id === s.interviewer_id)?.name ?? "—"}</td>
                  <td>{s.created_at.slice(0, 16).replace("T", " ")}</td>
                  <td>{scored == null ? "…" : `${scored} / ${total}`}</td>
                  <td>
                    <a className="iconbtn" href={href.board(s.pool, s.id)}>{t("Открыть")}</a>{" "}
                    <button className="iconbtn" onClick={() => report(s)} disabled={!details[s.id] || scored === 0}>{t("Отчёт")}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="muted">{t("Сессий пока нет — начните интервью с главной.")}</p>}
    </PageShell>
  );
}
