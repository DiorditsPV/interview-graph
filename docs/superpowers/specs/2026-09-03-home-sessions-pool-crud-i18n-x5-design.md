# Старт сессии на главной, CRUD направлений с пресетами, RU/EN, пул «Data Engineer X5» — дизайн

Дата: 2026-09-03 · статус: решения владельца зафиксированы в чате, реализуется автономно ·
ветки: стек `feature/home-session-start` → `feature/pool-crud` → `feature/i18n`, отдельно `feature/pool-de-x5`.

## Зачем

После пулов направлений (спек 2026-09-02) главное меню стало входом в продукт, но ход интервью
всё ещё стартует из шапки доски: там же выбор кандидата, интервьюер «Я», «Загрузить сессию»,
«Подключиться». Всё это дублирует разделы меню (Сессии, Подключение) и мешает на доске.
Направления при этом задаются только файлами `pool.yaml` — из интерфейса их нельзя ни завести,
ни переименовать. Интерфейс только русский. Реально проведённые интервью дата-инженера в X5
(плейбук `~/dev/docs/rabota/interviews/interview-playbook.md`, собранный по шести интервью)
в банке не представлены.

Цель — четыре связанные вещи:

1. **Старт сессии переезжает на главную.** Строка кандидата в шапке доски исчезает; на карточке
   направления — «Начать интервью» с формой кандидат / позиция / грейд.
2. **Пул «Data Engineer X5»** — набор карточек «вопрос + ответ» по плейбуку X5. Только вопросы
   и эталонные ответы; никаких кандидатов, дат и оценок.
3. **Переключатель RU / EN** для интерфейса.
4. **CRUD направлений на главной**: добавить, переименовать/поменять описание, удалить;
   при создании — выбрать **набор вопросов (пресет)** из существующих направлений;
   при редактировании пресет не предлагается.

## Что фиксировано (решения владельца)

| вопрос | решение |
|---|---|
| Кто проводит интервью | из интерфейса убирается; сессия получает первого интервьюера тенанта на бэкенде (сид «Я»), чтобы отчёты и страница сессий не пустели |
| «Загрузить сессию», «Подключиться» на доске | удаляются: это «Открыть» на странице Сессии и раздел Подключение |
| Пул X5 | обычный пул `content/data-engineer-x5/` в репозитории; источник — плейбук, без персональных данных из транскриптов |
| Пресет вопросов | = существующее направление; при создании копируются его колонки и все его вопросы |
| Язык | переключается только интерфейс; подписи пулов/блоков и текст вопросов остаются как написаны |
| Удаление направления | вопросы направления удаляются, сессии остаются в истории; направление помечается удалённым, чтобы сид его не воскресил |

## Не делаем

- Редактирование колонок/под-колонок направления из интерфейса (только `pool.yaml` пресета).
- Перевод контента и `pool.yaml` (нет `label_en`).
- Удаление сессий, восстановление удалённых направлений.
- Управление интервьюерами на главной (остаётся в разделе Кандидаты).

---

## 1. Старт сессии на главной (PR A, `feature/home-session-start`)

### Главная

Карточка направления получает кнопку **«Начать интервью»** (`.poolcard__start`, primary). Клик
раскрывает под карточкой форму `StartSessionForm` (новый компонент `components/StartSessionForm.tsx`):

- `select.cand-pick` — существующие кандидаты, первый пункт «Новый кандидат…» (как сегодня в шапке);
- при «Новый кандидат…» — `input[placeholder="Кандидат…"]`, `input.cand-pos` «Позиция (опц.)»,
  `input.cand-sen` «Грейд (опц.)»;
- «Начать» (`.btn--primary`) и «Отмена».

Логика старта переезжает из `BoardPage.startSession` без изменений: новое имя → `createCandidate`
(позиция/грейд), затем `createSession(pool, name, candidateId)`, затем
`localStorage["timerStart:<pool>"] = Date.now()` и `navigate(href.board(pool, session.id))`.
Доска подключается к сессии по `?session=` существующим `joinSession`.

Открыта одна форма за раз (`startPool: string | null` в `HomePage`). Deep-link `#/?start=<pool>`
открывает форму этого пула сразу — на него ведёт ссылка с доски без сессии. Роутер: маршрут
`home` получает поле `start: string | null`, `href.start(pool)`.

### Доска

Ряд 2 шапки (`topbar__row--utility`):

- **сессия активна** — как сегодня, минус маркер «🎤 интервьюер»: `👤 кандидат · оценено N · средн. X`,
  `livedot`, «Выйти», разделитель, «Скачать», «Завершить · Скачать отчёт»;
