"""Тесты CRUD банка вопросов (question-management), переписанные под БД-источник правды.

Раньше эта фича писала вопросы в content/*.md (content_ops.py). После content-store-db
источник правды — БД, поэтому эндпоинты /api/nodes пишут через DAL (db.upsert_node/
delete_node), а проверки идут через /api/graph (который читает из БД).

Тесты используют тот же `_client()`-паттерн, что и test_app.py (общий module-level app/db).
Каждый тест создаёт свои ноды и убирает их за собой (или проверяет 404 после delete),
поэтому не зависит от изоляции БД и не ломает остальные тесты.
"""

from fastapi.testclient import TestClient


def _client() -> TestClient:
    from app.main import OWNER_EMAIL, OWNER_PASSWORD, app

    c = TestClient(app)
    # auth-identity (#36): ручки гейтятся — логинимся owner'ом (cookie живёт в TestClient).
    c.post("/api/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    return c


def _graph_ids(c: TestClient) -> set:
    return {n["id"] for n in c.get("/api/graph").json()["nodes"]}


def test_create_node_appears_in_graph():
    c = _client()
    before = len(c.get("/api/graph").json()["nodes"])
    r = c.post(
        "/api/nodes",
        json={
            "block": "python",
            "topic": "Smoke topic",
            "difficulty": "middle",
            "question": "Что это за вопрос?",
            "answer": "ответ",
        },
    )
    assert r.status_code == 200, r.text
    new_id = r.json()["id"]
    try:
        after = c.get("/api/graph").json()["nodes"]
        assert len(after) == before + 1
        created = next(n for n in after if n["id"] == new_id)
        assert created["topic"] == "Smoke topic"
        assert created["question"] == "Что это за вопрос?"
        assert created["block"] == "python"
    finally:
        c.delete(f"/api/nodes/{new_id}")


def test_create_node_generates_unique_ids():
    c = _client()
    payload = {"block": "python", "topic": "Dup", "question": "q?"}
    id1 = c.post("/api/nodes", json=payload).json()["id"]
    id2 = c.post("/api/nodes", json=payload).json()["id"]
    try:
        assert id1 != id2
        assert {id1, id2} <= _graph_ids(c)
    finally:
        c.delete(f"/api/nodes/{id1}")
        c.delete(f"/api/nodes/{id2}")


def test_create_node_validation_error():
    c = _client()
    # пустой question → 422 (Field min_length=1).
    assert c.post("/api/nodes", json={"block": "python", "topic": "t", "question": ""}).status_code == 422
    # неизвестный блок → 400 (вне таксономии пула, см. test_create_node_block_outside_pool_400).
    assert c.post("/api/nodes", json={"block": "nope", "topic": "t", "question": "q?"}).status_code == 400


def test_create_node_block_outside_pool_400():
    c = _client()
    r = c.post("/api/nodes", json={"block": "requirements", "topic": "x", "question": "q?"})
    assert r.status_code == 400
    assert "requirements" in r.json()["detail"]


def test_create_node_gets_pool():
    c = _client()
    r = c.post("/api/nodes", json={"pool": "data-engineer", "block": "python", "topic": "Pooled", "question": "q?"})
    assert r.status_code == 200, r.text
    nid = r.json()["id"]
    try:
        node = next(n for n in c.get("/api/graph?pool=data-engineer").json()["nodes"] if n["id"] == nid)
        assert node["pool"] == "data-engineer"
    finally:
        c.delete(f"/api/nodes/{nid}")


def test_update_node_changes_graph():
    c = _client()
    new_id = c.post(
        "/api/nodes", json={"block": "python", "topic": "Orig", "question": "q?", "answer": "a"}
    ).json()["id"]
    try:
        r = c.put(
            f"/api/nodes/{new_id}",
            json={"title": "Updated title", "difficulty": "senior", "question": "new q?"},
        )
        assert r.status_code == 200, r.text
        node = next(n for n in c.get("/api/graph").json()["nodes"] if n["id"] == new_id)
        assert node["title"] == "Updated title"
        assert node["difficulty"] == "senior"
        assert node["question"] == "new q?"
        assert node["answer"] == "a"  # не переданное поле не меняется
    finally:
        c.delete(f"/api/nodes/{new_id}")


def test_update_missing_node_404():
    assert _client().put("/api/nodes/does-not-exist", json={"title": "x"}).status_code == 404


def test_update_invalid_value_422():
    c = _client()
    new_id = c.post("/api/nodes", json={"block": "python", "topic": "t", "question": "q?"}).json()["id"]
    try:
        assert c.put(f"/api/nodes/{new_id}", json={"difficulty": "wizard"}).status_code == 422
    finally:
        c.delete(f"/api/nodes/{new_id}")


def test_delete_node_removes_from_graph():
    c = _client()
    new_id = c.post("/api/nodes", json={"block": "python", "topic": "Bye", "question": "q?"}).json()["id"]
    assert new_id in _graph_ids(c)
    assert c.delete(f"/api/nodes/{new_id}").status_code == 200
    assert new_id not in _graph_ids(c)


def test_delete_missing_node_404():
    assert _client().delete("/api/nodes/does-not-exist").status_code == 404


def test_hidden_node_excluded_when_requested():
    """set_node_hidden + list_nodes(include_hidden=False) — durable серверное скрытие в DAL.

    UI скрывает вопрос с доски клиентски (hide-local), но DAL поддерживает и серверное
    скрытие; проверяем контракт DAL напрямую (через модуль main.db).
    """
    import app.main as main_module

    c = _client()
    tenant = "default"
    new_id = c.post("/api/nodes", json={"block": "python", "topic": "Hideme", "question": "q?"}).json()["id"]
    db = main_module.db
    try:
        db.set_node_hidden(tenant, new_id, True)
        visible_ids = {n["id"] for n in db.list_nodes(tenant, include_hidden=False)}
        all_ids = {n["id"] for n in db.list_nodes(tenant, include_hidden=True)}
        assert new_id in all_ids
        assert new_id not in visible_ids
        db.set_node_hidden(tenant, new_id, False)
        assert new_id in {n["id"] for n in db.list_nodes(tenant, include_hidden=False)}
    finally:
        c.delete(f"/api/nodes/{new_id}")
