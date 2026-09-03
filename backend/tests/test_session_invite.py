"""Инкремент 3 (v1-closure): подключение к сессии по ссылке без аккаунта (гостевой токен)."""

from fastapi.testclient import TestClient


def _client() -> TestClient:
    from app.main import OWNER_EMAIL, OWNER_PASSWORD, app

    c = TestClient(app)
    c.post("/api/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    return c


def _guest(token: str) -> TestClient:
    from app.main import app

    g = TestClient(app)  # без cookie владельца
    r = g.post(f"/api/join/{token}")
    assert r.status_code == 200, r.text
    return g


def test_invite_and_join_as_member_guest():
    c = _client()
    sid = c.post("/api/sessions", json={"candidate": "Guest Target", "pool": "data-engineer"}).json()["id"]
    other = c.post("/api/sessions", json={"candidate": "Other", "pool": "data-engineer"}).json()["id"]
    r = c.post(f"/api/sessions/{sid}/invite", json={"role": "member"})
    assert r.status_code == 200, r.text
    inv = r.json()
    assert inv["token"] and inv["role"] == "member" and inv["session_id"] == sid
    assert inv["url"].endswith(f"#/join/{inv['token']}")

    g = _guest(inv["token"])
    me = g.get("/api/auth/me").json()
    assert me["guest"] is True and me["scope_session_id"] == sid and me["role"] == "member"
    # своя сессия — читать и оценивать можно; live-снимок доступен
    assert g.get(f"/api/sessions/{sid}").status_code == 200
    assert g.post(f"/api/sessions/{sid}/score", json={"nodeId": "sql-01", "score": 4}).status_code == 200
    assert g.get("/api/graph?pool=data-engineer").status_code == 200
    assert g.get("/api/pools").status_code == 200
    # чужая сессия и правки банка/направлений/кандидатов — нет
    assert g.get(f"/api/sessions/{other}").status_code == 403
    assert g.post(f"/api/sessions/{other}/score", json={"nodeId": "sql-01", "score": 4}).status_code == 403
    assert g.post("/api/nodes", json={"pool": "data-engineer", "block": "python", "topic": "t", "question": "q", "answer": "", "tags": []}).status_code == 403
    assert g.post("/api/pools", json={"label": "Guest Pool", "preset": "data-engineer"}).status_code == 403
    assert g.post("/api/candidates", json={"name": "x"}).status_code == 403
    assert g.post("/api/sessions", json={"candidate": "x", "pool": "data-engineer"}).status_code == 403
    assert g.post(f"/api/sessions/{sid}/invite", json={"role": "viewer"}).status_code == 403
    # список сессий гостю — только своя
    listed = g.get("/api/sessions").json()
    assert [s["id"] for s in listed] == [sid]


def test_viewer_guest_cannot_score_and_bad_tokens():
    c = _client()
    sid = c.post("/api/sessions", json={"candidate": "Viewer Target", "pool": "data-engineer"}).json()["id"]
    inv = c.post(f"/api/sessions/{sid}/invite", json={"role": "viewer"}).json()
    g = _guest(inv["token"])
    assert g.get(f"/api/sessions/{sid}").status_code == 200
    assert g.post(f"/api/sessions/{sid}/score", json={"nodeId": "sql-01", "score": 4}).status_code == 403
    assert g.post(f"/api/sessions/{sid}/finish", json={"decision": "hire"}).status_code == 403
    from app.main import app

    assert TestClient(app).post("/api/join/not-a-token").status_code == 404
    assert c.post(f"/api/sessions/{sid}/invite", json={"role": "owner"}).status_code == 422
    assert c.post("/api/sessions/999999/invite", json={"role": "viewer"}).status_code == 404


def test_member_guest_can_finish_own_session_only():
    c = _client()
    sid = c.post("/api/sessions", json={"candidate": "Finish Guest", "pool": "data-engineer"}).json()["id"]
    inv = c.post(f"/api/sessions/{sid}/invite", json={"role": "member"}).json()
    g = _guest(inv["token"])
    r = g.post(f"/api/sessions/{sid}/finish", json={"decision": "hold", "summary": "гость подвёл итог"})
    assert r.status_code == 200 and r.json()["decision"] == "hold"
    # повторный join по той же ссылке — новая гостевая сессия, старая cookie не нужна
    g2 = _guest(inv["token"])
    assert g2.get("/api/auth/me").json()["scope_session_id"] == sid