- **сессии нет** — `span.session__none` «Просмотр без сессии» и ссылка `a.session__start`
  «Начать интервью →» на `href.start(pool.id)`; разделитель и «Скачать» (черновик оценок) остаются.

Из `BoardPage` уходят: state `candidate`, `candidates`, `interviewers`, `pickedCandidateId`,
`pickedInterviewerId`, `candPosition`, `candSeniority`, `pastSessions`, `sessions`; функции
`startSession`, `loadSession`; эффект загрузки кандидатов/интервьюеров/списка сессий.
Для шапки отчёта (`reportPeople`) позиция/грейд берутся по `session.candidate_id` из
`api.listCandidates()`, интервьюер — по `session.interviewer_id` из `api.listInterviewers()`;
оба списка грузятся один раз при появлении сессии.

### Бэкенд

`POST /api/sessions`: если `interviewer_id` не передан — подставляется первый интервьюер тенанта
(`db.list_interviewers(tenant)[0]`), если он есть. Это единственная правка бэкенда в PR A.

### Тексты

`SessionsPage` пустое состояние: «Сессий пока нет — начните интервью с главной».

### Smoke

Шаг 10 переписывается: с главной клик `.poolcard[data-pool="data-engineer"] .poolcard__start`,
заполнить «Кандидат…» = `Cmp Bot`, «Грейд» = `middle`, «Начать» → `location.hash` начинается с
`#/board/data-engineer?session=` → `.session__active` содержит `Cmp Bot`. Проверка `🎤` удаляется,
проверка `.iv-pick` удаляется. Шаг 11 (resume): сессия `SmokeResume` + оценка через API →
переход на `#/sessions` → клик «Открыть» в строке `tr[data-session=<id>]` → `.session__active`
содержит `SmokeResume`, `.qnode--scored ≥ 1`. Проверка ссылки «Начать интервью →» на доске без
сессии: после «Выйти» есть `.session__start`.

---

## 2. CRUD направлений и пресеты (PR B, `feature/pool-crud`)

### Модель: пулы живут в БД, `pool.yaml` — сид

Как и вопросы (`seed.py`): источник правды в рантайме — таблица `pools`, каталоги
`content/<pool>/` — стартовый набор. Это делает UI-созданные направления полноценными
(переживают деплой, `rsync --delete content/` их не трогает) и убирает запись YAML с сервера.

```sql
CREATE TABLE IF NOT EXISTS pools (
    tenant_id   TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
    id          TEXT NOT NULL,
    label       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    blocks      TEXT NOT NULL,          -- JSON: [{id,label,color,weight,subblocks:[{id,label}]}]
    source      TEXT NOT NULL DEFAULT 'seed',   -- seed | user
    deleted_at  TEXT,                   -- tombstone: сид не воскрешает, id занят
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (tenant_id, id)
);
```

`pools.py`: `PoolCfg.dir` становится `Optional[Path]` (у пулов из БД каталога нет);
разбор списка блоков выносится в `parse_blocks(raw) -> Tuple[BlockCfg, ...]` и используется
и для YAML, и для JSON из БД; добавляются `PoolCfg.from_row(row)` и `blocks_json(cfg)`.

`db.py`: `list_pools(tenant)` (без tombstone, по `created_at`), `get_pool(tenant, id)`
(возвращает и tombstone — для проверки занятости id), `upsert_pool_seed(tenant, cfg)`
(`INSERT OR IGNORE`, source='seed'), `create_pool(tenant, id, label, description, blocks)`,
`update_pool(tenant, id, fields)`, `delete_pool(tenant, id)` (tombstone + `DELETE FROM nodes WHERE pool=?`,
возвращает число удалённых нод), `copy_nodes(tenant, src_pool, dst_pool, prefix)`
(id новых нод = `<dst_pool>-<old id>`, `source='user'`).

`seed.py`: `seed_pool_if_empty` сначала `upsert_pool_seed`, затем ноды (как сегодня).

`main.py`: глобальный `POOLS` исчезает; `_pool_or_404(request, pool_id)` читает БД тенанта,
`default_pool_id` — по списку из БД. Порядок в `/api/pools` — `created_at` (сид идёт в порядке
каталогов, как сегодня).

### API

