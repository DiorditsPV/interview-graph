# Пулы направлений и главное меню — дизайн

Дата: 2026-09-02 · статус: утверждён в чате, ждёт реализации · ветка: `feature/pools-main-menu`

## Зачем

Сегодня «направление» интервью — это фильтр над одним общим банком: `content/tracks.yaml`
задаёт include-списки блоков, фронт гасит нерелевантные карточки. Направления с другой
таксономией (системный аналитик: требования, моделирование, данные, интеграции) в это
не помещаются — блоки захардкожены и во фронте (`Block`-union, `BLOCK_COLOR/LABEL`,
`PREFERRED_SUB`, `SUB_LABEL`), и в бэкенде (`Block = Literal[...]`).

Цель: направление = **самостоятельный пул вопросов** со своей таксономией, который
грузится независимо; доска становится подстраницей главного меню, где живут
кандидаты, сессии, подключение к live-сессии и менеджмент вопросов.

## Что фиксировано (решения владельца)

| вопрос | решение |
|---|---|
| Что такое пул физически | каталог `content/<pool>/` со своим `pool.yaml` и подкаталогами блоков |
| Границы | кандидаты и интервьюеры общие; сессия привязана к пулу |
| Контент новых направлений | каркас + стартовый набор «Системный аналитик» (сид, не экспертный банк) |
| Шапка доски | два ряда, только ход интервью; остальное — в боковой панели ⚙ и в меню |

## Не делаем

- Мультитенантность по пулам (tenant остаётся организацией, `default`).
- Профили-фильтры внутри пула (бывшие треки `backend`/`analyst`) — удаляются; при
  необходимости позже вернутся как sub-profiles в `pool.yaml`.
- Тёмные варианты для оформлений 56/57/58 (тёмная схема одна, см. `design-themes.css`).
- Изменение PK таблицы `nodes` — id остаётся уникальным в пределах тенанта.

---

## 1. Контент

```
content/
  data-engineer/
    pool.yaml
    frameworks/  databases/  python/  platform/     # *.md / *.json как сейчас
  system-analyst/
    pool.yaml
    requirements/  modeling/  data/  integration/
```

Нынешние каталоги переезжают через `git mv` в `content/data-engineer/`.
`content/tracks.yaml` и `content/weights.yaml` удаляются — их содержимое уходит в
`pool.yaml`.

### `pool.yaml`

```yaml
id: data-engineer                 # = имя каталога; ключ в БД, URL и localStorage
label: Дата-инженер
description: Airflow и Spark, SQL и хранилища, Python, платформа
blocks:                           # порядок = порядок колонок на доске
  - id: frameworks
    label: Фреймворки
    color: "#2563eb"              # семантический цвет блока (600-ряд)
    weight: 35                    # доля в наборе интервью, % (бывший weights.yaml)
    subblocks:                    # порядок = порядок под-колонок; отсутствует = блок не делится
      - { id: airflow,   label: Airflow }
      - { id: pyspark,   label: PySpark }
      - { id: dbt,       label: dbt }
      - { id: streaming, label: Streaming }
  - id: databases
    label: Базы данных
    color: "#16a34a"
    weight: 30
    subblocks:
      - { id: sql,     label: SQL }
      - { id: dbms,    label: СУБД и движки }
      - { id: storage, label: Хранилища }
      - { id: formats, label: Форматы }
  - id: python
    label: Python
    color: "#d97706"
    weight: 23
  - id: platform
    label: Платформа
    color: "#9333ea"
    weight: 12
```

Правила:
- `id` пула и блоков — `[a-z0-9-]+`; `id` пула обязан совпадать с именем каталога.
- `block` ноды обязан быть среди `blocks[].id` своего пула; `subblock`, если задан, —
  среди `subblocks[].id` этого блока. Нарушение — ошибка импорта (в `errors`, файл
  пропускается), как сегодня для невалидного frontmatter.
- Веса — целые проценты; сумма не обязана быть ровно 100 (sampler нормализует, как сейчас).
- Цвет плашки заголовка (700-ряд) не хранится — фронт считает `darken(color, 0.15)`.

### Ноды

Frontmatter не меняется: `pool` в файле **не пишется**, его ставит импортёр по
каталогу. Это сохраняет `extra="forbid"` на схеме и не требует миграции 61 файла.
Id нод по-прежнему уникальны в пределах тенанта (PK `nodes` не трогаем) — новые пулы
берут префикс: SA-вопросы `sa-*`.

