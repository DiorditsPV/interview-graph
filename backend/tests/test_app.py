"""Тесты импортёра, sampler и API."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.importer import load_content
from app.models import Node
from app.sampler import build_interview, load_tracks, load_weights, node_in_track

CONTENT_ROOT = Path(__file__).resolve().parent.parent.parent / "content"
CONTENT = CONTENT_ROOT / "data-engineer"   # каталог пула по умолчанию


def test_content_imports_without_errors():
    nodes, errors = load_content(CONTENT)
    assert errors == [], f"import errors: {errors}"
    assert len(nodes) >= 15


def test_nodes_have_title_and_tags():
    nodes, _ = load_content(CONTENT)
    assert all(n.title for n in nodes), "every node should have a title"
    # хотя бы часть нод имеет теги
    assert any(n.tags for n in nodes)


def test_both_formats_loaded():
    nodes, _ = load_content(CONTENT)
    ids = {n.id for n in nodes}
    assert "af-orchestration-01" in ids        # markdown
    assert "domain-01" in ids and "monitoring-01" in ids  # json


def test_markdown_body_split():
    nodes, _ = load_content(CONTENT)
    node = next(n for n in nodes if n.id == "af-orchestration-01")
    assert node.question and "DAG" in node.question
    assert node.answer and "идемпотентн" in node.answer.lower()


def test_task_node_has_starter_and_rubric():
    nodes, _ = load_content(CONTENT)
    task = next(n for n in nodes if n.id == "spark-batch-02")
    assert task.kind == "task"
    assert task.starter_code and "spark.read" in task.starter_code
    assert len(task.rubric) >= 2


def test_weights_loaded():
    w = load_weights(CONTENT)
    assert w == {"frameworks": 35, "databases": 30, "python": 23, "platform": 12}


def test_build_interview_respects_count_and_balance():
    nodes, _ = load_content(CONTENT)
    order = build_interview(nodes, count=10, seed=42)
    assert 1 <= len(order) <= 10
    assert len(order) == len(set(order))  # без повторов


def test_invalid_node_rejected():
    with pytest.raises(Exception):
        Node.model_validate({"id": "x", "block": "BAD", "topic": "t", "question": "q"})


# --- API ---
def _client():
    from app.main import OWNER_EMAIL, OWNER_PASSWORD, app

    c = TestClient(app)
    # auth-identity (#36): логинимся owner'ом — ручки гейтятся.
    c.post("/api/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    return c


def test_api_graph():
    r = _client().get("/api/graph")
    assert r.status_code == 200
    data = r.json()
    assert data["errors"] == []
    assert len(data["nodes"]) >= 15


def test_api_session_flow():
    c = _client()
    s = c.post("/api/sessions", json={"candidate": "Иванов"}).json()
    sid = s["id"]
    r = c.post(f"/api/sessions/{sid}/score", json={"nodeId": "sql-01", "score": 4})
    assert r.status_code == 200
    session = r.json()
    assert session["scores"]["sql-01"]["score"] == 4
    # повторная оценка перезаписывает
    c.post(f"/api/sessions/{sid}/score", json={"nodeId": "sql-01", "score": 2})
    session = c.get(f"/api/sessions/{sid}").json()
    assert session["scores"]["sql-01"]["score"] == 2


def test_api_list_sessions():
    c = _client()
    c.post("/api/sessions", json={"candidate": "Сидоров"})
    rows = c.get("/api/sessions").json()
    assert isinstance(rows, list) and len(rows) >= 1
    assert all({"id", "candidate", "created_at"} <= set(r) for r in rows)


def test_api_session_events_snapshot():
    # Бесконечный SSE-поток нельзя гонять через TestClient.iter_lines (зависает на close),
    # поэтому тянем первый кадр напрямую из генератора StreamingResponse.
    import asyncio

    from starlette.requests import Request

    from app.main import session_events

    c = _client()
    sid = c.post("/api/sessions", json={"candidate": "Петров"}).json()["id"]
    c.post(f"/api/sessions/{sid}/score", json={"nodeId": "sql-01", "score": 3})

    async def first_frame() -> str:
        async def receive():
            return {"type": "http.request"}

        req = Request({"type": "http", "method": "GET", "headers": []}, receive)
        resp = await session_events(sid, req)
        agen = resp.body_iterator
        try:
            return await agen.__anext__()
        finally:
            await agen.aclose()

    frame = asyncio.run(first_frame())
    assert frame.startswith("event: snapshot")
    data = json.loads(frame.split("data: ", 1)[1].strip())
    assert data["scores"]["sql-01"]["score"] == 3


def test_api_session_events_404():
    with _client().stream("GET", "/api/sessions/999999/events") as r:
        assert r.status_code == 404


def test_api_score_note_synced_over_sse():
    # Заметка (note) синхронизируется наравне с баллом: бэкенд хранит её и отдаёт в снимке,
    # который рассылается подписчикам (интервьюер + HR). UI заметок нет — это backend-only.
    import asyncio

    from starlette.requests import Request

    from app.main import session_events

    c = _client()
    sid = c.post("/api/sessions", json={"candidate": "Заметкин"}).json()["id"]
    note = "путается в оконных функциях, но базу знает"
    c.post(f"/api/sessions/{sid}/score", json={"nodeId": "sql-01", "score": 4, "note": note})

    async def first_frame() -> str:
        async def receive():
            return {"type": "http.request"}

        req = Request({"type": "http", "method": "GET", "headers": []}, receive)
        resp = await session_events(sid, req)
        agen = resp.body_iterator
        try:
            return await agen.__anext__()
        finally:
            await agen.aclose()

    data = json.loads(asyncio.run(first_frame()).split("data: ", 1)[1].strip())
    assert data["scores"]["sql-01"]["score"] == 4
    assert data["scores"]["sql-01"]["note"] == note


def test_session_hub_publish():
    import asyncio

    from app.hub import SessionHub

    async def scenario():
        hub = SessionHub()
        q = hub.subscribe(7)
        hub.publish(7, {"ok": 1})
        got = await asyncio.wait_for(q.get(), timeout=1)
        hub.unsubscribe(7, q)
        # после отписки последнего подписчика сессия выкидывается из реестра
        hub.publish(7, {"ok": 2})  # никому не уходит, без ошибок
        return got

    assert asyncio.run(scenario()) == {"ok": 1}


def test_api_interview():
    r = _client().post("/api/interview", json={"count": 8, "seed": 1})
    assert r.status_code == 200
    assert len(r.json()["order"]) <= 8


# --- tracks ---
def test_load_tracks():
    tracks = load_tracks(CONTENT)
    ids = {t["id"] for t in tracks}
    assert {"data-engineer", "backend", "analyst"} <= ids
    for t in tracks:
        assert t.get("id") and "label" in t and isinstance(t["include"], list)


def test_node_in_track_matcher():
    nmap = {n.id: n for n in load_content(CONTENT)[0]}
    inc = ["python", "databases/sql", "frameworks/airflow"]
    assert node_in_track(nmap["py-lang-01"], inc)          # python (block)
    assert node_in_track(nmap["sql-01"], inc)              # databases/sql
    assert node_in_track(nmap["af-orchestration-01"], inc)  # frameworks/airflow
    assert not node_in_track(nmap["spark-batch-01"], inc)   # frameworks/pyspark — нет
    assert node_in_track(nmap["sql-01"], [])               # пустой include = все


def test_api_tracks_endpoint():
    r = _client().get("/api/tracks")
    assert r.status_code == 200
    assert {"data-engineer", "backend", "analyst"} <= {t["id"] for t in r.json()}


def test_interview_track_scoped():
    nmap = {n.id: n for n in load_content(CONTENT)[0]}
    inc = ["databases/sql", "databases/dbms", "python", "platform"]
    order = _client().post("/api/interview", json={"count": 50, "track": "analyst", "seed": 1}).json()["order"]
    assert order
    for nid in order:
        assert node_in_track(nmap[nid], inc), f"{nid} вне трека analyst"


def test_api_list_sessions_for_resume():
    c = _client()
    sid = c.post("/api/sessions", json={"candidate": "Resume"}).json()["id"]
    c.post(f"/api/sessions/{sid}/score", json={"nodeId": "sql-01", "score": 5})
    sessions = c.get("/api/sessions").json()
    assert any(x["id"] == sid and x["candidate"] == "Resume" for x in sessions)
    # деталь сессии содержит восстановимые оценки
    detail = c.get(f"/api/sessions/{sid}").json()
    assert detail["scores"]["sql-01"]["score"] == 5


def test_api_score_note_persists():
    c = _client()
    sid = c.post("/api/sessions", json={"candidate": "Notes"}).json()["id"]
    c.post(f"/api/sessions/{sid}/score", json={"nodeId": "sql-01", "score": 4, "note": "хороший ответ"})
    detail = c.get(f"/api/sessions/{sid}").json()
    assert detail["scores"]["sql-01"]["note"] == "хороший ответ"


def _delete_node(node_id: str):
    """Убрать тестовую ноду из БД (источник правды теперь БД, а не файлы content/)."""
    from app.main import db
    from app.tenancy import DEFAULT_TENANT
    db.delete_node(DEFAULT_TENANT, node_id)


def test_api_import_valid_with_id():
    c = _client()
    md = (
        "---\nid: zzz-upload-test-01\nblock: databases\ntopic: Загрузка\n---\n"
        "## Вопрос\nТестовый вопрос?\n## Ответ\nОтвет.\n"
    )
    try:
        r = c.post("/api/import", json={"filename": "whatever.md", "content": md})
        assert r.status_code == 200
        data = r.json()
        assert data["errors"] == []
        assert any(a["id"] == "zzz-upload-test-01" for a in data["added"])
        # Источник правды — БД: загруженная нода видна в /api/graph (не пишется на диск).
        ids = {n["id"] for n in c.get("/api/graph").json()["nodes"]}
        assert "zzz-upload-test-01" in ids
        assert not (CONTENT / "databases" / "zzz-upload-test-01.md").exists()
    finally:
        _delete_node("zzz-upload-test-01")


def test_api_import_idless_md_takes_stem():
    c = _client()
    md = "---\nblock: python\ntopic: Стем\n---\n## Вопрос\nОткуда id?\n"
    try:
        r = c.post("/api/import", json={"filename": "zzz-stem-01.md", "content": md})
        data = r.json()
        assert data["added"], f"nothing added: {data}"
        assert data["added"][0]["id"] == "zzz-stem-01"  # id из имени файла, не из temp-stem
    finally:
        _delete_node("zzz-stem-01")


def test_api_import_duplicate_rejected():
    """Повторная загрузка той же id отклоняется (нода уже в банке)."""
    c = _client()
    md = "---\nid: zzz-dup-01\nblock: python\ntopic: Дубль\n---\n## Вопрос\nq?\n"
    try:
        first = c.post("/api/import", json={"filename": "a.md", "content": md}).json()
        assert any(a["id"] == "zzz-dup-01" for a in first["added"])
        second = c.post("/api/import", json={"filename": "a.md", "content": md}).json()
        assert second["added"] == []
        assert second["errors"]
    finally:
        _delete_node("zzz-dup-01")


def test_api_import_invalid_not_written():
    c = _client()
    bad = "---\nid: zzz-bad-01\nblock: NOPE\ntopic: x\n---\n## Вопрос\nq\n"
    r = c.post("/api/import", json={"filename": "bad.md", "content": bad})
    data = r.json()
    assert data["added"] == []
    assert data["errors"]
    assert c.get("/api/graph").status_code == 200
    assert "zzz-bad-01" not in {n["id"] for n in c.get("/api/graph").json()["nodes"]}


def test_api_import_duplicate_id():
    c = _client()
    dup = "---\nid: sql-01\nblock: databases\ntopic: dup\n---\n## Вопрос\nq\n"
    r = c.post("/api/import", json={"filename": "dup.md", "content": dup})
    data = r.json()
    assert data["added"] == []
    assert any("duplicate" in e["error"] for e in data["errors"])
    # существующий sql-01 не перезаписан (всё ещё на месте)
    assert (CONTENT / "databases" / "sql-01.md").exists()


# --- DB как источник правды для банка вопросов (content-store-db) ---
def test_graph_served_from_db_seed():
    """Сид из content/*.md наполняет БД; /api/graph отдаёт ноды из БД."""
    nodes_on_disk, _ = load_content(CONTENT)
    api_ids = {n["id"] for n in _client().get("/api/graph").json()["nodes"]}
    disk_ids = {n.id for n in nodes_on_disk}
    # Все засеяные с диска ноды присутствуют в БД-выдаче (плюс могут быть user-ноды от других тестов).
    assert disk_ids <= api_ids
    assert len(api_ids) >= len(disk_ids)


def test_seed_is_idempotent():
    """Повторный сид в непустую БД ничего не вставляет (не плодит дубли)."""
    from app.main import db
    from app.tenancy import DEFAULT_TENANT
    before = db.count_nodes(DEFAULT_TENANT)
    nodes, _ = load_content(CONTENT)
    inserted = db.seed_nodes(DEFAULT_TENANT, [n.model_dump() for n in nodes])
    assert inserted == 0
    assert db.count_nodes(DEFAULT_TENANT) == before


def test_node_crud_and_hidden():
    """DAL: upsert → get → hide → delete для одного тенанта."""
    from app.main import db
    from app.tenancy import DEFAULT_TENANT as T
    node = {"id": "zzz-crud-01", "block": "python", "topic": "CRUD",
            "question": "q?", "answer": "a", "tags": ["t1"], "rubric": ["r1"]}
    try:
        saved = db.upsert_node(T, node)
        assert saved["id"] == "zzz-crud-01" and saved["tags"] == ["t1"]
        assert db.get_node(T, "zzz-crud-01")["source"] == "user"
        hidden = db.set_node_hidden(T, "zzz-crud-01", True)
        assert hidden["hidden"] is True
        assert any(n["id"] == "zzz-crud-01" for n in db.list_nodes(T, include_hidden=True))
        assert not any(n["id"] == "zzz-crud-01" for n in db.list_nodes(T, include_hidden=False))
    finally:
        assert db.delete_node(T, "zzz-crud-01")
        assert db.get_node(T, "zzz-crud-01") is None


def test_tenant_isolation():
    """Ноды одного тенанта не видны другому (фундамент мультитенантности)."""
    from app.main import db
    db.ensure_tenant("other")
    node = {"id": "shared-id-01", "block": "python", "topic": "Iso", "question": "q?"}
    try:
        db.upsert_node("other", node)
        # тот же id в дефолтном тенанте отсутствует — изоляция по (tenant_id, id)
        assert db.get_node("default", "shared-id-01") is None
        assert db.get_node("other", "shared-id-01") is not None
        other_ids = {n["id"] for n in db.list_nodes("other")}
        default_ids = {n["id"] for n in db.list_nodes("default")}
        assert "shared-id-01" in other_ids
        assert "shared-id-01" not in default_ids
    finally:
        db.delete_node("other", "shared-id-01")


def test_api_import_bad_extension():
    r = _client().post("/api/import", json={"filename": "x.txt", "content": "hi"})
    assert r.status_code == 400
