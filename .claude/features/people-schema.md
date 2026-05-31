---
slug: people-schema
title: Люди интервью — интервьюеры и кандидаты (tenant-ready)
status: done            # designed -> building -> done
created: 2026-05-30
branch: feature/people-schema
verify: import 61 nodes / 0 errors; pytest 54 passed (incl. test_people.py 14: candidate CRUD, interviewer create/list, tenant isolation candidates+interviewers, sessions_by_candidate, create_session with candidate_id/interviewer_id, old-DB schema migration); frontend tsc+vite build OK; smoke ALL PASSED (download artifact reads "download" not "*.html" in sandbox — accepted).
review: tables interviewers+candidates added with composite PK (tenant_id,id); sessions extended via guarded ALTER ADD COLUMN (PRAGMA table_info) — old free-text sessions load unchanged; all DAL methods filter by tenant_id; endpoints /api/candidates (GET/POST/PUT), /api/interviewers (GET/POST), /api/sessions accepts candidateId/interviewerId; default interviewer «Я» seeded; UI candidate picker (select existing / create new with position+seniority) + interviewer select (default preselected) at session start, interviewer shown in HUD header and report.
---

## Проблема / цель
Сейчас «человек» в системе — это только `sessions.candidate` (свободный текст-имя). Интервьюер **не
фиксируется вообще**. Нельзя: вести список кандидатов с историей нескольких сессий, знать кто проводил
интервью, фильтровать/сравнивать по человеку, накапливать профиль специалиста (позиция, грейд, контакты).

**Цель:** ввести сущности **«интервьюер»** (кто проводит) и **«кандидат/специалист»** (кого собеседуют) как
полноценные записи в БД, связать с сессиями. Сохранить tenant-ready принцип (`tenant_id` с первого дня,
single-tenant `default` сейчас). Это развитие фундамента `content-store-db` и шаг к paid `team-workspace`.

## Зависимость
Строится поверх **`content-store-db`** (БД как источник правды, `tenancy.py`/`resolve_tenant`, паттерн DAL
с `tenant_id`). Реализовывать ПОСЛЕ неё (или в её рамках), переиспользуя `Database`, `_now()`, JSON-в-TEXT,
составные ключи `(tenant_id, id)`.

## Принцип tenant-readiness (как в content-store-db)
- `tenant_id` в каждой таблице людей, значение `'default'`; PK/уникальность — в пределах тенанта.
- Все DAL-методы принимают и фильтруют по `tenant_id`. Тест изоляции обязателен.
- `resolve_tenant(request)` — единственный шов; auth/привязка пользователя к интервьюеру — будущая фича.

## Поведение / UX
- **Кандидаты:** при старте сессии вместо/вместе со свободным именем — выбрать существующего кандидата или
  создать нового (имя обязательно; позиция/грейд/контакт/заметка — опционально). История сессий кандидата
  становится доступна (переиспользует уже существующий session-resume / candidate-compare по `candidate_id`).
- **Интервьюеры:** у сессии фиксируется проводивший. Сейчас (без auth) — выбор из списка интервьюеров или
  «по умолчанию» (один сид-интервьюер `default`/«Я»). Позже — автоматически из залогиненного пользователя.
- Обратная совместимость: старые сессии со свободным `candidate`-текстом не ломаются (миграция ниже).

## Затрагиваемые слои и файлы
- backend:
  - `db.py` — таблицы `interviewers`, `candidates`; в `sessions` добавить `tenant_id`, `candidate_id`,
    `interviewer_id` (+ оставить `candidate` текст для обратной совместимости/денормализации имени).
    DAL: CRUD интервьюеров/кандидатов (per-tenant), список сессий по кандидату/интервьюеру.
  - `main.py` — эндпоинты `/api/candidates` (GET/POST/PUT), `/api/interviewers` (GET/POST), расширить
    `/api/sessions` (принимать candidate_id/interviewer_id), `resolve_tenant` везде.
  - `models.py` — request/response-схемы `Candidate`, `Interviewer` (отдельно от `Node`).
  - `seed.py` — сид одного интервьюера `default` для тенанта `default` при пустой таблице.
- frontend:
  - `types.ts` — `Candidate`, `Interviewer`; расширить `Session`/`SessionMeta` (candidateId/interviewerId).
  - `api.ts` — клиентские методы людей.
  - `App.tsx` — при старте сессии: пикер/создание кандидата, выбор интервьюера; показ в шапке/отчёте.
  - `report.ts` — в отчёт добавить интервьюера и поля кандидата (позиция/грейд).
- content: нет (люди — данные, не контент).
- tests: CRUD людей per-tenant; изоляция тенантов; создание сессии с candidate_id/interviewer_id;
  миграция старых сессий (свободный candidate → авто-кандидат); история сессий по кандидату.