### Стартовый пул «Системный аналитик»

`content/system-analyst/pool.yaml`:

| block | label | subblocks | weight |
|---|---|---|---|
| `requirements` | Требования | `elicitation` Сбор · `analysis` Анализ и приоритизация · `documentation` Документирование | 35 |
| `modeling` | Моделирование | `process` Процессы (BPMN) · `uml` UML и структуры | 25 |
| `data` | Данные | `sql` SQL · `data-model` Модель данных | 25 |
| `integration` | Интеграции | — | 15 |

Стартовый набор: ~15 вопросов, по каждому блоку от `base` до `senior`, теги — из
существующих 17 сквозных концептов (`architecture`, `data-modeling`, `domain`,
`quality`, …). Качество — как стартовый сид, который владелец правит через банк.

---

## 2. Бэкенд

### `pools.py` (новый)

```python
@dataclass
class SubblockCfg: id: str; label: str
@dataclass
class BlockCfg: id: str; label: str; color: str; weight: int; subblocks: list[SubblockCfg]
@dataclass
class PoolCfg: id: str; label: str; description: str; blocks: list[BlockCfg]

def load_pools(content_dir: Path) -> dict[str, PoolCfg]   # {id: cfg}, только валидные
def block_weights(pool: PoolCfg) -> dict[str, int]         # для sampler
```

Каталог без `pool.yaml` или с невалидным — пропускается с `log.warning` (как сегодня
с невалидным контентом). Пулов может быть ноль — тогда `/api/pools` пуст, меню это
показывает честно.

### `models.py`

- `Block = Literal[...]` → `block: str`; валидация против пула — в импортёре, не в схеме.
- `Node.pool: str` — обязательное поле модели; импортёр подставляет его из каталога
  (`content/<pool>/...`), `POST /api/nodes` и `/api/import` берут из тела запроса.

### `importer.py`

`load_content(content_dir)` → `load_pool_content(pool_dir, pool: PoolCfg)`: обходит
только каталог пула, ставит `node.pool`, проверяет `block`/`subblock` против конфига.
`parse_file` получает `pool_id` для проставления.

### `db.py`

- Миграции по образцу `_migrate_sessions` (`PRAGMA table_info` → `ALTER TABLE`):
  - `nodes.pool TEXT NOT NULL DEFAULT 'data-engineer'`
  - `sessions.pool TEXT NOT NULL DEFAULT 'data-engineer'`
  - индекс `nodes(tenant_id, pool)`.
- `count_nodes(tenant, pool)`, `list_nodes(tenant, pool, ...)`, `seed_nodes(tenant, pool, rows)`
  — везде добавляется `pool`; `get_node/upsert_node/delete_node` остаются по `(tenant, id)`.
- `create_session(..., pool)`, `list_sessions(tenant, pool: str | None)`; ответ сессии
  включает `pool`.

### `seed.py`

`seed_tenant_if_empty` → `seed_pool_if_empty(db, tenant, pool_cfg, pool_dir)`: пустой
пул (по `count_nodes(tenant, pool) == 0`) засеивается из своего каталога, остальные не
трогаются. При старте вызывается для каждого пула из `load_pools`.

Старая БД с нодами без `pool` после миграции получает `data-engineer` — то есть на
сервере после деплоя DE-пул считается непустым и не пересеивается, SA-пул пуст и
засеивается. Ничего руками делать не нужно.

### API

| ручка | было | стало |
|---|---|---|
| `GET /api/pools` | — | `[{id, label, description, blocks[...], counts:{nodes, sessions}}]` |
| `GET /api/graph` | все ноды | `?pool=<id>`; без параметра — `data-engineer`, а если такого пула нет — первый по алфавиту (совместимость на время PR 1); неизвестный `pool` → 404 |
| `GET /api/tracks`, `GET /api/weights` | | в PR 1 — заглушки поверх пулов (старый фронт жив), в PR 2 **удаляются** |
| `POST /api/interview` | `track` | `pool` (обязателен); веса из `pool.yaml` |
| `POST /api/import` | `{filename, content}` | + `pool` |
| `POST /api/nodes` | нода | + `pool`; `block`/`subblock` валидируются против пула → 400 |
| `PUT /api/nodes/{id}` | | `pool` менять нельзя (400) |
| `POST /api/sessions` | | + `pool` (обязателен; 404 на неизвестный) |
| `GET /api/sessions` | | `?pool=` — фильтр, без него все |
| `GET /api/sessions/{id}` | | в ответе `pool` |

