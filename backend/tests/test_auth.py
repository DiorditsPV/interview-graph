"""Тесты auth-identity (#36): аутентификация, сессии, RBAC.

Используют общий module-level app/db (паттерн _client из test_app/test_nodes).
Cookie сессии живёт внутри инстанса TestClient, поэтому разные клиенты = разные сессии.
"""

from fastapi.testclient import TestClient

from app.db import Database
from app.main import OWNER_EMAIL, OWNER_PASSWORD, _resolve_owner_password, app

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


# --- auth-hardening (#40) ---


def test_owner_password_random_when_env_unset(monkeypatch):
    """Без INTERVIEW_OWNER_PASSWORD пароль случайный и НЕ известный дефолт."""
    monkeypatch.delenv("INTERVIEW_OWNER_PASSWORD", raising=False)
    pw1, gen1 = _resolve_owner_password()
    pw2, gen2 = _resolve_owner_password()
    assert gen1 and gen2  # помечен как сгенерированный (логируется при сиде)
    assert pw1 != "interview-dev" and pw2 != "interview-dev"
    assert pw1 != pw2 and len(pw1) >= 16  # случайный, не пустой
    # с env — берётся как есть и не считается сгенерированным
    monkeypatch.setenv("INTERVIEW_OWNER_PASSWORD", "from-env")
    pw3, gen3 = _resolve_owner_password()
    assert pw3 == "from-env" and gen3 is False


def test_login_cookie_has_max_age():
    """Cookie сессии несёт max_age (TTL) — браузер сам выкинет протухшую."""
    r = _login(_anon(), OWNER_EMAIL, OWNER_PASSWORD)
    assert r.status_code == 200
    assert "max-age=" in r.headers.get("set-cookie", "").lower()


def test_session_ttl_expires_to_401():
    """Сессия старше TTL → 401 (get_auth_session удаляет протухшую)."""
    c = _owner()
    assert c.get("/api/auth/me").status_code == 200
    with app.state.db._conn() as conn:  # «состарим» все auth-сессии за пределы TTL
        conn.execute("UPDATE auth_sessions SET created_at = ?", ("2000-01-01T00:00:00+00:00",))
    assert c.get("/api/auth/me").status_code == 401


def test_relogin_invalidates_prior_session():
    """Повторный логин того же пользователя инвалидирует прежнюю сессию."""
    c1 = _anon()
    assert _login(c1, OWNER_EMAIL, OWNER_PASSWORD).status_code == 200
    assert c1.get("/api/auth/me").status_code == 200
    c2 = _anon()
    assert _login(c2, OWNER_EMAIL, OWNER_PASSWORD).status_code == 200
    assert c2.get("/api/auth/me").status_code == 200
    assert c1.get("/api/auth/me").status_code == 401  # прежняя сессия больше не действует


def test_session_tenant_isolation(tmp_path):
    """DAL: get_session/list_sessions не отдают сессии чужого тенанта."""
    db = Database(tmp_path / "iso.db")
    db.ensure_tenant("t1")
    db.ensure_tenant("t2")
    s = db.create_session("Кандидат t1", tenant_id="t1")
    # свой тенант видит
    assert db.get_session(s["id"], "t1") is not None
    assert [x["id"] for x in db.list_sessions("t1")] == [s["id"]]
    # чужой тенант — нет
    assert db.get_session(s["id"], "t2") is None
    assert db.list_sessions("t2") == []
