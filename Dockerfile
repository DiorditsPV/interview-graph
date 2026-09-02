# syntax=docker/dockerfile:1

# Самодостаточный образ сервиса: фронт собирается внутри, наружу торчит только том с БД.
# Раскладка каталогов и переменные повторяют то, что systemd-юнит делает на сервере
# (см. deploy/bootstrap.sh), чтобы локальный контейнер и прод не разъезжались.

# ── стадия 1: сборка фронта ──────────────────────────────────────────────────
# node:20 — та же версия, что в .github/workflows/deploy.yml.
FROM node:20-alpine AS frontend

WORKDIR /build/frontend

# Сначала только манифесты: слой с npm ci переиспользуется, пока лок не менялся.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# npm run build = tsc --noEmit && vite build, то есть типы проверяются прямо здесь:
# ошибка типов роняет сборку образа, а не всплывает в рантайме.
RUN npm run build

# ── стадия 2: рантайм ────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Ровно те три переменные, что выставляет systemd-юнит в deploy/bootstrap.sh.
# БД лежит в /data — отдельно от кода, как DATA_DIR отделён от APP_DIR на сервере:
# пересборка образа не трогает данные.
ENV INTERVIEW_CONTENT_DIR=/app/content \
    INTERVIEW_FRONTEND_DIR=/app/frontend/dist \
    INTERVIEW_DB_PATH=/data/interview.db

WORKDIR /app/backend

# Зависимости отдельным слоем — переустанавливаются только при правке requirements.txt.
# Ставим тот же файл, что и сервер; в образ поедут pytest/httpx, зато источник один.
COPY backend/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

COPY backend/ /app/backend/
COPY content/ /app/content/
COPY --from=frontend /build/frontend/dist /app/frontend/dist

# Сервис крутится не от root — как и на сервере, где systemd запускает его от
# сервисного пользователя. /data создаётся заранее и с нужным владельцем, иначе
# свежий именованный том достанется root и SQLite не сможет писать.
RUN useradd --system --create-home app \
 && mkdir -p /data \
 && chown -R app:app /data /app
USER app

EXPOSE 8000

# curl в образ не тащим — хватает stdlib.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health').read()" || exit 1

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
