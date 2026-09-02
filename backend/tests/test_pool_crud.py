"""CRUD направлений: таблица pools (сид из pool.yaml + пользовательские), копирование нод, API."""

from pathlib import Path

from app.db import Database

BLOCKS = [
    {"id": "a", "label": "A", "color": "#111111", "weight": 1, "subblocks": [{"id": "a1", "label": "A1"}]},
]


def _db(tmp_path: Path) -> Database:
    db = Database(tmp_path / "t.db")
    db.ensure_tenant("t")
    return db


# --- DAL ---
def test_seed_then_user_pool_order_and_tombstone(tmp_path):
    db = _db(tmp_path)
    assert db.upsert_pool_seed("t", {"id": "de", "label": "DE", "description": "", "blocks": BLOCKS}) is True
    assert db.upsert_pool_seed("t", {"id": "de", "label": "DE2", "description": "", "blocks": BLOCKS}) is False
    db.create_pool("t", "sa", "SA", "desc", BLOCKS)
    assert [p["id"] for p in db.list_pools("t")] == ["de", "sa"]
    assert db.list_pools("t")[0]["label"] == "DE"  # OR IGNORE не перетирает сид
    assert db.list_pools("t")[1]["blocks"][0]["subblocks"] == [{"id": "a1", "label": "A1"}]
    assert db.list_pools("t")[1]["source"] == "user"
    assert db.update_pool("t", "sa", {"label": "SA!", "hidden_field": "x"})["label"] == "SA!"
    assert db.update_pool("t", "nope", {"label": "x"}) is None
    assert db.delete_pool("t", "sa") == 0
    assert [p["id"] for p in db.list_pools("t")] == ["de"]
    assert db.get_pool("t", "sa")["deleted_at"] is not None  # tombstone: id остаётся занятым
    assert db.delete_pool("t", "sa") is None
    assert db.update_pool("t", "sa", {"label": "y"}) is None
    assert db.upsert_pool_seed("t", {"id": "sa", "label": "SA", "description": "", "blocks": BLOCKS}) is False
    assert [p["id"] for p in db.list_pools("t")] == ["de"]


def test_copy_nodes_and_delete_pool_removes_them(tmp_path):
    db = _db(tmp_path)
    db.create_pool("t", "src", "Src", "", BLOCKS)
    db.create_pool("t", "dst", "Dst", "", BLOCKS)
    db.upsert_node(
        "t",
        {"id": "q-01", "pool": "src", "block": "a", "subblock": "a1", "topic": "x",
         "question": "Q?", "answer": "A", "tags": ["sql"], "rubric": ["r1"]},
        source="seed",
    )
    db.set_node_hidden("t", "q-01", True)
    assert db.copy_nodes("t", "src", "dst") == 1
    copied = db.get_node("t", "dst-q-01")
    assert copied["pool"] == "dst" and copied["source"] == "user" and copied["hidden"] is False
    assert copied["tags"] == ["sql"] and copied["rubric"] == ["r1"] and copied["subblock"] == "a1"
    assert db.count_nodes("t", pool="src") == 1 and db.count_nodes("t", pool="dst") == 1
    assert db.delete_pool("t", "dst") == 1
    assert db.get_node("t", "dst-q-01") is None
    assert db.count_nodes("t", pool="src") == 1


# --- API ---
from fastapi.testclient import TestClient