`_db_nodes(request)` → `_db_nodes(request, pool)`.

---

## 3. Фронт

### Роутер

Свой hash-роутер без зависимости (`src/router.ts`, ~40 строк): парсит
`location.hash` в `{name, params, query}`, подписка на `hashchange`, `navigate(to)`.
Маршруты:

| hash | страница |
|---|---|
| `#/` | Главное меню |
| `#/board/<pool>` (`?session=<id>` — как сегодня для live) | Доска |
| `#/bank/<pool>` | Банк вопросов |
| `#/candidates` | Кандидаты и интервьюеры |
| `#/sessions` | Сессии |
| `#/connect` | Подключение к live-сессии |
| прочее | → `#/` |

`AuthGate` рендерит `<Router/>` вместо `<App/>`. Неизвестный `pool` в URL → меню с
сообщением.

### Страницы (`src/pages/`)

- **HomePage** — карточки направлений из `/api/pools` (label, description, вопросов,
  сессий) → `#/board/<pool>`; ниже разделы: Кандидаты · Сессии · Подключение · Банк
  вопросов (последний — с выбором направления).
- **BoardPage** — нынешний `App.tsx`, переименованный и параметризованный `pool`.
  Грузит `/api/graph?pool=` и конфиг пула; шапка — два ряда (см. ниже); боковая
  панель ⚙; drawer вопроса, фильтры, HUD, агенда — без изменений.
- **BankPage** — `BankBrowser` как содержимое страницы (не оверлей) + действия:
  Добавить вопрос · Загрузить файл (.md/.json) · Скачать банк (HTML). Все — для
  выбранного пула.
- **CandidatesPage** — список кандидатов (имя, позиция, грейд, контакт, заметка) с
  созданием и правкой (`GET/POST/PUT /api/candidates`), список интервьюеров с
  созданием. Для каждого кандидата — его сессии по направлениям.
- **SessionsPage** — таблица сессий: направление, кандидат, интервьюер, дата, оценено
  N/M; действия: открыть на доске (`#/board/<pool>?session=<id>`), скачать отчёт.
- **ConnectPage** — список идущих сессий (как «Подключиться…» сегодня) → доска нужного
  пула с `?session=`.

Общий каркас страниц: тонкая полоса сверху «← Меню · Название страницы», остальное —
контент. Оформление (37 по умолчанию и альтернативы) распространяется на все страницы
через те же токены.

### Шапка доски — два ряда

1. `← Меню` · **название направления** · прогресс «оценено N / M» · ⚙
2. кандидат (выбор из справочника + быстрое создание, как сегодня) · интервьюер ·
   «Начать сессию» / «Загрузить сессию…» / «Подключиться…» · разделитель ·
   «Скачать» · «Завершить · Скачать отчёт» (по готовности)

Исчезают из шапки: селект «Направление» (задано страницей), тумблеры отображения,
кнопки банка, «?», тема — всё это в панели ⚙ или в меню.

### Боковая панель ⚙ (`SettingsMenu` → выезжает слева)

Секции: Оформление (37/56/57/58) · Тема · Холст (точки, направляющие) · Панели
(агенда, скрытые, таймер) · Справка (горячие клавиши). Закрытие: ✕, Esc, клик мимо
(capture-фаза, «мимо» = вне `.settings`). Классы `.tb__toggle`, `.themebtn`,
`.helpbtn` сохраняются — на них ходит smoke.

### Блоки как данные

- `types.ts`: `Block = string`; `BLOCK_ORDER/LABEL/COLOR`, `PREFERRED_SUB`, `SUB_LABEL`
  удаляются. Появляется `PoolConfig` (зеркало `pool.yaml`) и `BLOCK_META(pool)`.
- `layout.ts`: `swimlaneLayout(nodes, pool)` берёт порядок блоков и под-колонок из
  конфига; неизвестные `subblock` (нет в конфиге) идут после известных по алфавиту —
  как сегодня для нод вне `PREFERRED_SUB`.
