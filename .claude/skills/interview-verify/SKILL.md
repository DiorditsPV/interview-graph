---
name: interview-verify
description: >-
  Полная проверка сервиса интервью после любых изменений контента или кода:
  импорт нод (0 ошибок), backend-тесты (pytest), сборка фронта (tsc+vite),
  headless smoke (playwright) и (пере)запуск сервера. Используй, когда нужно
  «проверить, что ничего не сломалось», после правок content/ или frontend/.
---

# Скилл: валидация сервиса интервью

Запускай из корня проекта `/Users/user/dev/projects/work-tools/interview`.

## 1. Импорт контента (0 ошибок) + краткая статистика
```bash
python3 .claude/skills/interview-verify/check_import.py
```
Скрипт (stdlib, нужен сервер на :8000) печатает nodes / import errors / distinct tags / empty-tag nodes
и возвращает код 1 при проблемах (есть ошибки импорта или ноды без тегов). Если сервер не поднят —
подними (см. §5) или проверь импорт офлайн:
```
cd backend && . .venv/bin/activate && python -c '
from pathlib import Path; from app.importer import load_content
ns,errs=load_content(Path("../content")); print(len(ns),"nodes,",len(errs),"errors"); [print(e) for e in errs]'
```

## 2. Backend-тесты
```
cd backend && . .venv/bin/activate && INTERVIEW_DB_PATH=/tmp/iv_verify.db python -m pytest -q; rm -f /tmp/iv_verify.db
```

## 3. Сборка фронта (типы + бандл)
```
cd frontend && npm run build
```

## 4. Smoke (реальный рантайм, нужен сервер на :8000)
```
cd frontend && npm run smoke
```
Smoke кликает реальные ноды/кнопки. Если правка переименовала ноду/тег/класс, на который он опирается
(напр. тег для фильтра, заголовок «ROW_NUMBER»/«KubernetesExecutor»), — **обнови `frontend/smoke.mjs`**.

## 5. (Пере)запуск сервера (раздаёт собранный фронт)
```
pkill -f "uvicorn app.main:app" 2>/dev/null; sleep 1
cd backend && . .venv/bin/activate && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --log-level info
```
(в фоне). Проверка: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/` → 200.

## Когда что нужно
- Правка только контента (`.md`/`.json`, теги, difficulty): фронт пересобирать НЕ нужно (данные грузятся
  из `/api/graph` в рантайме) — достаточно §1 + §2 + §4.
- Правка кода фронта (`frontend/src`): нужны §3 → пересборка → §4/§5.
- Правка модели/импортёра (`backend/app`): §1 + §2.

Зелёный результат = все шаги без ошибок и smoke печатает «ALL SMOKE CHECKS PASSED ✓».
По возможности приложи скриншот (`frontend/screenshot.mjs`, env `CLIP`/`CX`/`DARK`/`CLICK`).
