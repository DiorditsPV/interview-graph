"""Тесты auth-identity (#36): аутентификация, сессии, RBAC.

Используют общий module-level app/db (паттерн _client из test_app/test_nodes).
Cookie сессии живёт внутри инстанса TestClient, поэтому разные клиенты = разные сессии.
"""

from fastapi.testclient import TestClient

from app.main import OWNER_EMAIL, OWNER_PASSWORD, app

_VALID_NODE = {"block": "python", "topic": "auth-test", "question": "q?"}


def _anon() -> TestClient:
    return TestClient(app)


def _login(c: TestClient, email: str, password: str):
    return c.post("/api/auth/login", json={"email": email, "password": password})


def _owner() -> TestClient:
    c = _anon()
    assert _login(c, OWNER_EMAIL, OWNER_PASSWORD).status_code == 200
    return c


def _user(email: str, password: str, role: str) -> TestClient:
    """Создать (owner'ом) пользователя с ролью и вернуть залогиненного под ним клиента.

    Идемпотентно: при повторном прогоне создание вернёт 409, но логин всё равно работает.
    """
    owner = _owner()
    owner.post("/api/users", json={"email": email, "password": password, "role": role})
    c = _anon()
    assert _login(c, email, password).status_code == 200
    return c


def test_unauthenticated_request_401():
    assert _anon().get("/api/graph").status_code == 401


def test_login_success_me_and_tenant_resolution():
    c = _owner()
    me = c.get("/api/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body["email"] == OWNER_EMAIL
    assert body["role"] == "owner"
    assert body["tenant_id"] == "default"  # resolve_tenant из сессии, не хардкод


def test_login_wrong_password_401():
    assert _login(_anon(), OWNER_EMAIL, "definitely-wrong").status_code == 401


def test_logout_clears_session():
    c = _owner()
    assert c.get("/api/auth/me").status_code == 200
    c.post("/api/auth/logout")
    assert c.get("/api/auth/me").status_code == 401


def test_viewer_can_read_but_not_mutate():
    viewer = _user("viewer@interview.local", "viewer-pw", "viewer")
    assert viewer.get("/api/graph").status_code == 200  # чтение — ок
    assert viewer.post("/api/nodes", json=_VALID_NODE).status_code == 403  # мутация — 403


def test_member_can_mutate():
    member = _user("member@interview.local", "member-pw", "member")
    r = member.post("/api/nodes", json=_VALID_NODE)
    assert r.status_code == 200, r.text
    member.delete(f"/api/nodes/{r.json()['id']}")  # cleanup


def test_owner_can_manage_users():
    owner = _owner()
    assert owner.get("/api/users").status_code == 200


def test_non_owner_cannot_list_users():
    member = _user("member2@interview.local", "member2-pw", "member")
    assert member.get("/api/users").status_code == 403