- Цвета: `BlockGroupNode`/`SubHeadNode`/`QuestionNode`/фильтры получают цвет из
  конфига; плашка 37/тёмной — через CSS-переменную `--plate` (`darken(color, .15)`),
  которую компонент ставит инлайном. Правила `.bgroup__header[data-block="..."]` в
  `design-themes.css` заменяются одним правилом на `var(--plate)`.
- Отчёт (`report.ts`): `trackLabel` → `poolLabel`; группировка по блокам — по конфигу
  пула, подписи блоков — из него же.

### Локальное состояние

Ключи localStorage, зависящие от пула, получают суффикс: `hiddenIds:<pool>`,
`draftScores:<pool>`, `timerStart:<pool>`. Глобальные остаются как есть: `design`,
`theme`, `bgVariant`, `guidesH/V`, `agendaOpen`, `showTimer`, `filtersOpen`.
Старые ключи без суффикса при первом запуске переносятся в `…:data-engineer`.

---

## 4. Инструменты и документация

- `.claude/skills/interview-*`: скрипты (`check_import.py`, `coverage.py`,
  `inventory.py`, `regen_ledger.py`) и SKILL.md ходят по `content/<block>` → по
  `content/<pool>/<block>`; по умолчанию пул `data-engineer`, параметр `--pool`.
  `coverage.py` берёт веса из `pool.yaml`.
- `frontend/smoke.mjs`: логин → меню → клик по DE → доска (дальше — как сегодня);
  новые шаги: SA-доска рисует свои колонки, страница сессий показывает созданную
  сессию с направлением, `#/bank/data-engineer` открывает банк.
- `frontend/shots.mjs`: пути через меню; скриншот меню добавляется в витрину.
- `CLAUDE.md`, `AGENTS.md`, `README.md`: структура `content/<pool>/`, `pool.yaml`,
  маршруты, где что настраивается.
- `Dockerfile`, `deploy/bootstrap.sh`, `run.sh` — без изменений (копируют `content/` целиком).

---

## 5. Проверка

**pytest** (новые/изменённые):
- `test_pools.py`: загрузка валидного `pool.yaml`; невалидный каталог пропускается;
  импорт ноды с чужим `block` → ошибка импорта.
- `test_app.py`: `graph?pool=` изолирует пулы; `graph` без параметра = DE; `/api/pools`
  отдаёт счётчики; `POST /api/sessions` без `pool` → 422, с неизвестным → 404;
  `GET /api/sessions?pool=` фильтрует; `/api/interview` использует веса пула.
- `test_migration.py`: БД со старой схемой (без `pool`) поднимается, старые ноды и
  сессии получают `data-engineer`, DE не пересеивается, SA засеивается.
- Удаляются тесты `tracks`/`weights`.

**smoke** — см. §4. **Матрица скриншотов**: меню, доска DE, доска SA, банк, сессии,
кандидаты × светлая/тёмная × 1280/390; пороги контраста прежние (4.5 / 3 / 1.9).

---

## 6. Порядок работ — три PR в `dev`

1. **Бэкенд + контент**: `pools.py`, модели, миграции, сид по пулам, API, перенос
   контента, `pool.yaml` DE, скиллы. Старый фронт продолжает работать (`graph` без
   `?pool` = DE, `/api/tracks` временно остаётся заглушкой из пулов и удаляется в PR 2).
2. **Фронт**: роутер, страницы, data-driven блоки, шапка-минимум, панель ⚙, smoke/shots,
   документация. Удаление `/api/tracks`, `/api/weights`.
3. **Пул «Системный аналитик»**: `pool.yaml` + стартовые вопросы.

Каждый PR проходит `pytest`, `npm run build`, smoke на контейнере и матрицу скриншотов
для затронутых экранов.

## Риски

- `App.tsx` (1400 строк) режется на `BoardPage` + общий стейт — самая большая правка,
  и именно на неё завязано большинство smoke-шагов. Резать минимально: страница
  доски = сегодняшний компонент с параметром `pool`, без перекладки состояния.
- `Block` перестаёт быть union-типом — TypeScript не поймает опечатку в блоке;
  эту роль берёт валидация против `pool.yaml` на импорте и в `POST /api/nodes`.
- Старые ключи localStorage без суффикса пула — перенос одноразовый, при ошибке
  пользователь теряет только черновик оценок и список скрытых (не данные сессий).
