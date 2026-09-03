import { useEffect, useState } from "react";
import { api } from "../api";
import { LangSwitch } from "../components/LangSwitch";
import { PoolFormModal } from "../components/PoolFormModal";
import { StartSessionForm } from "../components/StartSessionForm";
import { nWord, useT } from "../i18n";
import { href } from "../router";
import type { PoolConfig } from "../types";

type PoolModal = { mode: "create" } | { mode: "edit"; pool: PoolConfig } | null;

// Главное меню: направления как входы на доски + разделы проведения интервью (кандидаты, сессии,
// подключение). Карточка направления: название, описание, статистика, нейтральные чипы колонок,
// primary «Начать интервью →», secondary «Открыть вопросы →», меню ••• (редактировать/удалить).
// Пулов может не быть вовсе (content/ без pool.yaml) — говорим об этом, а не рисуем пустоту.
// startPool — пул из deep-link #/?start=<pool>: форма старта интервью открывается сразу.
// onChanged — направления создаются/правятся/удаляются здесь же (pool-crud); список живёт в Router.
export function HomePage({
  pools,
  notice,
  startPool: startPool0,
  onChanged,
}: { pools: PoolConfig[]; notice?: string; startPool?: string | null; onChanged: () => void }) {
  const t = useT();
  const [startPool, setStartPool] = useState<string | null>(startPool0 ?? null);
  const [modal, setModal] = useState<PoolModal>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // Переход #/ → #/?start=<pool> не перемонтирует страницу — синхронизируем с пропом.
  useEffect(() => {
    if (startPool0) setStartPool(startPool0);
  }, [startPool0]);
  // Меню ••• закрывается кликом мимо и Esc — как обычный dropdown.
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuFor]);

  const remove = async (p: PoolConfig) => {
    const ok = window.confirm(
      t("Удалить направление «{label}»? Вопросы ({nodes}) будут удалены, сессии ({sessions}) останутся в истории.", {
        label: p.label,
        nodes: p.counts?.nodes ?? 0,
        sessions: p.counts?.sessions ?? 0,
      }),
    );
    if (!ok) return;
    try {
      await api.deletePool(p.id);
      onChanged();
    } catch {
      alert(t("Не удалось удалить направление"));
    }
  };

  // Статистика направления: «61 вопрос · 25 сессий» с правильными формами числа.
  const stats = (p: PoolConfig) => {
    const n = p.counts?.nodes ?? 0;
    const s = p.counts?.sessions ?? 0;
    return `${n} ${nWord(n, ["вопрос", "вопроса", "вопросов"], ["question", "questions"])} · ${s} ${nWord(s, ["сессия", "сессии", "сессий"], ["session", "sessions"])}`;
  };

  return (
    <div className="page home">
      <header className="pageshell">
        <h1 className="pageshell__title">{t("Интервью · доска вопросов")}</h1>
        <div className="pageshell__actions">
          <LangSwitch />
        </div>
      </header>
      <main className="page__body">
        {notice && <div className="errbar">{notice}</div>}

        <div className="home__head">
          <h2 className="home__h2">{t("Направления")}</h2>
          {/* Новое направление — из пресета (копия колонок и вопросов) или со своими колонками,
              поэтому кнопка есть и без единого пула. Тихая: не спорит с карточками. */}
          <button className="home__add iconbtn btn--quiet" onClick={() => setModal({ mode: "create" })}>
            {t("+ Новое направление")}
          </button>
        </div>
        {pools.length === 0 && (
          <p className="muted">{t("Нет ни одного направления: создайте первое кнопкой «+ Новое направление» или положите каталог с `pool.yaml` в `content/`.")}</p>
        )}
        <div className="home__pools">
          {pools.map((p) => (
            <div key={p.id} className="poolcard" data-pool={p.id}>
              {/* Меню направления лежит над «растяжкой» .poolcard__label::after (z-index), иначе клик уводит на доску. */}
              <button
                className="poolcard__menu iconbtn"
                aria-label={t("Меню направления")}
                aria-haspopup="menu"
                aria-expanded={menuFor === p.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuFor((cur) => (cur === p.id ? null : p.id));
                }}
              >
                •••
              </button>
              {menuFor === p.id && (
                <div className="poolcard__dropdown" role="menu" onClick={(e) => e.stopPropagation()}>
                  <button className="poolcard__edit" role="menuitem" onClick={() => { setMenuFor(null); setModal({ mode: "edit", pool: p }); }}>
                    {t("Редактировать")}
                  </button>
                  <button className="poolcard__delete" role="menuitem" onClick={() => { setMenuFor(null); remove(p); }}>
                    {t("Удалить")}
                  </button>
                </div>
              )}
              {/* Ссылка-«растяжка»: её ::after накрывает всю карточку — клик в любом месте открывает доску. */}
              <a className="poolcard__label" href={href.board(p.id)}>{p.label}</a>
              {p.description && <div className="poolcard__desc">{p.description}</div>}
              <div className="poolcard__meta">{stats(p)}</div>
              <div className="poolcard__blocks">
                {p.blocks.map((b) => (
                  <span key={b.id} className="poolcard__block">{b.label}</span>
                ))}
              </div>
              {/* Действия лежат над «растяжкой»; margin-top:auto прижимает их к низу — карточки в ряду одной высоты. */}
              <div className="poolcard__actions">
                <button className="poolcard__start btn--primary" onClick={() => setStartPool(p.id)}>
                  {t("Начать интервью →")}
                </button>
                <a className="poolcard__open" href={href.bank(p.id)}>{t("Открыть вопросы →")}</a>
              </div>
              {startPool === p.id && <StartSessionForm pool={p} onClose={() => setStartPool(null)} />}
            </div>
          ))}
        </div>
        {modal && (
          <PoolFormModal
            mode={modal.mode}
            pools={pools}
            pool={modal.mode === "edit" ? modal.pool : undefined}
            onClose={() => setModal(null)}
            onSaved={() => {
              setModal(null);
              onChanged();
            }}
          />
        )}

        <h2 className="home__h2 home__sections-head">{t("Проведение интервью")}</h2>
        <div className="home__sections">
          <a className="menucard" href={href.candidates}>
            <strong>{t("Кандидаты")}</strong>
            <span>{t("Справочник кандидатов и интервьюеров")}</span>
          </a>
          <a className="menucard" href={href.sessions}>
            <strong>{t("Сессии")}</strong>
            <span>{t("Все проведённые интервью, отчёты")}</span>
          </a>
          <a className="menucard" href={href.connect}>
            <strong>{t("Подключение")}</strong>
            <span>{t("Присоединиться к идущей live-сессии")}</span>
          </a>
        </div>
      </main>
    </div>
  );
}
