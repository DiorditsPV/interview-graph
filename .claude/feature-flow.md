# Autonomous dev-flow — interview (interview-graph)

Конфиг и инварианты автономного цикла **разработки приложения**. Прочитай первым делом, до запуска цикла.

Один цикл = одна фича: GitHub Issue → план → реализация на ветке → гейт качества → **кандидат** (готовая, проверенная ветка, ждущая ревью). Merge и deploy цикл НЕ делает — это вручную, человеком. Работает только с КОДОМ (бэкенд/фронт); генерация вопросов — отдельный скилл `interview-ideas`, цикл ей не нужен.

## Карта проекта

Два слоя (команды проверки — в разделе Verify):
- **Backend** — `backend/app/`, Python 3.11, FastAPI + Pydantic v2 + SQLite. Контент-файлы импортируются в граф в памяти и отдаются через `/api/graph`.
- **Frontend** — `frontend/src/`, React 18 + TS (strict) + Vite. Данные тянет из `/api/graph` в рантайме; любая правка `frontend/src/` требует `npm run build`.

Грабли:
- Новое поле ноды = правка `models.py` + `frontend/src/types.ts` + миграция контент-файлов (у модели `extra="forbid"`, иначе импорт падает).
- Правки контента — через `python-frontmatter`, не вручную (формат нормализован).
- Доменные скиллы (`.claude/skills/`): гейт качества — `interview-verify`. Контент-инструменты `interview-ideas`/`interview-refactor`/`interview-balance` нужны, только если фича трогает банк вопросов.

## Этап → скилл

**slug** — идентификатор фичи вида `<номер issue>-<краткий-kebab-тайтл>`; детерминирован номером issue.

| Этап | Инструмент | Заметка |
|------|-----------|---------|
| Задача | open Issue с меткой `autodev-ready`: `gh issue list --state open --label autodev-ready` | Цикл берёт ТОЛЬКО задачи, человек/груминг пометил `autodev-ready` (см. «Работа с issue»). Эпики и access-gated — не помечены, не берутся. |
| План | gstack `/autoplan` | Авто-решения по 6 принципам, без вопросов. НЕ интерактивные `/plan-*-review`, `/office-hours` — там STOP с вопросами. |
| Реализация | ветка `feature/<slug>` от `dev` | Код backend/frontend по issue. Контент (если трогается) — через `python-frontmatter`, при необходимости `interview-refactor`/`interview-balance`. |
| Гейт | `/review` + `/qa` + `interview-verify` | **Гейт** — обязательная проверка качества. Зелёный = кандидат остаётся на `feature/<slug>`. |
| Шиппинг | — | merge в `dev`/`main` и deploy делает человек. Инвариант. |

**Идемпотентность** (повторный запуск не дублирует работу): задача считается взятой, если уже есть ветка `feature/<номер>-*` — следующий цикл её пропускает. Статус пишется **комментарием в issue** (`gh issue comment`), не файлом. Цикл НЕ коммитит в `dev`/`main` и НЕ пушит (обе ветки автодеплоят на push).

## Работа с issue (грумминг)

Цикл — исполнитель, а не продакт-менеджер: сам issue он НЕ создаёт и НЕ дробит. Подготовка бэклога — отдельный шаг (периодически, человеком или груминг-проходом через `/autoplan`/`/spec`):

- **Эпик** (`[epic]` в заголовке) — контейнер; под-фичи живут чек-боксами в теле и циклу не видны. Эпик нужно **декомпозировать** на отдельные child-issue: одна issue = одна фича на один цикл.
- **`autodev-ready`** — метка «можно брать автономно»: внутренняя кодовая работа, размер ≈ ≤ один цикл, зависимости закрыты, нет барьера внешнего доступа. Только такие issue входят в цикл.
- **`needs-human`** (или `blocked:access`) — нужен внешний доступ (аккаунт/OAuth/платный API/партнёрка) или решение человека. В цикл не попадает.
- Зависимость: метку `autodev-ready` ставят, только когда issue-зависимости закрыты/смёржены.

## Verify (точные команды)

Backend — из `backend/` (venv активен):
```bash
# 1. Импорт контента: 0 ошибок (офлайн)
python -c "import sys; from pathlib import Path; from app.importer import load_content; ns, errs = load_content(Path('../content')); print(f'{len(ns)} nodes, {len(errs)} errors'); sys.exit(1 if errs else 0)"
# 2. Тесты
INTERVIEW_DB_PATH=/tmp/iv_verify.db python -m pytest -q; rm -f /tmp/iv_verify.db
```
Frontend — из `frontend/`:
```bash
# 3. Типы + бандл
npm ci && npm run build          # = tsc --noEmit -p tsconfig.json && vite build
# 4. Smoke (нужен сервер на :8000)
npm run smoke                    # node smoke.mjs, playwright headless
```
Сервер для smoke (из `backend/`, фон): `python -m uvicorn app.main:app --port 8000`, дождаться `curl -sf http://localhost:8000/api/graph`.

Что когда запускать: правка `backend/app/` → §1+§2; правка `frontend/src/` → §3+§4; правка контента → §1+§2(+§4). Зелёный гейт = `interview-verify` печатает «ALL SMOKE CHECKS PASSED ✓».

## Деплой (в автономном цикле НЕ выполняется)

GitHub Actions: push/merge в `main` → prod (:8800, `deploy.yml`); push в `dev` → dev (:8801, `deploy-dev.yml`). CI (`ci.yml`) — на PR в dev/main и push в `feature/**`.

## STOP-условия (любое → остановка)

- Нет open issues с меткой `autodev-ready` без ветки `feature/<номер>-*` (бэклог разобран — нужен груминг).
- ≥ 3 открытых веток `feature/*` (накопились кандидаты — нужно ревью).
- 2 провала Verify подряд.
- Исчерпан бюджет циклов (аргумент launcher).

## Запуск

`./.claude/run-autodev.sh [N]` — N циклов (по умолчанию 1), headless `claude -p` с `OPENCLAW_SESSION=1` (gstack-скиллы без вопросов: авто-выбор рекомендованного). Детали — в скрипте.