| ручка | тело / ответ | ошибки |
|---|---|---|
| `POST /api/pools` (member) | `{label, description?, preset}` → пул как в `GET /api/pools` (с `counts`) | 404 preset нет; 422 пустой label |
| `PUT /api/pools/{id}` (member) | `{label?, description?}` → пул | 404; 422 пустой label |
| `DELETE /api/pools/{id}` (member) | → `{deleted, nodes_removed, sessions_kept}` | 404 |

Id генерируется на сервере: транслитерация label (таблица ru→lat в `pools.py`, `slug_from_label`),
`[a-z0-9-]+`, при занятости (включая tombstone) — суффикс `-2`, `-3`, …
Создание: `create_pool` с блоками пресета, затем `copy_nodes(preset → new)`.

`PUT /api/nodes/{id}` и остальные ручки с `pool` продолжают работать через `_pool_or_404`.

### Главная

- В сетке направлений последняя карточка — `button.poolcard.poolcard--new` «+ Новое направление».
- На карточке в подвале рядом с «банк вопросов →»: `button.poolcard__edit` «изменить»,
  `button.poolcard__delete` «удалить» (quiet, поверх растяжки как `.poolcard__bank`).
- Модалка `PoolFormModal` (`components/PoolFormModal.tsx`, стиль `AddQuestionModal`):
  - режим **create**: «Название», «Описание», `select.pool-preset` «Набор вопросов» — существующие
    направления как `«<label> · N вопросов»`, по умолчанию первое; «Создать» → `POST /api/pools`
    → `onChanged()` (перезагрузка пулов в `Router`).
  - режим **edit**: «Название», «Описание», «Сохранить» → `PUT`.
- Удаление: `window.confirm("Удалить направление «X»? Вопросы (N) будут удалены, сессии (M) останутся
  в истории.")` → `DELETE` → `onChanged()`.
- `HomePage` получает проп `onChanged`; `Router` передаёт `reloadPools`.

`api.ts`: `createPool`, `updatePool`, `deletePool`.

### Тесты (pytest)

- создание из пресета: блоки равны блокам пресета, число нод равно, id с префиксом нового пула,
  `counts.nodes` в `/api/pools`;
- транслитерация: «Аналитик данных» → `analitik-dannyh`; повтор → `-2`;
- правка label/description; пустой label → 422; неизвестный id → 404;
- удаление: ноды исчезли, `count_sessions` прежний, `/api/pools` без него, повторный сид при
  старте не возвращает (tombstone), `POST` с тем же label даёт `-2`;
- `GET /api/graph?pool=<удалённый>` → 404.

### Smoke

Новые шаги на главной: «+ Новое направление» → название `Smoke Pool`, пресет по умолчанию →
карточка `.poolcard[data-pool="smoke-pool"]` появилась и её `poolcard__meta` показывает то же
число вопросов, что у пресета; «изменить» → название `Smoke Pool 2` → подпись обновилась;
«удалить» (диалог подтверждается через `page.on("dialog")`) → карточки нет.

---

## 3. RU / EN (PR C, `feature/i18n`)

Без библиотек. `frontend/src/i18n.tsx`:

- `type Lang = "ru" | "en"`; контекст `LangProvider` (в `main.tsx` поверх `Router`), состояние из
  `localStorage["lang"]`, по умолчанию `ru`; выставляет `document.documentElement.lang`.
- `useT()` возвращает `t(s, vars?)`: ключ — **русская строка как в коде**, значение — из словаря
  `EN` (`i18n/en.ts`, `Record<string, string>`); нет перевода → возвращается русская строка.
  Подстановки `{name}` через `vars`. Так не придумываются ключи и не ломается ничего, чего нет в словаре.
- `LangSwitch` (`components/LangSwitch.tsx`): кнопка `RU · EN` (`.langswitch`, `aria-pressed`),
  стоит в шапке главной (`pageshell`), в `PageShell` всех страниц и в ряду 1 шапки доски рядом с ⚙.

Что переводится: все литералы интерфейса в `pages/*`, `components/*`, `report.ts`, `Router.tsx`,
`AuthGate`/логин (если есть литералы), `title`/`placeholder`/`aria-label` включительно.
Что нет: подписи пулов/блоков/под-колонок из `pool.yaml`, тексты вопросов, теги, уровни
`base/junior/middle/senior`, названия оформлений, hotkeys.

Правило для кода: литерал в JSX → `{t("…")}`; в атрибутах → `title={t("…")}`; строки, собираемые
конкатенацией, переписываются в шаблон с `{var}`. Словарь `en.ts` группируется комментариями по файлам.

### Smoke

