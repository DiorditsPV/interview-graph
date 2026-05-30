#!/usr/bin/env bash
# Поднять сервис локально: venv + сборка фронта (если нужно) + запуск FastAPI.
# Использование:
#   ./run.sh [prod|dev] [--build]
#     prod  (по умолчанию) — порт 8000, БД interview.db
#     dev                  — порт 8001, БД interview-dev.db, авто-reload
#   --build форсирует пересборку фронта.
#
# dev-профиль изолирован от prod (своя БД и свой порт), повторяя разделение,
# которое на сервере делает deploy/bootstrap.sh.
set -euo pipefail
cd "$(dirname "$0")"

# --- разбор аргументов (профиль и/или --build в любом порядке) ---
PROFILE=prod
BUILD=0
for arg in "$@"; do
  case "$arg" in
    prod|dev) PROFILE="$arg" ;;
    --build)  BUILD=1 ;;
    *) echo "неизвестный аргумент: $arg (ожидается prod|dev|--build)" >&2; exit 2 ;;
  esac
done

if [ "$PROFILE" = "dev" ]; then
  PORT=8001
  export INTERVIEW_DB_PATH="${INTERVIEW_DB_PATH:-$PWD/backend/interview-dev.db}"
  RELOAD=(--reload)
else
  PORT=8000
  RELOAD=()
fi

# --- backend venv ---
cd backend
[ -d .venv ] || python3 -m venv .venv
# shellcheck disable=SC1091
. .venv/bin/activate
python -m pip install -q -r requirements.txt
cd ..

# --- frontend build ---
if [ ! -d frontend/dist ] || [ "$BUILD" = "1" ]; then
  echo "→ сборка фронтенда…"
  cd frontend
  [ -d node_modules ] || npm install
  npm run build
  cd ..
fi

# --- run ---
echo "→ [$PROFILE] http://localhost:$PORT"
cd backend
exec python -m uvicorn app.main:app --port "$PORT" "${RELOAD[@]}"
