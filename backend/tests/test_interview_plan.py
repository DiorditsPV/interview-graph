"""Инкремент 1 (v1-closure): план интервью — набор вопросов сессии (sessions.plan)."""

from fastapi.testclient import TestClient

from app.models import Node
from app.sampler import build_interview, filter_nodes, matrix_order


def _n(nid: str, block: str, sub=None, diff="middle", weight=1) -> Node:
    return Node.model_validate(
        {"id": nid, "pool": "p", "block": block, "subblock": sub, "topic": "t", "difficulty": diff,
         "weight": weight, "question": "Q?", "answer": ""}
    )


NODES = [
    _n("a1", "frameworks", "airflow", "junior"),
    _n("a2", "frameworks", "airflow", "senior"),
    _n("s1", "frameworks", "pyspark", "middle"),
    _n("d1", "frameworks", "dbt", "junior"),
    _n("q1", "databases", "sql", "base"),
    _n("p1", "python", None, "middle"),
]


# --- sampler ---
def test_filter_nodes_by_blocks_subblocks_and_levels():
    ids = lambda ns: sorted(n.id for n in ns)  # noqa: E731
    assert ids(filter_nodes(NODES, blocks=["frameworks"])) == ["a1", "a2", "d1", "s1"]
    assert ids(filter_nodes(NODES, blocks=["frameworks"], subblocks={"frameworks": ["airflow", "pyspark"]})) == ["a1", "a2", "s1"]
    assert ids(filter_nodes(NODES, subblocks={"frameworks": ["dbt"]})) == ["d1", "p1", "q1"]  # фильтр под-колонок трогает только свой раздел
    assert ids(filter_nodes(NODES, difficulties=["junior", "middle"])) == ["a1", "d1", "p1", "s1"]
    assert filter_nodes(NODES, blocks=["nope"]) == []


def test_matrix_order_follows_pool_taxonomy():
    order = matrix_order(
        NODES,
        block_order=["python", "databases", "frameworks"],
        sub_order={"frameworks": ["pyspark", "airflow", "dbt"], "databases": ["sql"], "python": []},
    )
    assert order == ["p1", "q1", "s1", "a1", "a2", "d1"]  # блок → под-колонка → уровень → id


def test_build_interview_respects_plan_filters():
    order = build_interview(
        NODES, count=3, difficulties=["junior"], blocks=["frameworks"], block_weights={"frameworks": 1}, seed=1
    )
    assert sorted(order) == ["a1", "d1"]  # под условия подходят только две ноды


# --- API ---
def _client() -> TestClient:
    from app.main import OWNER_EMAIL, OWNER_PASSWORD, app

    c = TestClient(app)
    c.post("/api/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    return c


def test_session_with_auto_plan():
    c = _client()
    nodes = {n["id"]: n for n in c.get("/api/graph?pool=data-engineer").json()["nodes"]}
    r = c.post("/api/sessions", json={
        "candidate": "Plan Auto", "pool": "data-engineer",
        "plan": {"mode": "auto", "blocks": ["frameworks"], "subblocks": {"frameworks": ["airflow", "pyspark"]},
                 "difficulties": ["junior", "middle"], "count": 5, "seed": 42},
    })
    assert r.status_code == 200, r.text
    plan = r.json()["plan"]
    assert plan["mode"] == "auto" and plan["count"] == 5
    assert 1 <= len(plan["order"]) <= 5 and len(set(plan["order"])) == len(plan["order"])
    for nid in plan["order"]:
        n = nodes[nid]
        assert n["block"] == "frameworks" and n["subblock"] in ("airflow", "pyspark") and n["difficulty"] in ("junior", "middle")
    sid = r.json()["id"]
    assert c.get(f"/api/sessions/{sid}").json()["plan"]["order"] == plan["order"]
    listed = next(s for s in c.get("/api/sessions?pool=data-engineer").json() if s["id"] == sid)
    assert listed["plan_count"] == len(plan["order"]) and "plan" not in listed


def test_session_with_manual_plan_ids_and_matrix_order():
    c = _client()
    r = c.post("/api/sessions", json={
        "candidate": "Plan Manual", "pool": "data-engineer",
        "plan": {"mode": "manual", "nodeIds": ["sql-01", "af-architecture-01"]},
    })
    assert r.status_code == 200, r.text
    assert r.json()["plan"]["order"] == ["sql-01", "af-architecture-01"]  # порядок как передали
    assert r.json()["plan"]["count"] == 2
    # без nodeIds — все подходящие в порядке матрицы (блок → под-колонка → уровень)
    r2 = c.post("/api/sessions", json={
        "candidate": "Plan Manual 2", "pool": "data-engineer",
        "plan": {"mode": "manual", "blocks": ["databases"], "difficulties": ["base", "junior"]},
    })
    assert r2.status_code == 200, r2.text
    order = r2.json()["plan"]["order"]
    nodes = {n["id"]: n for n in c.get("/api/graph?pool=data-engineer").json()["nodes"]}
    assert order and all(nodes[i]["block"] == "databases" and nodes[i]["difficulty"] in ("base", "junior") for i in order)
    levels = ["base", "junior", "middle", "senior"]
    subs = [nodes[i]["subblock"] or "" for i in order]
    # внутри одной под-колонки уровни не убывают
    for sub in set(subs):
        lv = [levels.index(nodes[i]["difficulty"]) for i in order if (nodes[i]["subblock"] or "") == sub]
        assert lv == sorted(lv)


def test_session_plan_errors_and_legacy_sessions():
    c = _client()
    assert c.post("/api/sessions", json={"candidate": "x", "pool": "data-engineer",
                                          "plan": {"mode": "auto", "blocks": ["nope"]}}).status_code == 422
    assert c.post("/api/sessions", json={"candidate": "x", "pool": "data-engineer",
                                          "plan": {"mode": "manual", "nodeIds": ["sql-01", "ghost-99"]}}).status_code == 422
    assert c.post("/api/sessions", json={"candidate": "x", "pool": "data-engineer",
                                          "plan": {"mode": "weird"}}).status_code == 422
    legacy = c.post("/api/sessions", json={"candidate": "No Plan", "pool": "data-engineer"}).json()
    assert legacy["plan"] is None
    listed = next(s for s in c.get("/api/sessions?pool=data-engineer").json() if s["id"] == legacy["id"])
    assert listed["plan_count"] is None
