"""Приглашения в сессию: срок жизни и отзыв (гость выкидывается сразу, вход по ссылке — 410)."""

from fastapi.testclient import TestClient


def _client() -> TestClient:
    from app.main import OWNER_EMAIL, OWNER_PASSWORD, app

    c = TestClient(app)
    c.post("/api/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    return c


def _guest(token: str) -> TestClient:
    from app.main import app

    g = TestClient(app)
    assert g.post(f"/api/join/{token}").status_code == 200
    return g


def test_invite_expiry_and_revoke():
    from app.main import app, db

    c = _client()
    sid = c.post("/api/sessions", json={"candidate": "Revoke Target", "pool": "data-engineer"}).json()["id"]
    inv = c.post(f"/api/sessions/{sid}/invite", json={"role": "member", "expires_hours": 1}).json()
    assert inv["expires_at"]
    g = _guest(inv["token"])
    assert g.get(f"/api/sessions/{sid}").status_code == 200
    mine = next(i for i in c.get(f"/api/sessions/{sid}/invites").json() if i["token"] == inv["token"])
    assert mine["state"] == "active" and mine["role"] == "member" and mine["expires_at"] == inv["expires_at"]
    # отзыв: гость выкинут на следующем запросе, повторный вход по ссылке — 410
    assert c.delete(f"/api/sessions/{sid}/invites/{inv['token']}").status_code == 200
    assert g.get(f"/api/sessions/{sid}").status_code == 401
    assert TestClient(app).post(f"/api/join/{inv['token']}").status_code == 410
    assert next(i for i in c.get(f"/api/sessions/{sid}/invites").json() if i["token"] == inv["token"])["state"] == "revoked"
    assert c.delete(f"/api/sessions/{sid}/invites/nope").status_code == 404
    # истечение: срок в прошлом → гость выкинут, вход 410, в списке expired
    inv2 = c.post(f"/api/sessions/{sid}/invite", json={"role": "viewer"}).json()
    g2 = _guest(inv2["token"])
    with db._conn() as conn:
        conn.execute("UPDATE session_invites SET expires_at = ? WHERE token = ?", ("2000-01-01T00:00:00+00:00", inv2["token"]))
    assert g2.get(f"/api/sessions/{sid}").status_code == 401
    assert TestClient(app).post(f"/api/join/{inv2['token']}").status_code == 410
    assert next(i for i in c.get(f"/api/sessions/{sid}/invites").json() if i["token"] == inv2["token"])["state"] == "expired"


def test_invite_validation_and_guest_cannot_manage_invites():
    c = _client()
    sid = c.post("/api/sessions", json={"candidate": "TTL Target", "pool": "data-engineer"}).json()["id"]
    assert c.post(f"/api/sessions/{sid}/invite", json={"role": "viewer", "expires_hours": 0}).status_code == 422
    assert c.post(f"/api/sessions/{sid}/invite", json={"role": "viewer", "expires_hours": 999}).status_code == 422
    assert c.get("/api/sessions/999999/invites").status_code == 404
    inv = c.post(f"/api/sessions/{sid}/invite", json={"role": "member"}).json()  # дефолт — сутки
    g = _guest(inv["token"])
    assert g.get(f"/api/sessions/{sid}/invites").status_code == 403
    assert g.delete(f"/api/sessions/{sid}/invites/{inv['token']}").status_code == 403