def _client() -> TestClient:
    from app.main import OWNER_EMAIL, OWNER_PASSWORD, app

    c = TestClient(app)
    c.post("/api/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    return c


def test_create_pool_from_preset_copies_blocks_and_nodes():
    c = _client()
    de = next(p for p in c.get("/api/pools").json() if p["id"] == "data-engineer")
    r = c.post("/api/pools", json={"label": "Аналитик данных", "description": "тест", "preset": "data-engineer"})
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["id"] == "analitik-dannyh" and p["label"] == "Аналитик данных" and p["description"] == "тест"
    assert p["blocks"] == de["blocks"]
    assert p["counts"]["nodes"] == de["counts"]["nodes"] > 0
    assert p["counts"]["sessions"] == 0
    nodes = c.get("/api/graph?pool=analitik-dannyh").json()["nodes"]
    assert len(nodes) == de["counts"]["nodes"]
    assert all(n["id"].startswith("analitik-dannyh-") and n["pool"] == "analitik-dannyh" for n in nodes)
    listed = [x["id"] for x in c.get("/api/pools").json()]
    assert listed.index("analitik-dannyh") > listed.index("data-engineer")  # порядок создания
    # второй с тем же названием → суффикс
    r2 = c.post("/api/pools", json={"label": "Аналитик данных", "preset": "data-engineer"})
    assert r2.json()["id"] == "analitik-dannyh-2"
    for pid in ("analitik-dannyh", "analitik-dannyh-2"):
        assert c.delete(f"/api/pools/{pid}").status_code == 200


def test_create_pool_errors():
    c = _client()
    assert c.post("/api/pools", json={"label": "X", "preset": "nope"}).status_code == 404
    assert c.post("/api/pools", json={"label": "", "preset": "data-engineer"}).status_code == 422
    assert c.post("/api/pools", json={"label": "X"}).status_code == 422


def test_update_and_delete_pool_keeps_sessions_and_blocks_reseed():
    c = _client()
    p = c.post("/api/pools", json={"label": "Temp Pool", "preset": "system-analyst"}).json()
    pid = p["id"]
    upd = c.put(f"/api/pools/{pid}", json={"label": "Temp Pool 2", "description": "d"}).json()
    assert upd["label"] == "Temp Pool 2" and upd["description"] == "d" and upd["blocks"] == p["blocks"]
    assert c.put("/api/pools/nope", json={"label": "x"}).status_code == 404
    assert c.put(f"/api/pools/{pid}", json={"label": ""}).status_code == 422
    sid = c.post("/api/sessions", json={"candidate": "Keep Me", "pool": pid}).json()["id"]
    r = c.delete(f"/api/pools/{pid}")
    assert r.status_code == 200
    assert r.json() == {"deleted": pid, "nodes_removed": p["counts"]["nodes"], "sessions_kept": 1}
    assert pid not in {x["id"] for x in c.get("/api/pools").json()}
    assert c.get(f"/api/graph?pool={pid}").status_code == 404
    assert c.get(f"/api/sessions/{sid}").status_code == 200  # история осталась
    assert c.delete(f"/api/pools/{pid}").status_code == 404
    assert c.put(f"/api/pools/{pid}", json={"label": "x"}).status_code == 404
    # tombstone: то же название даёт новый id, а не воскрешает старый
    p2 = c.post("/api/pools", json={"label": "Temp Pool", "preset": "system-analyst"}).json()
    assert p2["id"] == f"{pid}-2"
    c.delete(f"/api/pools/{p2['id']}")


def test_seed_does_not_resurrect_deleted_pool(tmp_path):
    from app.pools import load_pools
    from app.seed import seed_pool_if_empty

    cfg = load_pools(Path(__file__).resolve().parent.parent.parent / "content")["system-analyst"]
    db = Database(tmp_path / "s.db")
    inserted, errors = seed_pool_if_empty(db, "default", cfg)
    assert inserted > 0 and errors == []
    assert [p["id"] for p in db.list_pools("default")] == ["system-analyst"]
    assert db.list_pools("default")[0]["blocks"] == [
        {"id": b.id, "label": b.label, "color": b.color, "weight": b.weight,
         "subblocks": [{"id": s.id, "label": s.label} for s in b.subblocks]}
        for b in cfg.blocks
    ]
    db.delete_pool("default", "system-analyst")
    assert seed_pool_if_empty(db, "default", cfg) == (0, [])
    assert db.list_pools("default") == []
    assert db.count_nodes("default", pool="system-analyst") == 0
