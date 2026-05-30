# FEATURE_IDEAS.md — бэклог фич для автогенерации

Источник идей для луп-пайплайна (feature-design → feature-build). Контекст «что уже сделано» —
в `FEATURES.md`; спроектированные спеки — в `.claude/features/<slug>.md`.

**Легенда:** `[ ]` — не реализована, `[x]` — реализована (в скобках ветка `feature/<slug>`).
**Правила:** одна идея = один `slug` (kebab-case). Дедуп по slug. Не дублируй то, что уже в `FEATURES.md`.
Формат: `- [ ] <slug>: <краткое описание> — <подсказка по слоям/объёму>`.

## Идеи
- [x] topbar-redeclutter (feature/topbar-redeclutter, от integration/all-ideas) — шапка разгружена в ДВА ряда (ряд 1 = флоу: заголовок/направление/сессия/прогресс/Скачать; ряд 2 = служебное: панель отображения/Загрузить/Сравнить/Банк/?/тема), заголовок больше не переносится. Дизайнер-консультация; реф image.png. Полный integration-smoke зелёный.
- [x] interview-tracks (feature/interview-tracks) — выбор направления интервью (треки-профили над block/subblock)
- [x] session-resume (feature/session-resume) — загрузка прошлой сессии кандидата на доску (восстановление оценок)
- [x] node-notes (feature/node-notes) — заметка интервьюера на вопрос (drawer textarea, персист с оценкой, в отчёте)
- [x] interview-timer (feature/interview-timer) — таймеры вопроса и сессии в HUD (тик 1с, localStorage)
- [x] question-search (feature/question-search) — поиск по тексту вопросов, гасит несовпавшие карточки
- [x] unscored-filter (feature/unscored-filter) — тумблер «только неоценённые» (задачи уже есть в фильтре Тип)
- [x] interview-progress (feature/interview-progress) — прогресс-бар оценено/всего по текущему набору фильтров в шапке
- [x] candidate-compare (feature/candidate-compare) — модалка сравнения сессий: средние баллы по блокам (backend-агрегат /api/sessions/compare)
- [x] bank-export (feature/bank-export) — экспорт всего банка вопросов (вопрос+ответ+критерии) в печатный HTML
- [x] shortcuts-help (feature/shortcuts-help) — оверлей хоткеев по «?» с захватом клавиатуры (capture-фаза)
- [x] md-upload (feature/md-upload) — загрузка .md/.json вопросов через dropzone: POST /api/import (валидация + запись в content/), доска перезагружается
- [x] ux-live-polish (feature/ux-live-polish) — пакет UX: акцентное кольцо текущего (фикс currentColor), тинты 0.10, теги 2+N, HUD-прогресс+топик, CTA на 100%, свёртка тегов. Out-of-scope (→ будущие идеи): сайдбар-агенда из placement.order, кодирование прогресса в минимапе, фильтро-осознанная навигация по visibleIds.

## Сгенерировано автоматически (из out-of-scope ux-live-polish)
- [x] agenda-sidebar (feature/agenda-sidebar) — сайдбар-агенда (.interview): список вопросов из placement.order по блокам, ✓ на оценённых, клик → текущий + центрирование, тоггл в шапке
- [x] minimap-progress (feature/minimap-progress) — минимапа кодирует прогресс: текущий красным, оценённые серым (+ фикс: v12-минимапе добавлены размеры нод, иначе была пустой)
- [x] filter-aware-nav (feature/filter-aware-nav) — «Дальше»/стрелки навигируют только по видимым (не-dimmed) нодам через visibleIds
- [x] draft-autosave (feature/draft-autosave) — автосохранение оценок без сессии в localStorage + восстановление при перезагрузке; чистится при старте именованной сессии

<!-- feature-build переносит реализованные идеи сюда: - [x] <slug> (feature/<slug>) -->

## Продающие фичи (платная версия)
Отдельный блок paid-тира. Логика монетизации: **free** = один интервьюер локально; **paid** = команда / облако / интеграции.
Формат строки: `slug` · **ценность** (за что платят) · _объём по слоям_ — последнее остаётся подсказкой для feature-design/feature-build.

- [ ] team-workspace — **командное облако: история всех кандидатов и общий банк в одном месте, а не на ноутбуке каждого; роли и доступы.** Платит компания/рекрут-команда, это база для остальных paid-фич. _backend: auth (JWT/OAuth), мульти-тенант, миграция SQLite→Postgres, RBAC; фронт: логин, переключатель воркспейса._
- [ ] live-panel — **панельные и удалённые интервью без рассинхрона: несколько интервьюеров на одной доске в реальном времени, синхрон оценок/заметок, сведение панельных баллов.** Платят распределённые команды. _backend: websockets, presence; фронт: индикаторы присутствия, merge оценок._
- [ ] ats-integration — **вписывается в существующий HR-процесс: скоркарты и отчёты улетают прямо в карточку кандидата в ATS, нет двойного ввода.** Снимает главный барьер внедрения в компании. _backend: коннекторы/вебхуки к Greenhouse/Lever/Huntflow, OAuth провайдеров, календарь._
- [ ] white-label-reports — **отчёт под брендом компании/агентства: лого, цвета, кастомные секции, batch-экспорт по нескольким кандидатам, защищённая ссылка вместо PDF.** Прямо продаваемая ценность для рекрут-агентств. _расширение src/report.ts + backend share-link._
