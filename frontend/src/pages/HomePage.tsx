import { useEffect, useState } from "react";
import { api } from "../api";
import { LangSwitch } from "../components/LangSwitch";
import { PoolFormModal } from "../components/PoolFormModal";
import { StartSessionForm } from "../components/StartSessionForm";
import { useT } from "../i18n";
import { href } from "../router";
import type { PoolConfig } from "../types";

type PoolModal = { mode: "create" } | { mode: "edit"; pool: PoolConfig } | null;

// Главное меню: направления как входы на доски + разделы (кандидаты, сессии, подключение).
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
  // Переход #/ → #/?start=<pool> не перемонтирует страницу — синхронизируем с пропом.
  useEffect(() => {
    if (startPool0) setStartPool(startPool0);
  }, [startPool0]);

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

        <h2 className="home__h2">{t("Направления")}</h2>
        {pools.length === 0 ? (
          <p className="muted">{t("Нет ни одного пула: положите каталог с `pool.yaml` в `content/`.")}</p>
        ) : (
          <div className="home__pools">
            {pools.map((p) => (
              <div key={p.id} className="poolcard" data-pool={p.id}>
                {/* Ссылка-«растяжка»: её ::after накрывает всю карточку — клик в любом месте открывает
                    доску. Ссылка на банк — сиблинг с z-index выше. Обе — настоящие <a>, в tab-порядке. */}
                <a className="poolcard__label" href={href.board(p.id)}>{p.label}</a>
                {p.description && <div className="poolcard__desc">{p.description}</div>}
                <div className="poolcard__meta">
                  {t("{nodes} вопросов · {sessions} сессий", { nodes: p.counts?.nodes ?? 0, sessions: p.counts?.sessions ?? 0 })}
                </div>
                <div className="poolcard__blocks">
                  {p.blocks.map((b) => (
                    <span key={b.id} className="poolcard__block" style={{ background: b.color }}>{b.label}</span>
                  ))}
                </div>
                {/* Кнопка и форма лежат над «растяжкой» (.poolcard__label::after) — иначе клик уводит на доску. */}
                <div className="poolcard__actions">
                  <button className="poolcard__start btn--primary" onClick={() => setStartPool(p.id)}>
                    {t("Начать интервью")}
                  </button>
                  <a className="poolcard__bank" href={href.bank(p.id)}>{t("банк вопросов →")}</a>
                  <span className="poolcard__manage">
                    <button className="poolcard__edit iconbtn btn--quiet" onClick={() => setModal({ mode: "edit", pool: p })}>
                      {t("изменить")}
                    </button>
                    <button className="poolcard__delete iconbtn btn--quiet" onClick={() => remove(p)}>
                      {t("удалить")}
                    </button>
                  </span>
                </div>
                {startPool === p.id && <StartSessionForm pool={p} onClose={() => setStartPool(null)} />}
              </div>
            ))}
            {/* Новое направление всегда из пресета — без единого пула создавать не из чего. */}
            <button className="poolcard poolcard--new" onClick={() => setModal({ mode: "create" })}>
              {t("+ Новое направление")}
            </button>
          </div>
        )}
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

        <h2 className="home__h2">{t("Разделы")}</h2>
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
