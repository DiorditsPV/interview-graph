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
**free** = один интервьюер локально; **paid** = команда / облако / интеграции.

- [ ] team-workspace — командное облако: история кандидатов и общий банк в одном месте, роли и доступы. База для остального paid-тира.
- [ ] live-panel — панельные/удалённые интервью в реальном времени: синхрон оценок/заметок, сведение баллов.
- [ ] white-label-reports — отчёты под брендом компании/агентства: лого, batch-экспорт, шаринг по ссылке.

## Интеграции с внешними системами (РФ)
Встраивание в инфраструктуру российских компаний — одна из важнейших тем для продаж в РФ (без интеграций решение не внедряют).
Детали, карта рынка и приоритеты: [`docs/integrations/`](docs/integrations/README.md) · перед реализацией — [`_verify.md`](docs/integrations/_verify.md).

- [ ] integration-hub — **(P0)** коннектор-платформа: токены, маппинг полей, вебхуки с очередью, журнал. Фундамент остальных.
- [ ] ats-huntflow-sync — **(P0)** двусторонний синк с Huntflow: импорт кандидатов/вакансий, обратная запись скоркарта/статуса.
- [ ] scheduler-page — **(P1)** страница-расписание: кандидат при назначении встречи → клик «Начать интервью» прямо в доску.
- [ ] calendar-email-sync — **(P1)** синк с корпоративным календарём/почтой (CalDAV/ICS, SMTP/IMAP): инвайты, занятость, RSVP.
- [ ] sso-ru-identity — **(P1)** корпоративный вход: OIDC/SAML/LDAP (Keycloak, AD, ALD Pro), Yandex ID / VK ID.
- [ ] hh-jobboards-import — **(P1)** импорт вакансий и откликов/резюме из hh.ru (задел под Avito Работа/SuperJob).
- [ ] storage-ru-disks — **(P1)** хранилище артефактов: Яндекс 360 / VK / МойОфис / S3-совместимое. Удобство + 152-ФЗ.
- [ ] notify-telegram-vkteams — **(P1)** уведомления и боты: Telegram / VK Teams / Пачка — напоминания, статусы.
- [ ] crm-bitrix-amocrm — **(P2)** экспорт результата в Bitrix24/amoCRM (карточка/сделка + отчёт + статус).
- [ ] erp-1c-hrm — **(P2)** обмен с 1С:ЗУП/1С:ERP: передача нанятого в кадровый учёт, справочники.
- [ ] video-vks-ru — **(P2)** видеоинтервью из доски: Яндекс Телемост / TrueConf / Контур.Толк / VK Звонки.
- [ ] compliance-rf — **(P1 для гос/крупных)** 152-ФЗ, on-prem, реестр российского ПО, журналирование.
