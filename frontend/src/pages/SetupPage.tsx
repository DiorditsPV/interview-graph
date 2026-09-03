import { Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, type PlanIn } from "../api";
import { nWord, useT } from "../i18n";
import { DIFFS } from "../layout";
import { href, navigate, type SetupInit } from "../router";
import type { Candidate, Difficulty, PoolConfig, QNode } from "../types";
import { PageShell } from "./PageShell";

// Настройка интервью (инкремент 1 закрытия v1): кандидат → разделы и под-колонки → уровни →
// режим набора → «Начать интервью». Сервер собирает план (sessions.plan), доска ведёт по нему.
// Точки входа: карточка направления на главной и «Начать интервью →» на доске (передаёт фильтры).
const AUTO_DEFAULT = 7;

export function SetupPage({ pool, initial }: { pool: PoolConfig; initial: SetupInit }) {
  const t = useT();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [seniority, setSeniority] = useState("");
  const [nodes, setNodes] = useState<QNode[]>([]);
  const [blocks, setBlocks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(pool.blocks.map((b) => [b.id, !initial.blocks || initial.blocks.includes(b.id)])),
  );
  const [subs, setSubs] = useState<Record<string, Record<string, boolean>>>(() =>
    Object.fromEntries(
      pool.blocks.map((b) => [
        b.id,
        Object.fromEntries(b.subblocks.map((s) => [s.id, !initial.subs?.[b.id] || initial.subs[b.id].includes(s.id)])),
      ]),
    ),
  );
  const [diffs, setDiffs] = useState<Record<Difficulty, boolean>>(
    () => Object.fromEntries(DIFFS.map((d) => [d, !initial.diffs || initial.diffs.includes(d)])) as Record<Difficulty, boolean>,
  );
  const [mode, setMode] = useState<"manual" | "auto">("auto");
  const [count, setCount] = useState(AUTO_DEFAULT);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listCandidates().then(setCandidates).catch(() => setCandidates([]));
    api.graph(pool.id).then((g) => setNodes(g.nodes)).catch(() => setNodes([]));
  }, [pool.id]);

  // Под-колонки ограничивают раздел, только если сняты не все: тогда ноды без под-колонки в этом
  // разделе выпадают — так же считает сервер (sampler.filter_nodes).
  const restricted = (block: string): string[] | null => {
    const m = subs[block] ?? {};
    const ids = Object.keys(m);
    if (!ids.length) return null;
    const on = ids.filter((s) => m[s]);
    return on.length === ids.length ? null : on;
  };
  const matching = useMemo(
    () =>
      nodes.filter((n) => {
        if (!blocks[n.block]) return false;
        const r = restricted(n.block);
        if (r && !(n.subblock && r.includes(n.subblock))) return false;
        return diffs[n.difficulty];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, blocks, subs, diffs],
  );
  const planSize = mode === "auto" ? Math.min(count, matching.length) : matching.length;
  const candidateOk = pickedId != null || name.trim() !== "";
  const canStart = candidateOk && planSize > 0 && !busy;

  const toggleBlock = (id: string) => setBlocks((s) => ({ ...s, [id]: !s[id] }));
  const toggleSub = (block: string, id: string) =>
    setSubs((s) => ({ ...s, [block]: { ...s[block], [id]: !s[block]?.[id] } }));
  const toggleDiff = (d: Difficulty) => setDiffs((s) => ({ ...s, [d]: !s[d] }));

  const start = async () => {
    if (!canStart) return;
    setBusy(true);
    let candidateId = pickedId;
    let candName = name.trim();
    if (candidateId != null) candName = candidates.find((c) => c.id === candidateId)?.name ?? candName;
    try {
      if (candidateId == null) {
        try {
          const created = await api.createCandidate({
            name: candName,
            position: position.trim() || undefined,
            seniority: seniority.trim() || undefined,
          });
          candidateId = created.id;
        } catch {
          /* при сбое создания кандидата сессия всё равно стартует по свободному имени */
        }
      }
      const chosenBlocks = pool.blocks.map((b) => b.id).filter((b) => blocks[b]);
      const subblocks: Record<string, string[]> = {};
      for (const b of chosenBlocks) {
        const r = restricted(b);
        if (r) subblocks[b] = r;
      }
      const chosenDiffs = DIFFS.filter((d) => diffs[d]);
      const plan: PlanIn = {
        mode,
        blocks: chosenBlocks,
        subblocks: Object.keys(subblocks).length ? subblocks : undefined,
        difficulties: chosenDiffs.length === DIFFS.length ? undefined : chosenDiffs,
        count: mode === "auto" ? count : undefined,
      };
      const s = await api.createSession(pool.id, candName || "—", candidateId ?? undefined, undefined, plan);
      // Именованная сессия персистит в БД — локальный черновик оценок больше не нужен;
      // таймер интервью стартует здесь, доска читает timerStart:<pool>.
      localStorage.removeItem(`draftScores:${pool.id}`);
      localStorage.setItem(`timerStart:${pool.id}`, String(Date.now()));
      navigate(href.board(pool.id, s.id));
    } catch {
      alert(t("Не удалось начать сессию"));
      setBusy(false);
    }
  };

  const qWord = (n: number) => `${n} ${nWord(n, ["вопрос", "вопроса", "вопросов"], ["question", "questions"])}`;

  return (
    <PageShell title={t("Настройка интервью · {pool}", { pool: pool.label })}>
      <div className="setup">
        <section className="setup__section">
          <h3 className="setup__h3">{t("Кандидат")}</h3>
          <div className="setup__row">
            {candidates.length > 0 && (
              <select
                className="cand-pick"
                value={pickedId ?? ""}
                title={t("Выбрать существующего кандидата")}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  setPickedId(v);
                  if (v != null) setName("");
                }}
              >
                <option value="">{t("Новый кандидат…")}</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.seniority ? ` · ${c.seniority}` : ""}
                  </option>
                ))}
              </select>
            )}
            {pickedId == null && (
              <>
                <input className="setup__name" placeholder={t("Кандидат…")} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                <input className="cand-pos" placeholder={t("Позиция (опц.)")} value={position} onChange={(e) => setPosition(e.target.value)} />
                <input className="cand-sen" placeholder={t("Грейд (опц.)")} value={seniority} onChange={(e) => setSeniority(e.target.value)} />
              </>
            )}
          </div>
        </section>

        <section className="setup__section">
          <h3 className="setup__h3">{t("Разделы")}</h3>
          <div className="setup__blocks">
            {pool.blocks.map((b) => (
              <div key={b.id} className="setup__block" data-block={b.id}>
                <label className="setup__check setup__check--block">
                  <input type="checkbox" checked={!!blocks[b.id]} onChange={() => toggleBlock(b.id)} />
                  <span className="setup__dot" style={{ background: b.color }} aria-hidden="true" />
                  {b.label}
                </label>
                {b.subblocks.length > 0 && (
                  <div className="setup__subs">
                    {b.subblocks.map((s) => (
                      <label key={s.id} className="setup__check" data-sub={s.id}>
                        <input
                          type="checkbox"
                          disabled={!blocks[b.id]}
                          checked={!!subs[b.id]?.[s.id]}
                          onChange={() => toggleSub(b.id, s.id)}
                        />
                        {s.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="setup__section">
          <h3 className="setup__h3">{t("Уровни")}</h3>
          <div className="setup__row">
            {DIFFS.map((d) => (
              <label key={d} className="setup__check" data-diff={d}>
                <input type="checkbox" checked={!!diffs[d]} onChange={() => toggleDiff(d)} />
                {d}
              </label>
            ))}
          </div>
        </section>

        <section className="setup__section">
          <h3 className="setup__h3">{t("Набор вопросов")}</h3>
          <div className="setup__modes">
            <label className="setup__check">
              <input type="radio" name="mode" checked={mode === "auto"} onChange={() => setMode("auto")} />
              {t("Автоподбор по весам разделов")}
              <input
                className="setup__count"
                type="number"
                min={1}
                max={200}
                value={count}
                disabled={mode !== "auto"}
                onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
              />
            </label>
            <label className="setup__check">
              <input type="radio" name="mode" checked={mode === "manual"} onChange={() => setMode("manual")} />
              {t("Все подходящие в порядке матрицы")}
            </label>
          </div>
          <div className={`setup__summary ${planSize === 0 ? "setup__summary--empty" : ""}`}>
            {planSize > 0
              ? t("В интервью войдёт {n}", { n: qWord(planSize) })
              : t("Под выбранные условия нет вопросов")}
            <span className="muted"> · {t("подходит {n}", { n: qWord(matching.length) })}</span>
          </div>
        </section>

        <div className="setup__actions">
          <a className="iconbtn" href={href.board(pool.id)}>{t("Отмена")}</a>
          <button className="btn--primary setup__start" onClick={start} disabled={!canStart}>
            <Play size={15} strokeWidth={2} aria-hidden="true" />
            {t("Начать интервью →")}
          </button>
        </div>
      </div>
    </PageShell>
  );
}
