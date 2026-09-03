"""Аутентификация и авторизация: хеши паролей, server-side сессии, RBAC.

Механизм — HttpOnly session-cookie + локальные аккаунты (email+пароль). Токен сессии
хранится server-side (таблица `auth_sessions`), в cookie уходит только непредсказуемое
значение. Cookie без флага `Secure`: сервис работает только локально по http (см. CLAUDE.md),
а `Secure`-cookie не пересылалась бы по http (TestClient/smoke сломались бы).

Роли (RBAC): owner > member > viewer.
- viewer — только чтение (доска, сессии);
- member — правки банка/кандидатов/сессий/оценок;
- owner — всё member + управление пользователями.

Зависимости читают `db` из `request.app.state.db` (его кладёт main.py при старте) и
проставляют `request.state.tenant`/`request.state.user`, откуда их берёт `resolve_tenant`.
"""

from __future__ import annotations

from typing import Callable

import bcrypt
from fastapi import Depends, HTTPException, Request

COOKIE_NAME = "session"
ROLE_RANK = {"viewer": 0, "member": 1, "owner": 2}


# bcrypt использует только первые 72 байта пароля и в 5.x жёстко отвергает длиннее —
# усекаем явно. Работаем с bcrypt напрямую: passlib 1.7.4 несовместим с bcrypt 5.x.
def _pw_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_pw_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_pw_bytes(password), password_hash.encode("utf-8"))
    except ValueError:
        return False


def current_user(request: Request) -> dict:
    """FastAPI-зависимость: вернуть аутентифицированного пользователя или бросить 401.

    Побочно проставляет `request.state.tenant`/`request.state.user`, чтобы
    `resolve_tenant(request)` в теле ручки отдавал тенант залогиненного юзера.
    """
    db = request.app.state.db
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="not authenticated")
    sess = db.get_auth_session(token)
    if sess is None:
        raise HTTPException(status_code=401, detail="not authenticated")
    user = db.get_user_by_id(sess["tenant_id"], sess["user_id"])
    if user is None:
        raise HTTPException(status_code=401, detail="not authenticated")
    request.state.tenant = user["tenant_id"]
    request.state.user = user
    # Гость по ссылке: auth-сессия ограничена одной сессией интервью (см. db.create_guest_auth_session).
    request.state.guest_scope = sess.get("scope_session_id")
    return user


def guest_scope(request: Request) -> int | None:
    """id сессии интервью, которой ограничен гость; None — полноценный пользователь."""
    return getattr(request.state, "guest_scope", None)


def require_role(min_role: str, allow_guest: bool = False) -> Callable[..., dict]:
    """Фабрика зависимости, требующей роль не ниже `min_role` (иначе 403).

    Гость по ссылке проходит только там, где allow_guest=True (ручки своей сессии интервью);
    правки банка, направлений, кандидатов и создание сессий ему закрыты независимо от роли.
    """

    def dep(request: Request, user: dict = Depends(current_user)) -> dict:
        if ROLE_RANK.get(user["role"], -1) < ROLE_RANK[min_role]:
            raise HTTPException(status_code=403, detail="insufficient role")
        if not allow_guest and guest_scope(request) is not None:
            raise HTTPException(status_code=403, detail="guest access is limited to the invited session")
        return user

    return dep


require_member = require_role("member")
require_owner = require_role("owner")
require_session_member = require_role("member", allow_guest=True)


def check_session_scope(request: Request, session_id: int) -> None:
    """Гость может работать только с сессией из приглашения; чужая → 403."""
    scope = guest_scope(request)
    if scope is not None and scope != session_id:
        raise HTTPException(status_code=403, detail="guest access is limited to the invited session")
