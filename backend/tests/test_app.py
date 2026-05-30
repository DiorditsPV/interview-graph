"""Тесты импортёра, sampler и API."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.importer import load_content
from app.models import Node
from app.sampler import build_interview, load_weights

CONTENT = Path(__file__).resolve().parent.parent.parent / "content"


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
    from app.main import app
    return TestClient(app)


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
