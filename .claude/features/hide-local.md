---
slug: hide-local
title: Скрыть вопрос с доски (локально)
status: done
created: 2026-05-30
branch: feature/hide-local
verify: pass (build + pytest 11 + smoke 9/9)
review: ok (нет замечаний — сигнатура/вызов синхронны, hidden вливается в dimmed, drawer-кнопка работает на скрытом)
---

## Проблема / цель
По ходу интервью часть вопросов нерелевантна, но фильтры (блок/сложность/тип/теги) — грубые. Нужен точечный
способ убрать конкретный вопрос с **своей доски** одним кликом, обратимо, без удаления из банка и без мутации
`content/`. Защита от случайной потери: хранение локальное (localStorage), не трогает файлы/БД/импорт.

## Поведение / UX
- В drawer вопроса — кнопка **«🙈 Скрыть»** (если скрыт — **«↩ Вернуть»**). Клик добавляет/убирает id из
  множества скрытых (`hiddenIds`, персист в localStorage).
- Скрытый вопрос **гаснет на доске** (вливается в существующий `dimmed`: 0.15 непрозрачности, не кликабелен) —
  пока выключен тумблер «Скрытые».
- В панели отображения шапки — тумблер **«🙈 Скрытые»**: включён → скрытые показываются нормально (можно
  открыть и вернуть), на карточке — пометка 🙈. Выключен (дефолт) → скрытые погашены.
- Семантика: прячет только с **доски этого браузера**. Banking/сэмплинг (`/api/interview`), экспорт банка
  (🗂 Банк) и отчёт НЕ затрагиваются (это «вид», не удаление).
- Крайние случаи: скрыть текущий/выбранный вопрос — ок (гаснет; в drawer кнопка становится «Вернуть»).
  Битый localStorage → стартуем с пустого множества (try/catch).

## Затрагиваемые слои и файлы
- backend: нет.
- frontend: `App.tsx` (state `hiddenIds: Set<string>` + `showHidden`, персист, `toggleHide(id)`, проброс в
  `buildNodes` → `dimmed` + флаг `hidden` в data, тумблер `.tb__toggle` в `.toolbar`, проброс в drawer),
  `components/DetailDrawer.tsx` (кнопка «Скрыть/Вернуть» + проп `hidden`/`onToggleHide`),
  `components/QuestionNode.tsx` (пометка 🙈 при `data.hidden && showHidden`), `styles.css` (мелкая пометка).
- content: нет.
- tests: `frontend/smoke.mjs` — открыть вопрос → «Скрыть» → карточка `qnode--dimmed`; тумблер «Скрытые» →
  не dimmed.

## Модель данных
Без изменений схемы `Node` (ОБХОД ловушки `extra="forbid"` — ничего не пишем в ноду/контент). Новый ключ
localStorage `hiddenIds` = `string[]` (сериализованный Set id). Не сущность БД.

## Решения (с обоснованием)
- **localStorage, не frontmatter/БД** (по совету агента): per-browser, view-only, мгновенно обратимо; ноль
  мутаций `content/`, не трогает импорт/дедуп/`parse_file`/`extra="forbid"`. frontmatter `hidden:` = другая,
  тяжёлая фича (правка `models.py`+`types.ts`+sampler/export). БД — оверкилл.
- **Вливание в существующий `dimmed`**, а не отдельный параллельный механизм — консистентно с фильтрами;
  скрытый = негашёный/некликабельный, как отфильтрованный. (На `main` `dimmed` = block/diff/kind/tag; держать
  предикат рядом, комментарием отметить «+ hidden».)
- **Тумблер «показать скрытые»** для обратимости/аудита — иначе скрытое не вернуть с доски.
- **Не трогаем backend/экспорт** — «скрыть» это вид интервьюера, а не правка банка (для удаления есть отдельная
  идея `node-delete`).

## План реализации (чеклист для feature-build)
1. [x] **state+persist**: `hiddenIds` (Set, init из localStorage `hiddenIds` через try/catch) + `showHidden`
   (bool); `useEffect` персиста `[...hiddenIds]`; `toggleHide(id)` (add/delete + setState новый Set).
   Коммит `feat(hide-local): hidden set state + persist`.
2. [x] **buildNodes/dimmed**: добавить параметры `hiddenIds`, `showHidden`; `dimmed |= (hiddenIds.has(n.id) &&
   !showHidden)`; в `data` положить `hidden: hiddenIds.has(n.id)`; проброс в `rfNodes` вызов + deps.
   Коммит `feat(hide-local): fold hidden into dimmed`.
3. [x] **drawer button**: в `DetailDrawer.tsx` проп `hidden`+`onToggleHide`, кнопка «🙈 Скрыть»/«↩ Вернуть» в
   `.drawer__actions` (класс `.drawer__hide`); проброс из `App.tsx`. Коммит `feat(hide-local): drawer hide button`.
4. [x] **toolbar toggle + marker**: тумблер «🙈 Скрытые» (`.tb__toggle`) в `.toolbar`; в `QuestionNode.tsx` —
   пометка 🙈 при `data.hidden && showHidden`; стиль. Коммит `feat(hide-local): show-hidden toggle + card marker`.
5. [x] **smoke**: открыть вопрос → `.drawer__hide` → карточка `.qnode--dimmed` (+1); тумблер «Скрытые» → не
   dimmed (0). Коммит `test(hide-local): smoke`.

## Тесты / приёмка
- [x] smoke: клик по карточке (drawer) → клик `.drawer__hide` → `.qnode--dimmed` count ≥1; клик
  `.tb__toggle` «Скрытые» → `.qnode--dimmed` снова 0 (скрытый показан). Повторный «Вернуть» — опц.
- [x] interview-verify зелёный (build + pytest + smoke).
- [x] визуально: скрыл → погас; «Скрытые» on → видно с 🙈; «Вернуть» → вернулся; F5 → состояние держится.

## Риски / открытые вопросы
- Скрытое — per-browser, не синкается между машинами (для локального инструмента норм; «банк-уровневое»
  скрытие — отдельная frontmatter-фича на будущее).
- `dimmed`-семантика (0.15, не display:none) — скрытый всё ещё бледно виден; для «настоящего» удаления с
  глаз — `node-delete`. Здесь осознанно «вид», обратимо.
