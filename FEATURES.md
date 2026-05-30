# FEATURES.md — каталог сгенерированных фич (для ревью)

Автообновляется `feature-build` (`.claude/skills/feature-build/catalog.py`, читает `.claude/features/*.md`). Каждая строка — ветка-кандидат. Посмотреть: `git switch feature/<slug>`. Понравилось → merge в `main`.

| ветка | slug | описание | status | verify | review | дата | спека |
|---|---|---|---|---|---|---|---|
| `feature/interview-timer` | interview-timer | Таймеры вопроса и сессии в HUD | done | pass | ok — багов нет | 2026-05-30 | .claude/features/interview-timer.md |
| `feature/interview-tracks` | interview-tracks | Выбор направления интервью (треки/роли) | done | pass | ok — 1 minor reuse note (filter predicate duplicated buildNodes/visibleIds; не блокер) | 2026-05-30 | .claude/features/interview-tracks.md |
| `feature/node-notes` | node-notes | Заметка интервьюера на вопрос (node notes) | done | pass | ok — багов нет; мелочь: applyScore пересоздаётся при наборе note (perf-only, не блокер) | 2026-05-30 | .claude/features/node-notes.md |
| `feature/question-search` | question-search | Поиск по тексту вопросов | done | pass | ok — багов нет | 2026-05-30 | .claude/features/question-search.md |
| `feature/session-resume` | session-resume | Загрузка прошлой сессии кандидата (resume) | done | pass | ok — багов нет; мелочь: стиль .loadsess дублирует .tb__select (не блокер) | 2026-05-30 | .claude/features/session-resume.md |
| `feature/unscored-filter` | unscored-filter | Фильтр «только неоценённые» | done | pass | ok — багов нет | 2026-05-30 | .claude/features/unscored-filter.md |