На главной: клик `.langswitch` → `h2.home__h2` первого блока читается `Tracks`; на доске DE после
перехода `← Menu` виден; клик обратно → `Направления`. Остальные шаги идут на RU.

---

## 4. Пул «Data Engineer X5» (PR D, `feature/pool-de-x5`, от `dev`)

Источник — `~/dev/docs/rabota/interviews/interview-playbook.md` (24 устных вопроса, 4 задачи
Python, 2 задачи SQL, AI-секция). Дополнительно сверка с `interview_review_blocks.md` шести
интервью (строка «Охват») и оглавлениями транскриптов: вопросы, которые реально задавались, но
не попали в плейбук, добавляются. **В карточки не попадает ничего про кандидатов**: ни имён,
ни дат, ни «калибровок» с отсылками к людям; из `*Калибровка:*` берётся только суть
(«сильный ответ разделяет X и Y»).

```yaml
id: data-engineer-x5
label: Data Engineer X5
description: Скрипт интервью ИБП — Python-лайвкодинг, SQL и индексы, Spark, Airflow, ClickHouse
blocks:
  - { id: python,     label: Python,          color: "#d97706", weight: 30 }
  - id: sql
    label: SQL и индексы
    color: "#16a34a"
    weight: 25
    subblocks:
      - { id: queries, label: Запросы }
      - { id: indexes, label: Индексы и планы }
  - { id: spark,      label: Spark,           color: "#2563eb", weight: 25 }
  - { id: airflow,    label: Airflow,         color: "#9333ea", weight: 12 }
  - { id: clickhouse, label: ClickHouse,      color: "#dc2626", weight: 6 }
  - { id: ai,         label: AI в работе,     color: "#0891b2", weight: 2 }
```

Файлы: `content/data-engineer-x5/<block>/x5-<block>-NN.md` (id = имя файла). Задачи Python и SQL —
`kind: task` с `starterCode` (условие/данные из плейбука) и `rubric` (3–5 критериев из эталона и
наводящих). Устные вопросы — `kind: question`, ответ — связная проза из буллетов плейбука с
раскрытием «добить»-вопросов как продолжения ответа. Сложность: определения — `base`/`junior`,
типовые — `middle`, отмеченные ★ и вопросы «на вывод» — `senior`. `weight`: ★ и обязательный
минимум — 5, остальные — 3, «по желанию» — 1. Теги — 1–3 из 17 концептов `AGENTS.md`.

Ожидаемый объём: 30–36 карточек. Тест `test_content_imports_without_errors` параметризуется
по всем пулам `content/`. Smoke: шаг 25 становится безусловным и проверяет обе карточки
(`system-analyst`, `data-engineer-x5`) на главной.

---

## 5. Порядок работ и проверка

| PR | ветка | база | режим |
|---|---|---|---|
| A. старт сессии на главной | `feature/home-session-start` | `dev` | субагент + ревью (фронт+smoke) |
| D. пул X5 | `feature/pool-de-x5` | `dev` | субагент + ревью контента, параллельно A–C в worktree |
| B. CRUD направлений | `feature/pool-crud` | A | субагент + ревью (бэкенд-слои + фронт) |
| C. RU/EN | `feature/i18n` | B | батч: i18n-каркас инлайн, затем субагент проходит файлы |

Гейты каждого PR: `pytest -q` → `npm run build` → `npm run smoke` на локальном uvicorn с временной
БД → CI gate. Мерж — squash в `dev` в порядке A, B, C, затем D (после squash верхние PR стека
переклеиваются `git merge -s ours origin/dev`, см. память `pools-main-menu-pr-stack`; D идёт
последним, потому что он не в стеке, и его правки `smoke.mjs`/тестов вливаются обычным merge `dev`).

## Риски

- `BoardPage.tsx` теряет ~150 строк state и JSX; smoke-шаги 10/11/13 завязаны на удалённые
  селекторы — переписываются в том же PR.
- Перевод пулов в БД меняет `_pool_or_404` во всех ручках; тесты `test_app`/`test_nodes`/`test_people`
  ходят через `TestClient(app)` с реальным `content/` — сид в БД при импорте модуля сохраняет их поведение.
- Ключи словаря EN = русские строки: изменение русской фразы молча теряет перевод. Компенсация —
  smoke-проверка двух опорных фраз и `grep` по словарю в ревью PR C.
- Плейбук — рабочий материал X5 в публичном репозитории: в пул идут только технические вопросы
  и эталонные ответы общего характера, без реквизитов проекта, кандидатов и внутренних деталей.
