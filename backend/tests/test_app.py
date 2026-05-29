"""Тесты импортёра, sampler и API."""

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


def test_api_interview():
    r = _client().post("/api/interview", json={"count": 8, "seed": 1})
    assert r.status_code == 200
    assert len(r.json()["order"]) <= 8


def test_api_list_sessions_for_resume():
    c = _client()
    sid = c.post("/api/sessions", json={"candidate": "Resume"}).json()["id"]
    c.post(f"/api/sessions/{sid}/score", json={"nodeId": "sql-01", "score": 5})
    sessions = c.get("/api/sessions").json()
    assert any(x["id"] == sid and x["candidate"] == "Resume" for x in sessions)
    # деталь сессии содержит восстановимые оценки
    detail = c.get(f"/api/sessions/{sid}").json()
    assert detail["scores"]["sql-01"]["score"] == 5
