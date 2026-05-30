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


def test_api_import_valid_with_id():
    c = _client()
    md = (
        "---\nid: zzz-upload-test-01\nblock: databases\ntopic: Загрузка\n---\n"
        "## Вопрос\nТестовый вопрос?\n## Ответ\nОтвет.\n"
    )
    created = []
    try:
        r = c.post("/api/import", json={"filename": "whatever.md", "content": md})
        assert r.status_code == 200
        data = r.json()
        created = [a["path"] for a in data["added"]]
        assert data["errors"] == []
        assert any(a["id"] == "zzz-upload-test-01" for a in data["added"])
        assert (CONTENT / "databases" / "zzz-upload-test-01.md").exists()
    finally:
        for p in created:
            (CONTENT / p).unlink(missing_ok=True)


def test_api_import_idless_md_takes_stem():
    c = _client()
    md = "---\nblock: python\ntopic: Стем\n---\n## Вопрос\nОткуда id?\n"
    created = []
    try:
        r = c.post("/api/import", json={"filename": "zzz-stem-01.md", "content": md})
        data = r.json()
        created = [a["path"] for a in data["added"]]
        assert data["added"], f"nothing added: {data}"
        assert data["added"][0]["id"] == "zzz-stem-01"  # id из имени файла, не из temp-stem
    finally:
        for p in created:
            (CONTENT / p).unlink(missing_ok=True)


def test_api_import_invalid_not_written():
    c = _client()
    bad = "---\nid: zzz-bad-01\nblock: NOPE\ntopic: x\n---\n## Вопрос\nq\n"
    r = c.post("/api/import", json={"filename": "bad.md", "content": bad})
    data = r.json()
    assert data["added"] == []
    assert data["errors"]
    assert not (CONTENT / "NOPE" / "zzz-bad-01.md").exists()


def test_api_import_duplicate_id():
    c = _client()
    dup = "---\nid: sql-01\nblock: databases\ntopic: dup\n---\n## Вопрос\nq\n"
    r = c.post("/api/import", json={"filename": "dup.md", "content": dup})
    data = r.json()
    assert data["added"] == []
    assert any("duplicate" in e["error"] for e in data["errors"])
    # существующий sql-01 не перезаписан (всё ещё на месте)
    assert (CONTENT / "databases" / "sql-01.md").exists()


def test_api_import_bad_extension():
    r = _client().post("/api/import", json={"filename": "x.txt", "content": "hi"})
    assert r.status_code == 400
