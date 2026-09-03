"""Тесты конфигурации пулов (content/<pool>/pool.yaml)."""

from pathlib import Path

import pytest

from app.importer import load_pool_content, parse_file, validate_against_pool
from app.models import Node
from app.pools import PoolCfg, block_weights, load_pools

VALID = """\
id: demo
label: Демо
description: тестовый пул
blocks:
  - id: alpha
    label: Альфа
    color: "#2563eb"
    weight: 60
    subblocks:
      - { id: a1, label: A1 }
      - { id: a2, label: A2 }
  - id: beta
    label: Бета
    color: "#16a34a"
    weight: 40
"""


def _mk(tmp_path: Path, name: str, yaml_text: str) -> Path:
    d = tmp_path / name
    d.mkdir()
    (d / "pool.yaml").write_text(yaml_text, encoding="utf-8")
    return d


def test_load_valid_pool(tmp_path):
    _mk(tmp_path, "demo", VALID)
    pools = load_pools(tmp_path)
    assert set(pools) == {"demo"}
    p = pools["demo"]
    assert isinstance(p, PoolCfg)
    assert p.label == "Демо"
    assert [b.id for b in p.blocks] == ["alpha", "beta"]
    assert p.block_ids == {"alpha", "beta"}
    assert p.subblock_ids("alpha") == {"a1", "a2"}
    assert p.subblock_ids("beta") == frozenset()
    assert p.dir == tmp_path / "demo"
    assert block_weights(p) == {"alpha": 60, "beta": 40}


def test_pool_id_must_match_dir(tmp_path):
    _mk(tmp_path, "other", VALID)  # id: demo, каталог other
    assert load_pools(tmp_path) == {}


def test_dir_without_pool_yaml_is_skipped(tmp_path):
    (tmp_path / "stray").mkdir()
    _mk(tmp_path, "demo", VALID)
    assert set(load_pools(tmp_path)) == {"demo"}


def test_invalid_yaml_is_skipped_not_fatal(tmp_path):
    _mk(tmp_path, "demo", VALID)
    _mk(tmp_path, "broken", "id: broken\nblocks: [not, a, mapping]\n")
    assert set(load_pools(tmp_path)) == {"demo"}


def test_to_dict_has_no_dir(tmp_path):
    _mk(tmp_path, "demo", VALID)
    d = load_pools(tmp_path)["demo"].to_dict()
    assert d["id"] == "demo" and "dir" not in d
    assert d["blocks"][0]["subblocks"] == [{"id": "a1", "label": "A1"}, {"id": "a2", "label": "A2"}]
    assert d["blocks"][1]["subblocks"] == []


def test_missing_content_dir(tmp_path):
    assert load_pools(tmp_path / "nope") == {}


MD_OK = "---\nid: alpha-01\nblock: alpha\nsubblock: a1\ntopic: t\ntitle: T\n---\n## Вопрос\nq?\n## Ответ\na.\n"
MD_BAD_BLOCK = "---\nid: bad-01\nblock: gamma\ntopic: t\n---\n## Вопрос\nq?\n"
MD_BAD_SUB = "---\nid: bad-02\nblock: alpha\nsubblock: zzz\ntopic: t\n---\n## Вопрос\nq?\n"


def test_parse_file_sets_pool(tmp_path):
    f = tmp_path / "alpha-01.md"
    f.write_text(MD_OK, encoding="utf-8")
    [node] = parse_file(f, pool_id="demo")
    assert node.pool == "demo" and node.block == "alpha" and node.subblock == "a1"


def test_load_pool_content_validates_blocks(tmp_path):
    d = _mk(tmp_path, "demo", VALID)
    (d / "alpha").mkdir()
    (d / "alpha" / "alpha-01.md").write_text(MD_OK, encoding="utf-8")
    (d / "alpha" / "bad-01.md").write_text(MD_BAD_BLOCK, encoding="utf-8")
    (d / "alpha" / "bad-02.md").write_text(MD_BAD_SUB, encoding="utf-8")
    pool = load_pools(tmp_path)["demo"]
    nodes, errors = load_pool_content(pool)
    assert [n.id for n in nodes] == ["alpha-01"]
    assert all(n.pool == "demo" for n in nodes)
    files = sorted(e.file for e in errors)
    assert files == ["alpha/bad-01.md", "alpha/bad-02.md"]
    assert any("block 'gamma'" in e.error for e in errors)
    assert any("subblock 'zzz'" in e.error for e in errors)


def test_validate_against_pool_ok_without_subblock(tmp_path):
    _mk(tmp_path, "demo", VALID)
    pool = load_pools(tmp_path)["demo"]
    node = Node(id="b-1", pool="demo", block="beta", topic="t", question="q")
    validate_against_pool(node, pool)  # не бросает


# --- pool-crud: пул как данные (таблица pools), slug из названия ---
import json

from app.pools import PoolConfigError, blocks_to_json, parse_blocks, pool_from_row, slug_from_label


