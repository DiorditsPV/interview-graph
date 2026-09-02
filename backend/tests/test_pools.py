"""Тесты конфигурации пулов (content/<pool>/pool.yaml)."""

from pathlib import Path

import pytest

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
