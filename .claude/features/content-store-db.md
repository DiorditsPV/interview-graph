---
slug: content-store-db
title: Вопросы/таксономия в БД (single-tenant сейчас, tenant-ready инфраструктура)
status: designed        # designed -> building -> done
created: 2026-05-30
branch: feature/content-store-db
verify: —
review: —
---

## Проблема / цель
Вопросы живут в `content/*.md` (git), но ведут себя как **данные** (UI их создаёт/правит/грузит в рантайме).
Деплой `rsync --delete` перезаписывает `/opt/interview` из git → рантайм-изменения теряются (#13).
Сессии/оценки уже хранятся правильно — SQLite по `INTERVIEW_DB_PATH` (`/var/lib/interview`), переживает деплой.

**Цель:** перевести вопросы (и таксономию: направления/треки, теги) в БД как источник правды, MD в git — сид.
**Дополнительно (решение пользователя):** работать **single-tenant сейчас**, но спроектировать схему и швы кода
**tenant-ready** — чтобы переход на много корпоративных клиентов (у каждого свои направления/вопросы/теги)
был «включить фильтр + auth», а не переписывание. Это фундамент будущей paid-фичи `team-workspace`.

## Принцип tenant-readiness (нерушимо для этой фичи)
1. **`tenant_id` присутствует в каждой per-tenant таблице с первого дня**, со значением `'default'`.
   Single-tenant = один тенант `default`; код уже фильтрует по нему везде.
2. **Единая точка определения тенанта** — `resolve_tenant(request) -> str`. Сейчас всегда возвращает
   `'default'`; позже — из JWT/сессии. Никакой код, кроме этой функции, не «знает», что тенант один.
3. **Каждый DAL-метод принимает `tenant_id`** и фильтрует по нему. Нет ни одного запроса без tenant-фильтра
   (иначе в будущем — утечка между клиентами). Это инвариант ревью.
4. **Таксономия (направления/треки, теги, веса) — per-tenant данные**, не глобальные константы/файлы.
   Для `default` сидируется из текущих `tracks.yaml`/`weights.yaml` и набора тегов из вопросов.
5. **Жёсткие `Literal` ослабляются до валидации против тенант-справочника.** `block`/`difficulty` пока
   оставляем `Literal` (стабильная ось), а `tags`/`tracks` — данные тенанта. (Полная де-литерализация
   `block` — отдельная будущая фича, чтобы не раздувать объём; шов для неё закладываем.)

## Поведение / UX
Фронт-контракт `/api/graph` сохраняется. Под капотом:
- **Старт / пустая БД для тенанта** → сид из `content/*.md` (+ `tracks.yaml`/`weights.yaml`) под `default`.
  Идемпотентно по `count_nodes(tenant)==0`.
- **`GET /api/graph`** читает ноды из БД для `resolve_tenant(request)`.
- **`POST /api/import`** пишет ноды в БД (`source='user'`, `tenant_id=resolve_tenant`), не на диск.
- **CRUD/скрытие** (фундамент для question-management/hide-local) — в БД, per-tenant.
- **Направления/теги** отдаются из БД per-tenant (сейчас — дефолтные).

## Затрагиваемые слои и файлы
- backend:
  - `db.py` — таблицы `tenants`, `nodes`, `tracks`, `tags` (+ `tenant_id` колонка); DAL с tenant-параметром.
  - `tenancy.py` (НОВЫЙ) — `DEFAULT_TENANT='default'`, `resolve_tenant(request)->str` (пока константа),
    `ensure_tenant(db, tid)`.
  - `seed.py` (НОВЫЙ) — `seed_tenant_if_empty(db, tid, content_dir)` поверх `load_content`/`load_tracks`/`load_weights`.
  - `main.py` — `/api/graph`, `/api/tracks`, `/api/weights`, `/api/import` через DAL+tenant; сид при старте для `default`.
  - `models.py` — `Node` не трогаем (валидация импорта); БД-слой отдаёт совместимый dict; `tenant_id`/`source`/
    `hidden`/таймстемпы живут в БД-схеме, не в `Node` (обходим `extra="forbid"`).
- frontend: контракт не меняется (аддитивные поля при необходимости).
- content: `content/*.md`, `tracks.yaml`, `weights.yaml` остаются как сид-источник `default` (не удаляем).
- tests: сид per-tenant, изоляция (данные тенанта A не видны тенанту B — тест с двумя tenant_id вручную через DAL),
  graph/import из БД, идемпотентность рестарта, миграция 61 ноды.

## Модель данных (схема — tenant-ready)
```sql
CREATE TABLE IF NOT EXISTS tenants (
    id          TEXT PRIMARY KEY,          -- 'default' сейчас
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
    tenant_id    TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
    id           TEXT NOT NULL,
    kind         TEXT NOT NULL DEFAULT 'question',
    block        TEXT NOT NULL,
    subblock     TEXT,
    topic        TEXT NOT NULL,
    title        TEXT,
    difficulty   TEXT NOT NULL DEFAULT 'middle',
    weight       INTEGER NOT NULL DEFAULT 1,
    question     TEXT NOT NULL,
    answer       TEXT NOT NULL DEFAULT '',
    starter_code TEXT,
    rubric       TEXT NOT NULL DEFAULT '[]',  -- JSON
    tags         TEXT NOT NULL DEFAULT '[]',  -- JSON
    source       TEXT NOT NULL DEFAULT 'seed',
    hidden       INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    PRIMARY KEY (tenant_id, id)              -- id уникален В ПРЕДЕЛАХ тенанта
);

CREATE TABLE IF NOT EXISTS tracks (
    tenant_id   TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
    id          TEXT NOT NULL,
    label       TEXT NOT NULL,
    include     TEXT NOT NULL DEFAULT '[]',   -- JSON-правила включения
    PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS tags (
    tenant_id   TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
    name        TEXT NOT NULL,
    PRIMARY KEY (tenant_id, name)
);
-- (сессии/оценки тоже получат tenant_id отдельной миграцией в team-workspace; здесь — контент.)
```
- Везде составной ключ `(tenant_id, id)` — это и есть «шов»: single-tenant работает с `default`,
  мультитенант — те же таблицы без изменения структуры.
- `rubric`/`tags` ноды — JSON-строки (паттерн SQLite, без доп. таблиц).

## Решения (с обоснованием)
- **БД-источник, MD-сид** (выбор пользователя): переиспользуем durable-паттерн `INTERVIEW_DB_PATH`; «сохранить»
  не трогает деплой; нет git-на-проде. Закрывает #13.
- **tenant_id с первого дня, auth — потом** (выбор пользователя): мультитенантность нельзя «прикрутить позже»
  без переписывания схемы, поэтому колонка и tenant-фильтр закладываются сразу; а дорогие части (auth, per-tenant
  UI, Postgres) — отдельными фичами. Минимальная цена сейчас, нулевая переделка потом.
- **`resolve_tenant` как единственный шов** — изоляция «знания о тенанте» в одной функции; включение мультитенанта
  = заменить её тело на чтение из токена + добавить login. Остальной код не меняется.
- **SQLite сейчас, Postgres — в team-workspace** — схема совместима (составные ключи, без SQLite-специфики кроме
  JSON-в-TEXT, что переносимо). Миграция — отдельная фича, когда появятся реальные клиенты.
- **block/difficulty оставляем Literal** — стабильные оси, де-литерализация раздула бы объём; tags/tracks уже
  per-tenant. Шов для будущей per-tenant `block` отмечен.

## План реализации (чеклист для feature-build)
1. [ ] `tenancy.py`: `DEFAULT_TENANT`, `resolve_tenant(request)->DEFAULT_TENANT`, `ensure_tenant(db,tid)`.
2. [ ] `db.py`: схема `tenants`/`nodes`/`tracks`/`tags`; DAL c обязательным `tenant_id`:
   `count_nodes(t)`, `list_nodes(t, include_hidden=True)`, `get_node(t,id)`, `upsert_node(t,data)`,
   `delete_node(t,id)`, `seed_nodes(t,rows)`, `list_tracks(t)`, `list_tags(t)`, `seed_tracks/tags`.
   JSON (de)serialize для rubric/tags/include.
3. [ ] `seed.py`: `seed_tenant_if_empty(db,tid,content_dir)` — при `count_nodes==0` залить nodes+tracks+tags+weights.
4. [ ] `main.py`: при старте `ensure_tenant(db,'default')` + `seed_tenant_if_empty(db,'default',CONTENT_DIR)`.
5. [ ] `main.py`: `/api/graph`,`/api/tracks`,`/api/weights` → из DAL по `resolve_tenant(request)`.
6. [ ] `main.py`: `/api/import` → `db.upsert_node(tenant, source='user')`; дубль по `get_node`; формат ответа прежний.
7. [ ] Тесты: сид (N==61 для default); graph/import из БД; рестарт идемпотентен; **изоляция тенантов**
   (seed во второй tenant_id не виден в default); tracks/tags per-tenant.
8. [ ] CI/гейт: «seed из content == N нод», изоляционный тест обязателен.
9. [ ] Доки: `docs/ARCHITECTURE.md` (раздел мультитенантности) + `DEPLOY.md` (вопросы в БД, переживают деплой).

## Тесты / приёмка
- [ ] pytest: сид/идемпотентность/graph-из-БД/import-в-БД/**изоляция тенантов** — зелёные.
- [ ] build + smoke — фронт без изменений контракта, 61 нода рендерится из БД.
- [ ] Деплой-сценарий: загрузил вопрос → имитация rsync-перезаписи кода (БД на месте) → вопрос остался (#13 закрыт).

## Риски / открытые вопросы
- **Миграция 61 .md** — автосид; import-check сейчас 0 ошибок → пройдёт.
- **`errors` в /api/graph** станет обычно пустым (битых файлов в рантайме нет) — UI переживает пустой массив.
- **sessions/scores ещё без tenant_id** — осознанно вне объёма; добавятся в team-workspace одной миграцией.
- **Postgres-переезд** — отдельная фича; схема уже совместима.
- **Конкурентная запись** — SQLite сериализует; для single-tenant достаточно; Postgres решит для multi.
- **Экспорт БД→MD (бэкап/версионирование в git)** — отдельная возможная фича; `source` это поддержит.
