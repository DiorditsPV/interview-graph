#!/usr/bin/env bash
# Идемпотентный bootstrap+деплой сервиса «Интервью» на сервере.
# Запускается из GitHub Actions по SSH под sudo:
#     sudo bash ~/interview-src/deploy/bootstrap.sh ~/interview-src [env]
# где [env] = prod (по умолчанию) | dev.
#
# prod и dev живут на одном сервере (один IP, одни SSH-секреты), но полностью
# изолированы: разные каталоги кода/данных, свой systemd-юнит и свой порт.
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

SRC="${1:?usage: bootstrap.sh <src_dir> [env]}"
ENV="${2:-prod}"

# Профиль окружения: каталоги, порт и имя сервиса различаются для prod/dev,
# чтобы две версии не пересекались на одном сервере (один IP, разные порты).
case "$ENV" in
  prod)
    APP_DIR=/opt/interview
    DATA_DIR=/var/lib/interview
    PORT=8800
    SVC=interview
    SVC_DESC="Interview graph service (FastAPI)"
    ;;
  dev)
    APP_DIR=/opt/interview-dev
    DATA_DIR=/var/lib/interview-dev
    PORT=8801
    SVC=interview-dev
    SVC_DESC="Interview graph service — DEV (FastAPI)"
    ;;
  *)
    echo "✗ неизвестное окружение '$ENV' (ожидается prod|dev)" >&2
    exit 2
    ;;
esac

# Пользователь, под которым крутится сервис = тот, кто зашёл по SSH (не root).
SVC_USER="${SUDO_USER:-$(id -un)}"

echo "→ deploy env=$ENV as service user: $SVC_USER ; src=$SRC ; app=$APP_DIR ; port=$PORT ; svc=$SVC"

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

# 4b) секрет owner-пароля (необяз.) — из деплоя приходит base64-кодированным.
# Кладём в root-only env-файл (mode 600), а НЕ в Environment= юнита (тот world-readable).
OWNER_ENV_FILE="$DATA_DIR/owner.env"
if [ -n "${INTERVIEW_OWNER_PASSWORD_B64:-}" ]; then
  _owner_pw=$(printf '%s' "$INTERVIEW_OWNER_PASSWORD_B64" | base64 -d 2>/dev/null || true)
  if [ -n "$_owner_pw" ]; then
    printf 'INTERVIEW_OWNER_PASSWORD=%s\n' "$_owner_pw" > "$OWNER_ENV_FILE"
    chown "$SVC_USER":"$SVC_USER" "$OWNER_ENV_FILE"
    chmod 600 "$OWNER_ENV_FILE"
    echo "→ owner-пароль записан в $OWNER_ENV_FILE (600)"
  fi
fi

# 5) systemd-юнит ----------------------------------------------------------
cat > "/etc/systemd/system/$SVC.service" <<UNIT
[Unit]
Description=$SVC_DESC
After=network.target

[Service]
Type=simple
User=$SVC_USER
WorkingDirectory=$APP_DIR/backend
Environment=INTERVIEW_DB_PATH=$DATA_DIR/interview.db
Environment=INTERVIEW_CONTENT_DIR=$APP_DIR/content
Environment=INTERVIEW_FRONTEND_DIR=$APP_DIR/frontend/dist
EnvironmentFile=-$OWNER_ENV_FILE
ExecStart=$APP_DIR/backend/.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable "$SVC.service" >/dev/null 2>&1 || true
systemctl restart "$SVC.service"

# 6) фаервол (если ufw активен) -------------------------------------------
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "$PORT"/tcp >/dev/null 2>&1 || true
  echo "→ ufw: разрешён порт $PORT/tcp"
fi

# 7) healthcheck -----------------------------------------------------------
sleep 2
if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
  echo "✓ $SVC.service активен, /api/health отвечает на :$PORT"
else
  echo "✗ healthcheck не прошёл — лог сервиса:"
  journalctl -u "$SVC.service" -n 40 --no-pager || true
  exit 1
fi
