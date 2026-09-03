"""Инкремент 2 (v1-closure): итог сессии — статус, решение, комментарий."""

from fastapi.testclient import TestClient


def _client() -> TestClient:
    from app.main import OWNER_EMAIL, OWNER_PASSWORD, app

    c = TestClient(app)
    c.post("/api/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    return c


def test_new_session_is_active_without_verdict():
    c = _client()
    s = c.post("/api/sessions", json={"candidate": "Finish Me", "pool": "data-engineer"}).json()
    assert s["status"] == "active" and s["decision"] is None and s["summary"] is None and s["finished_at"] is None
    listed = next(x for x in c.get("/api/sessions?pool=data-engineer").json() if x["id"] == s["id"])
    assert listed["status"] == "active" and listed["decision"] is None


def test_finish_sets_verdict_and_can_be_edited():
    c = _client()
    sid = c.post("/api/sessions", json={"candidate": "Finish Me 2", "pool": "data-engineer"}).json()["id"]
    r = c.post(f"/api/sessions/{sid}/finish", json={"decision": "hire", "summary": "Сильный Spark, слабый SQL"})
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["status"] == "finished" and s["decision"] == "hire" and s["summary"] == "Сильный Spark, слабый SQL"
    assert s["finished_at"] and "scores" in s
    # итог можно поправить: статус остаётся finished, поля перезаписываются
    r2 = c.post(f"/api/sessions/{sid}/finish", json={"decision": "hold", "summary": ""})
    assert r2.status_code == 200
    assert r2.json()["decision"] == "hold" and r2.json()["summary"] == "" and r2.json()["status"] == "finished"
    got = c.get(f"/api/sessions/{sid}").json()
    assert got["decision"] == "hold" and got["status"] == "finished"
    listed = next(x for x in c.get("/api/sessions?pool=data-engineer").json() if x["id"] == sid)
    assert listed["status"] == "finished" and listed["decision"] == "hold"


def test_finish_validation_and_404():
    c = _client()
    sid = c.post("/api/sessions", json={"candidate": "Finish Me 3", "pool": "data-engineer"}).json()["id"]
    assert c.post(f"/api/sessions/{sid}/finish", json={"decision": "maybe"}).status_code == 422
    assert c.post(f"/api/sessions/{sid}/finish", json={"summary": "без решения"}).status_code == 422
    assert c.post("/api/sessions/999999/finish", json={"decision": "hire"}).status_code == 404
    # без summary — допустимо (пустой комментарий)
    assert c.post(f"/api/sessions/{sid}/finish", json={"decision": "no_hire"}).json()["summary"] == ""
