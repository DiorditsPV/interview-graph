---
slug: agenda-sidebar
title: Сайдбар-агенда (список вопросов с переходом)
status: done
created: 2026-05-30
branch: feature/agenda-sidebar
merged: integration/all-ideas
verify: pass
review: ok — багов нет (стили самодостаточны, без зависимости от --accent другой ветки)
---

## Проблема / цель
В styles.css уже есть готовые, но НИГДЕ не отрендеренные классы `.interview`/`.ivbtn` (задел под список-агенду).
Большой граф (61 нода) неудобно обозревать только на канве. Нужен левый сайдбар со списком вопросов в порядке
`placement.order`, с быстрым переходом по клику (выбор + центрирование) и отметкой оценённых — обзор и навигация
«списком», дополняющие канву.

## Поведение / UX
- Тоггл `☰ Агенда` (`.tb__toggle`) в панели отображения шапки; состояние в localStorage (`agendaOpen`).
  По умолчанию выключен (не меняем дефолтную раскладку).
- При включении слева от канвы — `<aside class="interview">`: вопросы в порядке `placement.order.flat()`,
  сгруппированы по блоку (заголовок блока при смене). Каждый пункт — `.ivbtn` с левым бордером цвета блока,
  показывает короткий `title` (или topic), ✓ если оценён, и подсвечен если это текущий вопрос.
- Клик по пункту → `moveCurrent(id)` (ставит «текущий» + центрирует канву на ноде) → появляется HUD ведущего.
- Крайние случаи: граф ещё не загружен → сайдбара нет (рендерим только при `placement`). Узкие экраны —
  сайдбар фикс. ширины 260px (как в готовом CSS), канва ужимается (flex).

## Затрагиваемые слои и файлы
- backend: нет.
- frontend: `App.tsx` (state `agendaOpen` + localStorage, memo `agendaRows`, `<aside>` перед `.canvas`,
  кнопка-тоггл в `.toolbar`), `styles.css` (расширить `.interview`/`.ivbtn`: заголовок блока `.iv-block`,
  состояния `.ivbtn--current`/`.ivbtn--scored`, галочка).
- content: нет.
- tests: `frontend/smoke.mjs` — включить агенду → `.interview` с `.ivbtn` (>0); клик по первому пункту →
  HUD показывает выбранный вопрос (current).

## Модель данных
Без изменений. Источник — существующие `placement.order` (string[][]) + `nodeMap` + `scores`.

## Решения (с обоснованием)
- **Переиспользуем готовые `.interview`/`.ivbtn`** (задел в CSS) — фича именно про их «подключение»; добавляем
  лишь состояния/заголовок.
- **Порядок из `placement.order.flat()`** — единый с клавиатурной навигацией; колонки уже упорядочены по блокам,
  поэтому соседство блоков сохраняется при flatten → группировка заголовком по смене `block`.
- **Клик → `moveCurrent`** (а не отдельная логика) — переиспользуем существующее (current + centerOn), даёт HUD.
- **`agendaRows` как memo** (header|item) — без побочных эффектов в рендере; чисто и тестируемо.
- **Тоггл в localStorage, по умолчанию off** — не меняем стартовую раскладку; единообразно с guides/bgVariant.
- **Слева, фикс. ширина** — как заложено в `.interview` (`border-right`, `width:260px`); канва — flex.

## План реализации (чеклист для feature-build)
1. [ ] **state**: `const [agendaOpen, setAgendaOpen] = useState(() => localStorage.getItem("agendaOpen")==="1")`
   + useEffect персиста; кнопка `.tb__toggle` «☰ Агенда» в `.toolbar`. Коммит `feat(agenda-sidebar): toggle state + button`.
2. [ ] **memo+render**: `agendaRows` (header при смене block, иначе item) из `placement.order.flat()`+`nodeMap`;
   `<aside class="interview">` перед `.canvas` при `agendaOpen && placement`; пункт = `.ivbtn` (border-left цвет
   блока, title, ✓ если `scores[id]!=null`, `--current` если `id===currentId`), onClick `moveCurrent(id)`.
   Коммит `feat(agenda-sidebar): render agenda list with jump-to-node`.
3. [ ] **styles**: `.iv-block` (заголовок блока), `.ivbtn--current` (акцент `--accent`), `.ivbtn--scored` (✓/приглушение).
   Коммит `feat(agenda-sidebar): agenda item states styles`.
4. [ ] **smoke**: включить агенду → `.interview .ivbtn` >0; клик по первому → HUD `.hud__title` непустой.
   Коммит `test(agenda-sidebar): smoke`.

## Тесты / приёмка
- [ ] smoke: клик по тоггл-кнопке «Агенда» → виден `.interview`, `.ivbtn` count >0; клик по первому `.ivbtn` →
  `.hud` появляется и `.hud__title` непустой (нода стала текущей).
- [ ] interview-verify зелёный (build + pytest + smoke).
- [ ] визуально: ✓ на оценённых, подсветка текущего, центрирование при клике.

## Риски / открытые вопросы
- 61 пункт в сайдбаре — длинный список; `.interview` уже `overflow-y:auto`. Группировка по блокам облегчает.
- Тоггл-кнопок в `.toolbar` станет 4 (Точки/Верт/Гор/Агенда) — проверить, что шапка не переполняется (ок).
