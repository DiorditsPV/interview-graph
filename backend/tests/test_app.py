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


# --- content_ops: мутации банка на ВРЕМЕННОЙ копии (реальный content/ не трогаем) ---
import shutil

from app.content_ops import NodeNotFound, create_node, delete_node, update_node


@pytest.fixture
def tmp_content(tmp_path):
    dst = tmp_path / "content"
    shutil.copytree(CONTENT, dst)
    return dst


def test_delete_md_unlinks(tmp_content):
    before = len(load_content(tmp_content)[0])
    r = delete_node(tmp_content, "af-orchestration-01")
    assert r["fileRemoved"] is True
    nodes, errs = load_content(tmp_content)
    assert errs == [] and len(nodes) == before - 1
    assert not any(n.id == "af-orchestration-01" for n in nodes)


def test_delete_json_keeps_siblings(tmp_content):
    r = delete_node(tmp_content, "domain-01")
    assert r["fileRemoved"] is False
    nodes, errs = load_content(tmp_content)
    ids = {n.id for n in nodes}
    assert "domain-01" not in ids and "monitoring-01" in ids
    assert errs == []


def test_delete_missing_and_traversal_raise(tmp_content):
    with pytest.raises(NodeNotFound):
        delete_node(tmp_content, "nope-99")
    with pytest.raises(NodeNotFound):
        delete_node(tmp_content, "../weights")  # traversal id не резолвится
    assert load_content(tmp_content)[1] == []  # ничего не удалилось/не побилось


def test_update_md_fields(tmp_content):
    update_node(tmp_content, "af-orchestration-01", {"difficulty": "senior", "question": "Новый текст?"})
    n = next(x for x in load_content(tmp_content)[0] if x.id == "af-orchestration-01")
    assert n.difficulty == "senior" and n.question == "Новый текст?"


def test_update_json_item_keeps_siblings(tmp_content):
    update_node(tmp_content, "domain-01", {"title": "Изменённый заголовок"})
    nodes = load_content(tmp_content)[0]
    assert next(n for n in nodes if n.id == "domain-01").title == "Изменённый заголовок"
    assert any(n.id == "monitoring-01" for n in nodes)  # сосед по json цел


def test_update_invalid_not_written(tmp_content):
    with pytest.raises(Exception):
        update_node(tmp_content, "af-orchestration-01", {"question": "   "})  # пустой → невалид
    assert load_content(tmp_content)[1] == []  # файл не испорчен


def test_update_missing_raises(tmp_content):
    with pytest.raises(NodeNotFound):
        update_node(tmp_content, "nope-99", {"title": "x"})


def test_create_unique_id_and_imports(tmp_content):
    before = len(load_content(tmp_content)[0])
    base = {"block": "databases", "topic": "sql", "difficulty": "junior", "kind": "question", "answer": "A"}
    r1 = create_node(tmp_content, {**base, "title": "T1", "question": "Q1?", "tags": ["sql"]})
    r2 = create_node(tmp_content, {**base, "title": "T2", "question": "Q2?", "tags": []})
    assert r1["id"] != r2["id"]  # дубль topic → разные id (бамп NN)
    assert r1["id"].startswith("sql-") and r2["id"].startswith("sql-")
    nodes, errs = load_content(tmp_content)
    assert errs == [] and len(nodes) == before + 2  # не словил duplicate-id
    assert {r1["id"], r2["id"]} <= {n.id for n in nodes}


def test_create_slug_sanitized_no_traversal(tmp_content):
    r = create_node(tmp_content, {"block": "python", "topic": "../../etc/passwd", "difficulty": "base", "kind": "question", "question": "Q?", "answer": ""})
    assert "/" not in r["id"] and ".." not in r["id"]
    assert r["file"].startswith("python/")  # внутри блока, не наружу
    assert load_content(tmp_content)[1] == []


def test_real_content_untouched():
    nodes, errs = load_content(CONTENT)  # все мутации шли по tmp-копиям
    assert errs == [] and len(nodes) >= 60


# --- эндпоинты /api/nodes (monkeypatch CONTENT_DIR на копию) ---
@pytest.fixture
def api_client(tmp_content, monkeypatch):
    import app.main as m

    monkeypatch.setattr(m, "CONTENT_DIR", tmp_content)
    return TestClient(m.app)


def test_api_delete_then_404(api_client):
    r = api_client.delete("/api/nodes/af-orchestration-01")
    assert r.status_code == 200 and r.json()["deleted"] == "af-orchestration-01"
    assert api_client.delete("/api/nodes/af-orchestration-01").status_code == 404


def test_api_put_updates(api_client):
    assert api_client.put("/api/nodes/sql-01", json={"difficulty": "senior"}).status_code == 200
    g = api_client.get("/api/graph").json()
    assert next(n for n in g["nodes"] if n["id"] == "sql-01")["difficulty"] == "senior"


def test_api_put_404_and_422(api_client):
    assert api_client.put("/api/nodes/nope-99", json={"title": "x"}).status_code == 404
    assert api_client.put("/api/nodes/sql-01", json={"question": "   "}).status_code == 422


def test_api_post_creates(api_client):
    before = len(api_client.get("/api/graph").json()["nodes"])
    r = api_client.post("/api/nodes", json={"block": "python", "topic": "pandas", "question": "Q?", "answer": "A"})
    assert r.status_code == 200
    g = api_client.get("/api/graph").json()
    assert len(g["nodes"]) == before + 1 and any(n["id"] == r.json()["id"] for n in g["nodes"])


def test_api_post_invalid_block_422(api_client):
    assert api_client.post("/api/nodes", json={"block": "BAD", "topic": "x", "question": "Q?"}).status_code == 422
