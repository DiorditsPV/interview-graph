import { href } from "../router";
import type { PoolConfig } from "../types";

// Главное меню: направления как входы на доски + разделы (кандидаты, сессии, подключение).
// Пулов может не быть вовсе (content/ без pool.yaml) — говорим об этом, а не рисуем пустоту.
export function HomePage({ pools, notice }: { pools: PoolConfig[]; notice?: string }) {
  return (
    <div className="page home">
      <header className="pageshell">
        <h1 className="pageshell__title">Интервью · доска вопросов</h1>
      </header>
      <main className="page__body">
        {notice && <div className="errbar">{notice}</div>}

        <h2 className="home__h2">Направления</h2>
        {pools.length === 0 ? (
          <p className="muted">Нет ни одного пула: положите каталог с `pool.yaml` в `content/`.</p>
        ) : (
          <div className="home__pools">
            {pools.map((p) => (
              <a key={p.id} className="poolcard" href={href.board(p.id)} data-pool={p.id}>
                <div className="poolcard__label">{p.label}</div>
                {p.description && <div className="poolcard__desc">{p.description}</div>}
                <div className="poolcard__meta">
                  {p.counts?.nodes ?? 0} вопросов · {p.counts?.sessions ?? 0} сессий
                </div>
                <div className="poolcard__blocks">
                  {p.blocks.map((b) => (
                    <span key={b.id} className="poolcard__block" style={{ background: b.color }}>{b.label}</span>
                  ))}
                </div>
                <span className="poolcard__bank" onClick={(e) => { e.preventDefault(); window.location.hash = href.bank(p.id); }}>
                  банк вопросов →
                </span>
              </a>
            ))}
          </div>
        )}

        <h2 className="home__h2">Разделы</h2>
        <div className="home__sections">
          <a className="menucard" href={href.candidates}>
            <strong>Кандидаты</strong>
            <span>Справочник кандидатов и интервьюеров</span>
          </a>
          <a className="menucard" href={href.sessions}>
            <strong>Сессии</strong>
            <span>Все проведённые интервью, отчёты</span>
          </a>
          <a className="menucard" href={href.connect}>
            <strong>Подключение</strong>
            <span>Присоединиться к идущей live-сессии</span>
          </a>
        </div>
      </main>
    </div>
  );
}