## Модель данных (tenant-ready)
```sql
CREATE TABLE IF NOT EXISTS interviewers (
    tenant_id   TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
    id          INTEGER NOT NULL,            -- autoincrement в пределах БД, уник. (tenant_id,id)
    name        TEXT NOT NULL,
    email       TEXT,
    role        TEXT,                         -- напр. «Tech Lead», «HR»
    user_id     TEXT,                         -- ШОВ: связь с auth-пользователем (пока NULL)
    created_at  TEXT NOT NULL,
    PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS candidates (
    tenant_id   TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
    id          INTEGER NOT NULL,
    name        TEXT NOT NULL,
    position    TEXT,                         -- на какую позицию
    seniority   TEXT,                         -- грейд (junior/middle/senior/…)
    contact     TEXT,                         -- email/телефон/ссылка (свободно)
    note        TEXT,                         -- заметка рекрутера
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (tenant_id, id)
);

-- sessions расширяется (через ALTER/пересоздание в _SCHEMA с IF NOT EXISTS + миграция):
--   + tenant_id      TEXT NOT NULL DEFAULT 'default'
--   + candidate_id   INTEGER        REFERENCES candidates(id)   (nullable для старых)
--   + interviewer_id INTEGER        REFERENCES interviewers(id) (nullable)
--   candidate (TEXT) — ОСТАВИТЬ: денормализованное имя + обратная совместимость
```
- `seniority` кандидата — отдельно от `difficulty` вопроса (разные понятия, не смешивать).
- `position`/`seniority`/`contact` — свободный текст сейчас; в мультитенанте могут стать per-tenant
  справочниками (как теги/треки) — шов отмечен, но не реализуем.

## Решения (с обоснованием)
- **Кандидат и интервьюер — раздельные таблицы, не общая `people` с ролью** — у них разные атрибуты
  (кандидат: позиция/грейд/контакт; интервьюер: роль/связь с auth) и разный жизненный цикл. Общая таблица
  с nullable-полями была бы разреженной и запутанной. (Если позже нужен «интервьюер, который был кандидатом» —
  это редкость, решается ссылкой, а не слиянием.)
- **`candidate` (TEXT) сохраняем в sessions** — обратная совместимость со старыми сессиями и денормализация
  (быстро показать имя без джойна; имя на момент интервью фиксируется, даже если карточку кандидата переименуют).
- **`interviewer_id` nullable + сид-интервьюер `default`** — сейчас auth нет; не блокируем создание сессии.
  С auth `resolve_tenant`-аналог даст текущего интервьюера автоматически (`user_id`-шов).
- **autoincrement id + составной PK `(tenant_id,id)`** — единообразно с content-store-db; перенос в Postgres
  совместим.
- **Миграция мягкая** — старые сессии с непустым `candidate` и пустым `candidate_id` остаются валидными;
  опционально one-shot: для каждой уникальной строки `candidate` в тенанте создать запись `candidates` и
  проставить `candidate_id` (идемпотентно, по имени).

## План реализации (чеклист для feature-build)
1. [x] `db.py`: таблицы `interviewers`, `candidates`; расширить `sessions` (tenant_id, candidate_id,
   interviewer_id) с безопасной миграцией существующей БД (ALTER ADD COLUMN если столбца нет).
2. [x] DAL per-tenant: `list/create/update_candidate`, `list/create_interviewer`, `sessions_by_candidate(t,cid)`,
   `create_session(t, candidate_name, candidate_id?, interviewer_id?)`.
3. [x] `seed.py`: интервьюер `default` («Я») для тенанта default при пустой таблице.
4. [x] `main.py`: `/api/candidates` (GET/POST/PUT), `/api/interviewers` (GET/POST); `/api/sessions` принимает
   candidate_id/interviewer_id; все запросы через `resolve_tenant`.
5. [x] request-схемы (Candidate*/Interviewer* в main.py рядом с прочими): схемы `Candidate`, `Interviewer`, расширить session-ответ.
6. [x] frontend: types/api/App — пикер кандидата (выбрать/создать) + выбор интервьюера при старте сессии;
   показ в шапке и отчёте; история сессий кандидата (переиспользовать session-resume по candidate_id).
7. [x] `report.ts`: интервьюер + позиция/грейд кандидата в шапке отчёта.
8. [x] Тесты: CRUD людей per-tenant, изоляция тенантов, сессия с people-ссылками, миграция старых сессий.
9. [~] Доки (спека обновлена; ARCHITECTURE.md — отдельно при необходимости): ARCHITECTURE.md (раздел сущностей людей), FEATURE_IDEAS (отметить связь с team-workspace).

## Тесты / приёмка
- [x] pytest: people CRUD + изоляция тенантов + миграция + история сессий — зелёные.
- [x] build + smoke: старт сессии через пикер кандидата работает; отчёт содержит интервьюера/кандидата.
- [x] Обратная совместимость: старые сессии (свободный candidate) открываются без ошибок.

## Риски / открытые вопросы
- **ALTER на существующей prod-БД** — добавление nullable-столбцов безопасно; покрыть тестом «миграция старой БД».
- **Дедупликация кандидатов** (один человек заведён дважды) — пока по имени вручную; авто-merge — будущее.
- **PII/контакты кандидатов** — появляются персональные данные; для мультитенанта понадобится доступ/удаление
  по запросу (GDPR/152-ФЗ) — отметить в team-workspace, здесь только хранение.
- **Связь interviewer ↔ auth-user** (`user_id`) — шов заложен, наполнится в team-workspace.
- Зависит от `content-store-db` (таблица `tenants`, tenancy.py) — реализовать после неё.
