import { useEffect, useState } from "react";
import { api } from "../api";
import { href } from "../router";
import { useT } from "../i18n";
import type { Candidate, Interviewer, PoolConfig, SessionMeta } from "../types";
import { PageShell } from "./PageShell";

const EMPTY_C = { name: "", position: "", seniority: "", contact: "", note: "" };
const EMPTY_I = { name: "", role: "", email: "" };

// Справочник людей: кандидаты (с их сессиями по направлениям) и интервьюеры. Общие для всех пулов.
export function CandidatesPage({ pools }: { pools: PoolConfig[] }) {
  const t = useT();
  const [cands, setCands] = useState<Candidate[]>([]);
  const [ivs, setIvs] = useState<Interviewer[]>([]);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [draft, setDraft] = useState(EMPTY_C);
  const [ivDraft, setIvDraft] = useState(EMPTY_I);
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState(EMPTY_C);

  const load = () => {
    api.listCandidates().then(setCands).catch(() => setCands([]));
    api.listInterviewers().then(setIvs).catch(() => setIvs([]));
    api.listSessions().then(setSessions).catch(() => setSessions([]));
  };
  useEffect(load, []);

  const poolLabel = (id: string) => pools.find((p) => p.id === id)?.label ?? id;
  const clean = (o: typeof EMPTY_C) => ({
    name: o.name.trim(),
    position: o.position.trim() || undefined,
    seniority: o.seniority.trim() || undefined,
    contact: o.contact.trim() || undefined,
    note: o.note.trim() || undefined,
  });

  const addCandidate = async () => {
    if (!draft.name.trim()) return;
    await api.createCandidate(clean(draft));
    setDraft(EMPTY_C);
    load();
  };
  const saveEdit = async () => {
    if (editId == null || !edit.name.trim()) return;
    await api.updateCandidate(editId, clean(edit));
    setEditId(null);
    load();
  };
  const addInterviewer = async () => {
    if (!ivDraft.name.trim()) return;
    await api.createInterviewer({ name: ivDraft.name.trim(), role: ivDraft.role.trim() || undefined, email: ivDraft.email.trim() || undefined });
    setIvDraft(EMPTY_I);
    load();
  };

  return (
    <PageShell title={t("Кандидаты и интервьюеры")}>
      <h2 className="home__h2">{t("Кандидаты")} · {cands.length}</h2>
      <div className="formrow">
        <input placeholder={t("Имя")} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input placeholder={t("Позиция")} value={draft.position} onChange={(e) => setDraft({ ...draft, position: e.target.value })} />
        <input placeholder={t("Грейд")} value={draft.seniority} onChange={(e) => setDraft({ ...draft, seniority: e.target.value })} />
        <input placeholder={t("Контакт")} value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} />
        <button className="btn--primary cand-add" onClick={addCandidate} disabled={!draft.name.trim()}>{t("Добавить")}</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{t("Имя")}</th><th>{t("Позиция")}</th><th>{t("Грейд")}</th><th>{t("Контакт")}</th><th>{t("Сессии")}</th><th></th></tr></thead>
          <tbody>
            {cands.map((c) =>
              editId === c.id ? (
                <tr key={c.id} className="table__edit">
                  <td><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></td>
                  <td><input value={edit.position} onChange={(e) => setEdit({ ...edit, position: e.target.value })} /></td>
                  <td><input value={edit.seniority} onChange={(e) => setEdit({ ...edit, seniority: e.target.value })} /></td>
                  <td><input value={edit.contact} onChange={(e) => setEdit({ ...edit, contact: e.target.value })} /></td>
                  <td />
                  <td><button className="btn--primary" onClick={saveEdit}>{t("Сохранить")}</button> <button onClick={() => setEditId(null)}>{t("Отмена")}</button></td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <td>{c.name}</td><td>{c.position ?? "—"}</td><td>{c.seniority ?? "—"}</td><td>{c.contact ?? "—"}</td>
                  <td>
                    {sessions.filter((s) => s.candidate_id === c.id).map((s) => (
                      <a key={s.id} className="table__link" href={href.board(s.pool, s.id)}>{poolLabel(s.pool)} · {s.created_at.slice(0, 10)}</a>
                    ))}
                  </td>
                  <td><button onClick={() => { setEditId(c.id); setEdit({ name: c.name, position: c.position ?? "", seniority: c.seniority ?? "", contact: c.contact ?? "", note: c.note ?? "" }); }}>{t("Изменить")}</button></td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      <h2 className="home__h2">{t("Интервьюеры")} · {ivs.length}</h2>
      <div className="formrow">
        <input placeholder={t("Имя")} value={ivDraft.name} onChange={(e) => setIvDraft({ ...ivDraft, name: e.target.value })} />
        <input placeholder={t("Роль")} value={ivDraft.role} onChange={(e) => setIvDraft({ ...ivDraft, role: e.target.value })} />
        <input placeholder="Email" value={ivDraft.email} onChange={(e) => setIvDraft({ ...ivDraft, email: e.target.value })} />
        <button className="btn--primary" onClick={addInterviewer} disabled={!ivDraft.name.trim()}>{t("Добавить")}</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{t("Имя")}</th><th>{t("Роль")}</th><th>Email</th></tr></thead>
          <tbody>{ivs.map((i) => <tr key={i.id}><td>{i.name}</td><td>{i.role ?? "—"}</td><td>{i.email ?? "—"}</td></tr>)}</tbody>
        </table>
      </div>
    </PageShell>
  );
}
