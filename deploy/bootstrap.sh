#!/usr/bin/env bash
# Идемпотентный bootstrap+деплой сервиса «Интервью» на сервере.
# Запускается из GitHub Actions по SSH под sudo:
#     sudo bash ~/interview-src/deploy/bootstrap.sh ~/interview-src
# Первый запуск — провижининг (venv, systemd, фаервол), последующие — обновление.
#
# Что делает:
#   1. ставит системные зависимости (python3-venv, rsync) при отсутствии;
#   2. синхронизирует код+контент из staging в APP_DIR (БД НЕ трогает — она в DATA_DIR);
#   3. создаёт/обновляет venv и ставит requirements;
#   4. пишет systemd-юнит и перезапускает сервис;
#   5. открывает порт в ufw (если ufw активен);
#   6. healthcheck по /api/health.
set -euo pipefail

SRC="${1:?usage: bootstrap.sh <src_dir>}"
APP_DIR=/opt/interview
DATA_DIR=/var/lib/interview
PORT=8800
# Пользователь, под которым крутится сервис = тот, кто зашёл по SSH (не root).
SVC_USER="${SUDO_USER:-$(id -un)}"

echo "→ deploy as service user: $SVC_USER ; src=$SRC ; app=$APP_DIR ; port=$PORT"

# 1) системные зависимости -----------------------------------------------
export DEBIAN_FRONTEND=noninteractive
need_apt=()
command -v python3 >/dev/null 2>&1 || need_apt+=(python3)
python3 -m venv --help >/dev/null 2>&1 || need_apt+=(python3-venv)
command -v rsync   >/dev/null 2>&1 || need_apt+=(rsync)
command -v curl    >/dev/null 2>&1 || need_apt+=(curl)
if [ "${#need_apt[@]}" -gt 0 ]; then
  echo "→ apt-get install: ${need_apt[*]}"
  apt-get update -qq
  apt-get install -y -qq "${need_apt[@]}"
fi

# 2) синхронизация кода (БД и сборочный мусор исключены) -------------------
mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude '.git' \
  --exclude 'frontend/node_modules' \
  --exclude 'backend/.venv' \
  --exclude '__pycache__' \
  --exclude '*.db' \
  --exclude '.deploy' \
  "$SRC"/ "$APP_DIR"/
chown -R "$SVC_USER":"$SVC_USER" "$APP_DIR"

# 3) каталог данных — переживает деплои ------------------------------------
mkdir -p "$DATA_DIR"
chown -R "$SVC_USER":"$SVC_USER" "$DATA_DIR"

# 4) venv + зависимости (от имени сервисного пользователя) -----------------
sudo -u "$SVC_USER" python3 -m venv "$APP_DIR/backend/.venv"
sudo -u "$SVC_USER" "$APP_DIR/backend/.venv/bin/python" -m pip install -q --upgrade pip
sudo -u "$SVC_USER" "$APP_DIR/backend/.venv/bin/pip" install -q -r "$APP_DIR/backend/requirements.txt"

# 5) systemd-юнит ----------------------------------------------------------
cat > /etc/systemd/system/interview.service <<UNIT
[Unit]
Description=Interview graph service (FastAPI)
After=network.target

[Service]
Type=simple
User=$SVC_USER
WorkingDirectory=$APP_DIR/backend
Environment=INTERVIEW_DB_PATH=$DATA_DIR/interview.db
Environment=INTERVIEW_CONTENT_DIR=$APP_DIR/content
Environment=INTERVIEW_FRONTEND_DIR=$APP_DIR/frontend/dist
ExecStart=$APP_DIR/backend/.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable interview.service >/dev/null 2>&1 || true
systemctl restart interview.service

# 6) фаервол (если ufw активен) -------------------------------------------
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "$PORT"/tcp >/dev/null 2>&1 || true
  echo "→ ufw: разрешён порт $PORT/tcp"
fi

# 7) healthcheck -----------------------------------------------------------
sleep 2
if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
  echo "✓ interview.service активен, /api/health отвечает на :$PORT"
else
  echo "✗ healthcheck не прошёл — лог сервиса:"
  journalctl -u interview.service -n 40 --no-pager || true
  exit 1
fi
