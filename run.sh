#!/usr/bin/env bash
# Поднять сервис локально: venv + сборка фронта (если нужно) + запуск FastAPI.
# Использование:  ./run.sh [--build]   (--build форсирует пересборку фронта)
set -euo pipefail
cd "$(dirname "$0")"

# --- backend venv ---
cd backend
[ -d .venv ] || python3 -m venv .venv
# shellcheck disable=SC1091
. .venv/bin/activate
python -m pip install -q -r requirements.txt
cd ..

# --- frontend build ---
if [ ! -d frontend/dist ] || [ "${1:-}" = "--build" ]; then
  echo "→ сборка фронтенда…"
  cd frontend
  [ -d node_modules ] || npm install
  npm run build
  cd ..
fi

# --- run ---
echo "→ http://localhost:8000"
cd backend
exec python -m uvicorn app.main:app --port 8000
