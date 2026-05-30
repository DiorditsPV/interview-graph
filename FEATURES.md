# FEATURES.md — каталог сгенерированных фич (для ревью)

Автообновляется `feature-build` (`.claude/skills/feature-build/catalog.py`, читает `.claude/features/*.md`). Каждая строка — ветка-кандидат. Посмотреть: `git switch feature/<slug>`. Понравилось → merge в `main`.

| ветка | slug | описание | status | смёржено | verify | review | дата | спека |
|---|---|---|---|---|---|---|---|---|
| `feature/agenda-sidebar` | agenda-sidebar | Сайдбар-агенда (список вопросов с переходом) | done | — | pass | ok — багов нет (стили самодостаточны, без зависимости от --accent другой ветки) | 2026-05-30 | .claude/features/agenda-sidebar.md |
| `feature/bank-export` | bank-export | Экспорт всего банка вопросов в HTML | done | — | pass | ok — поле starterCode (не starter_code) поймано build-гейтом и исправлено | 2026-05-30 | .claude/features/bank-export.md |
| `feature/candidate-compare` | candidate-compare | Сравнение кандидатов по блокам | done | integration/all-ideas | pass | ok — багов нет (route-order проверен живым запросом, не 422) | 2026-05-30 | .claude/features/candidate-compare.md |
| `feature/interview-progress` | interview-progress | Прогресс-бар оценённых вопросов в шапке | done | integration/all-ideas | pass | ok — багов нет (coverage — точный инверс dimmed) | 2026-05-30 | .claude/features/interview-progress.md |
| `feature/interview-timer` | interview-timer | Таймеры вопроса и сессии в HUD | done | integration/all-ideas | pass | ok — багов нет | 2026-05-30 | .claude/features/interview-timer.md |
| `feature/interview-tracks` | interview-tracks | Выбор направления интервью (треки/роли) | done | integration/all-ideas | pass | ok — 1 minor reuse note (filter predicate duplicated buildNodes/visibleIds; не блокер) | 2026-05-30 | .claude/features/interview-tracks.md |
| `feature/md-upload` | md-upload | Загрузка вопросов (.md/.json) через UI | done | — | pass | ok — temp-stem ловушка (id-less md) поймана advisor'ом и закрыта тестом; запись безопасна (block=Literal, id санитизирован) | 2026-05-30 | .claude/features/md-upload.md |
| `feature/node-notes` | node-notes | Заметка интервьюера на вопрос (node notes) | done | integration/all-ideas | pass | ok — багов нет; мелочь: applyScore пересоздаётся при наборе note (perf-only, не блокер) | 2026-05-30 | .claude/features/node-notes.md |
| `feature/question-search` | question-search | Поиск по тексту вопросов | done | integration/all-ideas | pass | ok — багов нет | 2026-05-30 | .claude/features/question-search.md |
| `feature/session-resume` | session-resume | Загрузка прошлой сессии кандидата (resume) | done | integration/all-ideas | pass | ok — багов нет; мелочь: стиль .loadsess дублирует .tb__select (не блокер) | 2026-05-30 | .claude/features/session-resume.md |
| `feature/shortcuts-help` | shortcuts-help | Оверлей горячих клавиш (по «?») | done | — | pass | ok — найден и устранён баг двойного Escape-listener'а (capture-фаза + stopImmediatePropagation) | 2026-05-30 | .claude/features/shortcuts-help.md |
| `feature/unscored-filter` | unscored-filter | Фильтр «только неоценённые» | done | integration/all-ideas | pass | ok — багов нет | 2026-05-30 | .claude/features/unscored-filter.md |
| `feature/ux-live-polish` | ux-live-polish | Пакет UX-полировки (читаемость/управляемость) | done | — | pass | ok — багов нет (фикс currentColor→--accent для кольца текущего вопроса) | 2026-05-30 | .claude/features/ux-live-polish.md |
