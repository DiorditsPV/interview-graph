---
slug: candidate-compare
title: Сравнение кандидатов по блокам
status: done
created: 2026-05-30
branch: feature/candidate-compare
merged: integration/all-ideas
verify: pass
review: ok — багов нет (route-order проверен живым запросом, не 422)
---

## Проблема / цель
Нанимающему нужно сравнить несколько кандидатов между собой: у кого сильнее базы, у кого фреймворки.
Сейчас оценки видны только по одной сессии за раз. Нужен агрегат «средний балл по блокам» по выбранным
сессиям рядом, в одной таблице.

## Поведение / UX
- В шапке — кнопка `📊 Сравнить` (`.cmpbtn`). Открывает модалку-оверлей `.cmp-modal`.
- Модалка: список всех сохранённых сессий (кандидат · дата) с чекбоксами. Пользователь отмечает ≥1.
  Кнопка `Сравнить выбранные` (`.cmp-modal__run`, disabled при 0 выбранных).
- По нажатию — запрос агрегата и таблица `.cmp-table`: строки = блоки (frameworks/databases/python/platform) +
  итоговая строка «Итого»; колонки = выбранные кандидаты; ячейка = средний балл (1 знак) или «—», если в блоке
  нет оценок. Заголовок колонки = имя кандидата.
- Крайние случаи: сессий нет → в модалке «Нет сохранённых сессий». Выбрана 1 сессия → одна колонка (валидно).
  Сессия без оценок → во всех ячейках «—», «Итого» «—».
- Закрытие: кнопка ✕ / клик по фону / Esc.

## Затрагиваемые слои и файлы
- backend: `main.py` (новый роут `GET /api/sessions/compare`), агрегацию считаем в роуте
  (node→block из `load_content`), без изменений `db.py`/схемы.
- frontend: `api.ts` (`listSessions`, `compareSessions`), `types.ts` (`SessionSummary`, `BlockAgg`,
  `SessionAgg`, `Comparison`), `components/CompareModal.tsx` (новый), `App.tsx` (кнопка + state `compareOpen` +
  рендер модалки), `styles.css` (`.cmp-modal*`, `.cmp-table`, `.cmpbtn`).
- content: нет.
- tests: `backend/tests/test_app.py` (две сессии + оценки → GET compare → проверка структуры/средних);
  `frontend/smoke.mjs` (старт сессии → оценка → открыть Сравнить → выбрать → таблица с именем кандидата).

## Модель данных
Без изменений схемы. Новый АГРЕГАТ (вычисляемый, не хранимый):
```
GET /api/sessions/compare?ids=1,2,3
→ {
  "blocks": ["frameworks","databases","python","platform"],   # только реально присутствующие, в фикс. порядке
  "sessions": [
    {"id":1,"candidate":"A","created_at":"...",
     "overall": {"avg": 3.7, "scored": 12},
     "byBlock": {"frameworks": {"avg": 4.0, "scored": 3}, "databases": {"avg": null, "scored": 0}, ...}}
  ]
}
```
- `avg` = среднее по выставленным оценкам блока, округл. до 2 знаков; `null` при `scored=0`.
- node→block берём из `load_content(CONTENT_DIR)`; оценки неизвестных `node_id` (устаревшие) пропускаем.

## Решения (с обоснованием)
- **Агрегация в роуте `main.py`, не в `db.py`** — нужна привязка node→block из контента (она уже грузится в
  `main.py`); добавлять в `db.py` зависимость от контента не хочется. Без изменения схемы/таблиц.
- **`ids` как CSV-строка query-параметра** (`?ids=1,2`), парсим в роуте — просто и совместимо с `fetch`.
  Пустой/битый список → HTTP 400. Несуществующие id — пропускаем молча (не 404 на весь батч).
- **Список сессий через существующий `GET /api/sessions`** (он уже на main) — на main нет session-list UI
  (он на ветке session-resume), поэтому строим минимальный собственный список внутри модалки. Не дублируем
  доску — это отдельная аналитическая модалка.
- **Блоки в ответе — фиксированный порядок** `frameworks→databases→python→platform` (как BLOCK_ORDER фронта),
  фильтруем по реально встретившимся в контенте. Среднее по блоку — простое арифметическое (веса не применяем:
  сравниваем сырое качество ответов).
- **Отдельный компонент `CompareModal.tsx`** — чтобы не раздувать `App.tsx`; в App только кнопка+флаг+рендер.
- **Scope:** только in-app панель-таблица. HTML-экспорт сравнения НЕ делаем (есть отдельная идея bank-export
  и report.ts для одиночного отчёта) — чтобы не размывать фичу. Отмечено в рисках.

## План реализации (чеклист для feature-build)
1. [ ] **backend agg**: в `main.py` роут `GET /api/sessions/compare` (parse `ids`, node→block из load_content,
   per-session overall+byBlock, avg округл. 2 знака, null при 0). **КРИТИЧНО: объявить ДО
   `/api/sessions/{session_id}`** — иначе `compare` матчится как `{session_id}: int` → 422. + тест в
   `test_app.py` (использовать существующий tmp-DB фикстуру/override, НЕ прод `interview.db`).
   Коммит `feat(candidate-compare): /api/sessions/compare aggregate endpoint`.
2. [ ] **api+types**: `types.ts` (SessionSummary/BlockAgg/SessionAgg/Comparison), `api.ts`
   (`listSessions(): SessionSummary[]`, `compareSessions(ids): Comparison`).
   Коммит `feat(candidate-compare): api + types`.
3. [ ] **modal UI**: `components/CompareModal.tsx` (список+чекбоксы → таблица), кнопка `.cmpbtn` в topbar +
   `compareOpen` state в `App.tsx`. Esc/фон закрывают. Коммит `feat(candidate-compare): compare modal`.
4. [ ] **styles**: `.cmpbtn`, `.cmp-modal` (оверлей+карта), `.cmp-modal__list`, `.cmp-table` — через
   CSS-переменные тем. Коммит `feat(candidate-compare): styles`.
5. [ ] **smoke**: старт сессии → оценка → Сравнить → выбрать → `.cmp-table` с именем кандидата.
   Коммит `test(candidate-compare): smoke`.

## Тесты / приёмка
- [ ] pytest: 2 сессии с оценками в разных блоках → `GET /api/sessions/compare?ids=..` → `blocks` непустой,
  `sessions` длины 2, `overall.avg` совпадает с ручным средним, `byBlock` пустого блока → `avg=null`.
- [ ] smoke: ввести кандидата → «Начать сессию» → оценить ноду (3/5) → `📊 Сравнить` → отметить сессию →
  «Сравнить выбранные» → `.cmp-table` видна и содержит имя кандидата.
- [ ] interview-verify зелёный (import + pytest + build + smoke).

## Риски / открытые вопросы
- Накопление тестовых сессий в `interview.db` от smoke-прогонов — список растёт; для модалки ок (берём
  newest-first). Чистка БД — вне scope.
- HTML-экспорт сравнения не входит в фичу (отдельно). Если понадобится — расширить `report.ts` позже.
- Среднее без весов блоков — осознанно (сравниваем сырое качество); веса — на будущее.