def test_parse_blocks_and_json_roundtrip(tmp_path):
    _mk(tmp_path, "demo", VALID)
    cfg = load_pools(tmp_path)["demo"]
    raw = json.loads(blocks_to_json(cfg.blocks))
    assert raw[0]["subblocks"] == [{"id": "a1", "label": "A1"}, {"id": "a2", "label": "A2"}]
    assert raw[1]["subblocks"] == []
    assert parse_blocks(raw) == cfg.blocks


def test_pool_from_row_has_no_dir():
    row = {"id": "x", "label": "X", "description": "", "blocks": [{"id": "a", "label": "A", "color": "#000000", "weight": 1}]}
    cfg = pool_from_row(row)
    assert cfg.id == "x" and cfg.dir is None and cfg.block_ids == {"a"}
    assert cfg.to_dict()["blocks"][0]["subblocks"] == []


def test_pool_from_row_validates():
    with pytest.raises(PoolConfigError):
        pool_from_row({"id": "x", "label": "X", "description": "", "blocks": []})
    with pytest.raises(PoolConfigError):
        pool_from_row({"id": "x", "label": "X", "description": "", "blocks": [{"id": "a", "label": "A", "color": "red", "weight": 1}]})


@pytest.mark.parametrize("label,slug", [
    ("Аналитик данных", "analitik-dannyh"),
    ("Data Engineer X5", "data-engineer-x5"),
    ("  Щи & Ёж  ", "schi-ezh"),
    ("!!!", "pool"),
])
def test_slug_from_label(label, slug):
    assert slug_from_label(label) == slug


# --- pool-blocks-editor: колонки из UI → id/weight по правилам, затем обычная валидация ---
from app.pools import BlockCfg, SubblockCfg, normalize_blocks


def test_normalize_blocks_generates_ids_and_keeps_weights():
    existing = (
        BlockCfg(id="python", label="Python", color="#d97706", weight=30, subblocks=()),
        BlockCfg(id="sql", label="SQL", color="#16a34a", weight=25, subblocks=(SubblockCfg("queries", "Запросы"),)),
    )
    raw = [
        {"id": "sql", "label": "SQL и индексы", "color": "#16a34a", "subblocks": [
            {"id": "queries", "label": "Запросы"}, {"label": "Индексы и планы"}]},
        {"label": "Переговоры", "color": "#2563eb"},
        {"label": "Переговоры", "color": "#9333ea", "subblocks": [{"label": "Холодные"}, {"label": "Холодные"}]},
    ]
    out = normalize_blocks(raw, existing)
    assert [b["id"] for b in out] == ["sql", "peregovory", "peregovory-2"]
    assert out[0]["weight"] == 25 and out[1]["weight"] == 1          # прежний вес сохраняется, новый — 1
    assert [s["id"] for s in out[0]["subblocks"]] == ["queries", "indeksy-i-plany"]
    assert [s["id"] for s in out[2]["subblocks"]] == ["holodnye", "holodnye-2"]
    assert parse_blocks(out)[2].subblocks[1].id == "holodnye-2"


def test_normalize_blocks_bad_input():
    with pytest.raises(PoolConfigError):
        normalize_blocks({"label": "x"}, ())
    with pytest.raises(PoolConfigError):
        normalize_blocks(["x"], ())
    with pytest.raises(PoolConfigError):
        parse_blocks(normalize_blocks([{"label": "", "color": "#000000"}], ()))   # пустое название
    with pytest.raises(PoolConfigError):
        parse_blocks(normalize_blocks([{"label": "A", "color": "red"}], ()))       # цвет не #rrggbb
    with pytest.raises(PoolConfigError):
        parse_blocks(normalize_blocks([], ()))                                       # ни одной колонки


def test_normalize_blocks_does_not_recycle_ids_of_removed_entries():
    """Удалили колонку/под-колонку и в том же сохранении добавили новую с тем же названием:
    id не переиспользуется, иначе вопросы удалённой «выживут» под новой."""
    existing = (
        BlockCfg(id="peregovory", label="Переговоры", color="#111111", weight=3,
                 subblocks=(SubblockCfg("holodnye", "Холодные"), SubblockCfg("goryachie", "Горячие"))),
    )
    out = normalize_blocks([{"label": "Переговоры", "color": "#222222"}], existing)
    assert out[0]["id"] == "peregovory-2" and out[0]["weight"] == 1
    out = normalize_blocks(
        [{"id": "peregovory", "label": "Переговоры", "color": "#111111",
          "subblocks": [{"id": "goryachie", "label": "Горячие"}, {"label": "Холодные"}]}],
        existing,
    )
    assert [s["id"] for s in out[0]["subblocks"]] == ["goryachie", "holodnye-2"]


def test_normalize_blocks_ignores_bool_weight_and_rejects_non_list_subblocks():
    existing = (BlockCfg(id="a", label="A", color="#111111", weight=7, subblocks=()),)
    assert normalize_blocks([{"id": "a", "label": "A", "color": "#111111", "weight": True}], existing)[0]["weight"] == 7
    assert normalize_blocks([{"id": "a", "label": "A", "color": "#111111", "weight": 4}], existing)[0]["weight"] == 4
    with pytest.raises(PoolConfigError):
        normalize_blocks([{"label": "A", "color": "#111111", "subblocks": 0}], ())
