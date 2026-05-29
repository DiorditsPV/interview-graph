---
slug: interview-tracks
title: Выбор направления интервью (треки/роли)
status: designed
created: 2026-05-30
branch: feature/interview-tracks
verify: —
review: —
---

## Проблема / цель
Сейчас доска заточена под одну роль (дата-инженер). Нужно выбирать **направление интервью**
(дата-инженер / бэкенд-разработчик / аналитик / …) и набор под-фич вокруг переключения, чтобы один
и тот же банк вопросов подавался под нужную роль: ведущий выбирает трек — доска фокусируется на
релевантных вопросах, навигация и сэмплер уважают трек, отчёт фиксирует, под какую роль было интервью.

## Поведение / UX
- В шапке — селект «Направление» (`<select>`): Дата-инженер (по умолч.), Бэкенд-разработчик, Аналитик.
- Выбор трека **гасит** вне-трековые карточки (как блок/сложность/тег-фильтры — `opacity .15`,
  `pointer-events:none`), не удаляя их. Колонки не схлопываются (консистентно с текущими фильтрами).
- Навигация `Дальше →`, стрелки и сэмплер `/api/interview` работают **только по вопросам трека**
  (с учётом прочих активных фильтров).
- Выбор трека запоминается (localStorage). HTML-отчёт в шапке показывает выбранное направление.
- Крайние случаи: трек, под который в банке нет вопросов в каком-то блоке — просто пустая зона
  (не ошибка). «Дальше» при пустом трек-срезе — не двигается (как сейчас при пустом фильтре).

## Затрагиваемые слои и файлы
- **backend**: `content/tracks.yaml` (новый конфиг), `app/main.py` (`GET /api/tracks`, опц. `track` в
  `POST /api/interview`), `app/sampler.py` (фильтр пула по треку), `tests/test_app.py`.
- **frontend**: `types.ts` (`Track`), `api.ts` (`tracks()`), `App.tsx` (state `activeTrack` + localStorage,
  селект в шапке, `inTrack`-предикат в `buildNodes` → `dimmed`, трек-аварная навигация), `report.ts`
  (трек в шапке отчёта), `styles.css` (стиль селекта — переиспользуем `.tb__select`).
- **content**: новый `content/tracks.yaml`. Ноды НЕ трогаем (трек матчится по block/subblock).
- **tests**: pytest на `/api/tracks`; smoke — селект присутствует, переключение гасит часть нод.

## Модель данных
**Новая сущность Track (не поле ноды)** — в `content/tracks.yaml`:
```yaml
tracks:
  - id: data-engineer
    label: Дата-инженер
    include: []                        # пусто = весь банк
  - id: backend
    label: Бэкенд-разработчик
    include: [python, platform, databases/sql, databases/dbms, databases/storage, frameworks/airflow]
  - id: analyst
    label: Аналитик
    include: [databases/sql, databases/dbms, python, platform]
```
Матчер: нода **в треке**, если `include` пуст ИЛИ её `block` или `"block/subblock"` есть в `include`.
Модель `Node` не меняется (`extra="forbid"` не трогаем), миграции контента нет.

## Решения (с обоснованием)
- **Трек = профиль-охват над block/subblock, а не поле ноды** — работает на текущем DE-банке сразу,
  без тегирования 61 ноды и правки модели. Отвергнут вариант «поле `roles` на каждой ноде» (дорого,
  ломает `extra="forbid"`, требует миграции). Профили легко расширить позже (добавить топики/теги в матчер
  или отдельные банки на трек).
- **Гасим, а не скрываем** вне-трековые — консистентно с блок/сложность/тег-фильтрами; колонки стабильны.
- **Сэмплер уважает трек через фильтр пула** (веса блоков оставляем глобальными) — минимальное изменение;
  override весов на трек — на будущее.
- Дефолт — `data-engineer` (всё) — текущее поведение не меняется для тех, кто не переключает.

## План реализации (чеклист для feature-build) — под-фичи в одной ветке (коммит на под-фичу)
1. [ ] **track-config (backend)**: `content/tracks.yaml`; загрузка (helper в `sampler.py` или новый
   `tracks.py`); `GET /api/tracks` в `main.py`; pytest на эндпоинт. Коммит `feat(tracks): config + /api/tracks`.
2. [ ] **track-selector (frontend)**: `Track` в `types.ts`, `api.tracks()`; `activeTrack` state + localStorage;
   `<select>` в шапке (`.tb__select`). Коммит `feat(tracks): track selector in topbar`.
3. [ ] **track-scoping (frontend)**: `inTrack(node, track)` + добавить в `dimmed` в `buildNodes`
   (рядом с block/diff/tag/kind). Коммит `feat(tracks): scope board to selected track`.
4. [ ] **track-aware-nav (frontend+backend)**: `nextQuestion`/стрелки идут по видимому трек-срезу;
   `/api/interview` принимает `track` и фильтрует пул в `sampler.build_interview`. Коммит
   `feat(tracks): track-aware next/arrows/sampler`.
5. [ ] **track-in-report (frontend)**: `report.ts` — направление в шапке отчёта; передать label из App.
   Коммит `feat(tracks): show track in report`.
6. [ ] Обновить `smoke.mjs` (+ селект и проверка гашения) и `interview-verify`.

## Тесты / приёмка
- [ ] pytest: `GET /api/tracks` возвращает ≥3 трека с `id/label/include`; `POST /api/interview {track}`
  не выходит за пределы трека.
- [ ] smoke: в шапке есть селект направления; переключение на «Аналитик» гасит ≥1 ноду (`.qnode--dimmed`).
- [ ] ручной: выбрать «Бэкенд» → PySpark/стриминг-карточки гаснут; `Дальше` не уводит в погашенное;
  скачать отчёт → в шапке указан трек. Скриншот светлая/тёмная.
- [ ] interview-verify зелёный (import + pytest + build + smoke).

## Риски / открытые вопросы
- Дефолтные охваты треков (backend/analyst) — экспертная прикидка; легко поправить в `tracks.yaml`
  без кода.
- Если позже захочется отдельных банков вопросов на трек (а не профиль над общим) — матчер расширяется,
  но это уже следующая итерация.
