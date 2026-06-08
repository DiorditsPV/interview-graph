"""Определение текущего тенанта (клиента/workspace).

Сейчас система **single-tenant**: всегда работает один тенант `default`. Но схема БД и DAL
уже принимают `tenant_id` (см. db.py), поэтому переход на много корпоративных клиентов —
это замена тела `resolve_tenant` (читать тенант из JWT/сессии) + добавление аутентификации,
а НЕ переписывание схемы. Весь остальной код «не знает», что тенант один — он спрашивает здесь.
"""

from __future__ import annotations

DEFAULT_TENANT = "default"


def resolve_tenant(request=None) -> str:
    """Вернуть id тенанта для запроса.

    Тенант берётся из аутентифицированного пользователя: зависимость `auth.current_user`
    (висит на защищённых ручках) кладёт его в `request.state.tenant`. Если состояние не
    проставлено (нет request, либо ручка вне auth — login/seed) — `default`.

    ВНИМАНИЕ (fail-open): ручка, зовущая `resolve_tenant(request)` без зависимости
    `current_user`/`require_*`, молча получит `default` вместо 401. Каждый вызов в main.py
    обязан идти в паре с auth-зависимостью — иначе аутентификация обходится.
    """
    if request is not None:
        tenant = getattr(request.state, "tenant", None)
        if tenant:
            return tenant
    return DEFAULT_TENANT
