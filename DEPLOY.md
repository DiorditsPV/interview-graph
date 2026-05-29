# Деплой

Автодеплой на **45.114.62.236**, порт **8800** (порт 80 занят другим приложением; 8800 — высокий и
не конфликтует с типичными VPN-портами). Любой merge в `main` (push в `main`) запускает
GitHub Actions → сборка фронта на раннере → доставка кода по SSH → идемпотентный bootstrap на сервере.

```
push в main ─▶ GitHub Actions (.github/workflows/deploy.yml)
                 ├─ npm ci && npm run build        (фронт собирается на раннере)
                 ├─ rsync кода → ~/interview-src    (staging в домашней папке)
                 └─ ssh sudo bootstrap.sh           (provision + restart)
                         └─ /opt/interview (код+контент) · /var/lib/interview (БД) · systemd · ufw
```

## Что куда кладётся на сервере

| Путь | Назначение | Переживает деплой? |
|---|---|---|
| `/opt/interview` | код + контент (`content/*.md`), venv, собранный `frontend/dist` | нет — перезаписывается |
| `/var/lib/interview/interview.db` | SQLite: сессии кандидатов и оценки | **да** — данные сохраняются |
| `/etc/systemd/system/interview.service` | автозапуск/рестарт uvicorn на :8800 | — |

БД вынесена из дерева кода через `INTERVIEW_DB_PATH`, поэтому деплой обновляет код и вопросы,
но **не затирает** накопленные оценки.

## Разовая настройка (нужно сделать один раз)

### 1. Добавить публичный ключ раннера на сервер

Приватный ключ раннера сгенерирован локально в `.deploy/deploy_key` (в git НЕ попадает).
Публичную часть нужно добавить в `~/.ssh/authorized_keys` пользователя, под которым пойдёт деплой:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKgvqYJY0MJC93TrvmfPZ9gw1EU1E7EtZaJnnJBMywk2 github-actions-deploy@interview
```

(на сервере, под нужным пользователем):
```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKgvqYJY0MJC93TrvmfPZ9gw1EU1E7EtZaJnnJBMywk2 github-actions-deploy@interview' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Деплой-пользователь должен иметь **passwordless sudo** для bootstrap
(`sudo bash ...` без запроса пароля), т.к. Actions работает неинтерактивно.
Проверить: `sudo -n true && echo OK`.

### 2. GitHub Secrets (репозиторий → Settings → Secrets and variables → Actions)

| Secret | Значение |
|---|---|
| `SSH_HOST` | `45.114.62.236` |
| `SSH_USER` | имя пользователя на сервере (с sudo) |
| `SSH_PRIVATE_KEY` | содержимое `.deploy/deploy_key` (весь приватный ключ) |
| `SSH_KNOWN_HOSTS` | host-ключ сервера (фиксирует отпечаток, защищает от MITM) |
| `SSH_PORT` | *(опционально)* нестандартный порт SSH; по умолчанию `22` |

Эти секреты проставляются автоматически скриптом `gh secret set` при настройке (см. ниже),
кроме `SSH_USER`, который нужно указать.

## Запуск деплоя

- **Автоматически:** любой push/merge в `main`.
- **Вручную:** вкладка *Actions* → *Deploy* → *Run workflow* (`workflow_dispatch`).

После успешного прогона приложение доступно на **http://45.114.62.236:8800**.

## Безопасность

Сервис биндится на `0.0.0.0:8800` и будет доступен публично по IP. Аутентификации в приложении нет
(изначально это локальный однопользовательский инструмент). Если доступ нужно ограничить — варианты:
закрыть 8800 фаерволом и ходить через VPN/SSH-туннель, либо поставить reverse-proxy с basic-auth.
