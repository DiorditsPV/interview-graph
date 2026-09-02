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
