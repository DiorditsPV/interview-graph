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
