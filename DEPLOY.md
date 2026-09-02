# Деплой

Автодеплой на **<SERVER_IP>**, порт **8800** (порт 80 занят другим приложением; 8800 — высокий и
не конфликтует с типичными VPN-портами). Любой merge в `main` (push в `main`) запускает
GitHub Actions → сборка фронта на раннере → доставка кода по SSH → идемпотентный bootstrap на сервере.

> **Про `<SERVER_IP>`:** репозиторий публичный, поэтому реальный IP сервера здесь не пишется — он лежит в
> GitHub-секрете `SSH_HOST` (см. §2). Сервис всё равно публично доступен по этому IP; ограничение доступа
> — в разделе «Безопасность».

```
push в main ─▶ GitHub Actions (.github/workflows/deploy.yml)
                 ├─ npm ci && npm run build        (фронт собирается на раннере)
                 ├─ rsync кода → ~/interview-src    (staging в домашней папке)
                 └─ ssh sudo bootstrap.sh prod      (provision + restart)
                         └─ /opt/interview (код+контент) · /var/lib/interview (БД) · systemd · ufw
```

## Dev-окружение (на том же сервере)

Dev-версия крутится на **том же сервере и IP** и использует **те же GitHub-секреты**
(SSH-доступ), но полностью изолирована от прода: отдельный порт, свой systemd-юнит,
свои каталоги кода и данных. Push в ветку `dev` (или ручной запуск *Actions → Deploy (dev)*)
поднимает её через `.github/workflows/deploy-dev.yml` → `bootstrap.sh … dev`.

```
push в dev ─▶ GitHub Actions (.github/workflows/deploy-dev.yml)
                 ├─ npm ci && npm run build         (фронт собирается на раннере)
                 ├─ rsync кода → ~/interview-src-dev (отдельный staging)
                 └─ ssh sudo bootstrap.sh dev        (provision + restart)
                         └─ /opt/interview-dev · /var/lib/interview-dev (БД) · systemd · ufw
```

|                    | prod                              | dev                                   |
| ------------------ | --------------------------------- | ------------------------------------- |
| URL                | http://<SERVER_IP>:**8800**     | http://<SERVER_IP>:**8801**         |
| Триггер            | push в `main`                     | push в `dev` / ручной запуск          |
| systemd-юнит       | `interview.service`               | `interview-dev.service`               |
| Код + контент      | `/opt/interview`                  | `/opt/interview-dev`                  |
| БД (SQLite)        | `/var/lib/interview/interview.db` | `/var/lib/interview-dev/interview.db` |
| Staging на сервере | `~/interview-src`                 | `~/interview-src-dev`                 |

У dev — **своя БД**, поэтому эксперименты в dev не затрагивают сессии и оценки прода.
Никаких дополнительных секретов заводить не нужно: dev переиспользует те же
`SSH_HOST` / `SSH_USER` / `SSH_PRIVATE_KEY` / `SSH_KNOWN_HOSTS` / `SSH_PORT`.

**Локально** dev-версию можно поднять на отдельном порту той же командой:
`./run.sh dev` (порт 8001, отдельная БД `interview-dev.db`, авто-reload); `./run.sh` — как прод на :8000.

## Что куда кладётся на сервере

| Путь                                    | Назначение                                                      | Переживает деплой?          |
| --------------------------------------- | --------------------------------------------------------------- | --------------------------- |
| `/opt/interview`                        | код + контент (`content/<pool>/<block>/*.md`), venv, собранный `frontend/dist` | нет — перезаписывается      |
| `/var/lib/interview/interview.db`       | SQLite: сессии кандидатов и оценки                              | **да** — данные сохраняются |
| `/etc/systemd/system/interview.service` | автозапуск/рестарт uvicorn на :8800                             | —                           |

БД вынесена из дерева кода через `INTERVIEW_DB_PATH`, поэтому деплой обновляет код и вопросы,
но **не затирает** накопленные оценки.

## Разовая настройка (нужно сделать один раз)

### 1. Добавить публичный ключ раннера на сервер

Пара ключей раннера сгенерирована локально в `.deploy/` (в git НЕ попадает): приватный — `deploy_key`,
публичный — `deploy_key.pub`. Публичную часть нужно добавить в `~/.ssh/authorized_keys` пользователя,
под которым пойдёт деплой (на сервере, под нужным пользователем):

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
cat deploy_key.pub >> ~/.ssh/authorized_keys   # содержимое .deploy/deploy_key.pub (строка ssh-ed25519 …)
chmod 600 ~/.ssh/authorized_keys
```

Деплой-пользователь должен иметь **passwordless sudo** для bootstrap
(`sudo bash ...` без запроса пароля), т.к. Actions работает неинтерактивно.
Проверить: `sudo -n true && echo OK`.

### 2. GitHub Secrets (репозиторий → Settings → Secrets and variables → Actions)

| Secret            | Значение                                                  |
| ----------------- | --------------------------------------------------------- |
| `SSH_HOST`        | `<SERVER_IP>`                                           |
| `SSH_USER`        | имя пользователя на сервере (с sudo)                      |
| `SSH_PRIVATE_KEY` | содержимое `.deploy/deploy_key` (весь приватный ключ)     |
| `SSH_KNOWN_HOSTS` | host-ключ сервера (фиксирует отпечаток, защищает от MITM) |
| `SSH_PORT`        | *(опционально)* нестандартный порт SSH; по умолчанию `22` |

Эти секреты проставляются автоматически скриптом `gh secret set` при настройке (см. ниже),
кроме `SSH_USER`, который нужно указать.

## Запуск деплоя

- **Автоматически:** любой push/merge в `main` (prod) или в `dev` (dev).
- **Вручную:** вкладка *Actions* → *Deploy* (prod) или *Deploy (dev)* → *Run workflow* (`workflow_dispatch`).

После успешного прогона приложение доступно на **http://<SERVER_IP>:8800** (prod)
и **http://<SERVER_IP>:8801** (dev).

## Безопасность

Сервис биндится на `0.0.0.0` (prod — `:8800`, dev — `:8801`) и доступен публично по IP, **аутентификации
в приложении нет** (изначально это локальный однопользовательский инструмент). Раз сервис открыт в интернет
без авторизации, **рекомендуется ограничить доступ**: закрыть порты фаерволом (`ufw`) и ходить через
VPN/SSH-туннель, либо поставить reverse-proxy с basic-auth/TLS. Dev-порт (`:8801`) публичен так же, как prod —
закрывайте оба.

> Замена IP на `<SERVER_IP>` убирает его только из текущего дерева; в **истории git** прежние коммиты IP
> ещё содержат. Полное удаление из истории — отдельная операция (rewrite), здесь не делается.
