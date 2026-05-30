---
slug: draft-autosave
title: Автосохранение черновика оценок (без сессии)
status: done
created: 2026-05-30
branch: feature/draft-autosave
verify: pass
review: ok — багов нет (readDraftScores try/catch+валидация; персист на [scores]; startSession чистит)
---

## Проблема / цель
Частый сценарий: ведущий оценивает вопросы **без** запуска именованной сессии (просто прогоняет кандидата
«на лету»). Сейчас такие оценки живут только в React-стейте `scores` — refresh вкладки, краш или случайное
закрытие теряют всё. `session-resume` восстанавливает ТОЛЬКО сохранённые в БД именованные сессии, а «быстрая»
оценка не защищена. Нужно автосохранять текущие оценки в localStorage и восстанавливать при перезагрузке.

## Поведение / UX
- Любое изменение `scores` (оценка вопроса) — пишется в localStorage (ключ `draftScores`), без явного действия.
- При загрузке приложения `scores` инициализируется из `draftScores` → оценки на доске сразу восстановлены
  (карточки `qnode--scored`, прогресс/HUD считаются как обычно).
- **Старт именованной сессии** (`startSession`) — очищает черновик (новый кандидат начинает с чистого листа;
  дальше персист идёт в БД через `applyScore`).
- Крайние случаи: пустой/битый `draftScores` → стартуем с `{}` (try/catch на parse). Черновик хранит только
  `node_id→score` (числа 1–5), ничего лишнего.

## Затрагиваемые слои и файлы
- backend: нет.
- frontend: `App.tsx` — (1) ленивая инициализация `useState(scores)` из `localStorage.draftScores` (с try/catch
  + валидацией object→number); (2) `useEffect` персиста `scores`→localStorage при изменении; (3) `startSession`
  чистит `draftScores`.
- content: нет.
- tests: `frontend/smoke.mjs` — оценить ноду → `page.reload()` → оценка восстановлена (`.qnode--scored` ≥1).

## Модель данных
Без изменений схемы. Новый ключ localStorage `draftScores` = `Record<string, number>` (тот же формат, что
React-стейт `scores`). Не сущность БД.

## Решения (с обоснованием)
- **localStorage, не БД** — черновик по определению «несохранённая» работа; БД-персист — это именно именованная
  сессия (`session-resume`). Не дублируем сессии, защищаем промежуточный стейт.
- **Чистим черновик при `startSession`** — именованная сессия берёт на себя персист (БД); черновик прошлой
  «быстрой» оценки не должен протекать в новую сессию. Альтернатива (не чистить) путала бы стартовый набор.
- **Ленивая инициализация стейта** (а не отдельный restore-эффект) — оценки доступны с первого рендера, без
  «мигания» пустой доски.
- **try/catch + валидация при чтении** — битый/чужой localStorage не должен ронять загрузку.
- **Совместимость с session-resume/active session**: при активной сессии оценки идут и в БД, и в черновик —
  на reload черновик локально восстановит их (доп. устойчивость), при этом загрузка прошлой сессии перезапишет
  стейт штатно. Не конфликтует.

## План реализации (чеклист для feature-build)
1. [ ] **init+persist**: `const [scores, setScores] = useState(() => readDraft())` где `readDraft()` —
   try/catch `JSON.parse(localStorage.getItem("draftScores")||"{}")` с отбором числовых значений;
   `useEffect(() => localStorage.setItem("draftScores", JSON.stringify(scores)), [scores])`.
   Коммит `feat(draft-autosave): persist+restore scores via localStorage`.
2. [ ] **clear on session**: в `startSession` перед/после `setScores({})` — `localStorage.removeItem("draftScores")`.
   Коммит `feat(draft-autosave): clear draft on new session`.
3. [ ] **smoke**: оценить ноду → reload → `.qnode--scored` ≥1. Коммит `test(draft-autosave): smoke`.

## Тесты / приёмка
- [ ] smoke: открыть, оценить вопрос (звезда в drawer) → `page.reload({waitUntil:"networkidle"})` →
  после загрузки `.qnode--scored` ≥1 (оценка восстановлена из черновика).
- [ ] interview-verify зелёный (build + pytest + smoke).
- [ ] визуально: оценил без сессии → F5 → оценки на месте; «Начать сессию» → доска чистая.

## Риски / открытые вопросы
- Черновик переживает закрытие вкладки до бесконечности — для локального инструмента ок; «сбросить черновик»
  при желании = «Начать сессию» (чистит) или ручной clear. Явную кнопку сброса не вводим (вне scope).
- Накопление в smoke: playwright стартует чистый контекст на каждый прогон → черновик не протекает между ранами.
