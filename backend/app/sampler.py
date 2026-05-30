"""Балансировка тем: выбор вопросов пропорционально весам.

Баланс задаётся данными (веса блоков/тем из weights.yaml и поля weight у нод),
а не хардкодом. Sampler собирает интервью из N вопросов с учётом профиля
сложности.
"""

from __future__ import annotations

import random
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional

import yaml

from .models import Node

# Дефолтные веса блоков (% банка) — из измеренного дисбаланса репозиториев.
DEFAULT_BLOCK_WEIGHTS: Dict[str, int] = {
    "frameworks": 35,
    "databases": 30,
    "python": 23,
    "platform": 12,
}


def load_weights(content_dir: Path) -> Dict[str, int]:
    """Загрузить веса блоков из content/weights.yaml (с фолбэком на дефолт)."""
    path = content_dir / "weights.yaml"
    if not path.exists():
        return dict(DEFAULT_BLOCK_WEIGHTS)
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        blocks = data.get("blocks", {})
        weights = {k: int(v) for k, v in blocks.items()}
        return weights or dict(DEFAULT_BLOCK_WEIGHTS)
    except (yaml.YAMLError, ValueError, OSError):
        return dict(DEFAULT_BLOCK_WEIGHTS)


# Дефолтные треки (фолбэк, если нет content/tracks.yaml).
DEFAULT_TRACKS: List[Dict] = [
    {"id": "data-engineer", "label": "Дата-инженер", "include": []},
    {
        "id": "backend",
        "label": "Бэкенд-разработчик",
        "include": ["python", "platform", "databases/sql", "databases/dbms", "databases/storage", "frameworks/airflow"],
    },
    {"id": "analyst", "label": "Аналитик", "include": ["databases/sql", "databases/dbms", "python", "platform"]},
]


def load_tracks(content_dir: Path) -> List[Dict]:
    """Загрузить направления интервью из content/tracks.yaml (с фолбэком на дефолт)."""
    path = content_dir / "tracks.yaml"
    if not path.exists():
        return [dict(t) for t in DEFAULT_TRACKS]
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        out = [
            {"id": t["id"], "label": t.get("label", t["id"]), "include": list(t.get("include") or [])}
            for t in (data.get("tracks") or [])
            if t.get("id")
        ]
        return out or [dict(t) for t in DEFAULT_TRACKS]
    except (yaml.YAMLError, ValueError, KeyError, OSError):
        return [dict(t) for t in DEFAULT_TRACKS]


def node_in_track(node: Node, include: Optional[List[str]]) -> bool:
    """Входит ли нода в трек: include пуст ИЛИ совпал block / "block/subblock"."""
    if not include:
        return True
    if node.block in include:
        return True
    return bool(node.subblock and f"{node.block}/{node.subblock}" in include)


def build_interview(
    nodes: List[Node],
    count: int = 20,
    difficulties: Optional[List[str]] = None,
    block_weights: Optional[Dict[str, int]] = None,
    track_include: Optional[List[str]] = None,
    seed: Optional[int] = None,
) -> List[str]:
    """Собрать интервью: вернуть упорядоченный список id нод.

    Кол-во вопросов на блок пропорционально весам блоков; внутри блока выбор
    взвешен по полю weight ноды. Фильтры: уровни сложности (difficulties) и
    охват трека (track_include).
    """
    rng = random.Random(seed)
    block_weights = block_weights or DEFAULT_BLOCK_WEIGHTS

    pool = nodes
    if difficulties:
        pool = [n for n in pool if n.difficulty in difficulties]
    if track_include:
        pool = [n for n in pool if node_in_track(n, track_include)]
    if not pool:
        return []

    by_block: Dict[str, List[Node]] = defaultdict(list)
    for n in pool:
        by_block[n.block].append(n)

    # Сколько вопросов выделить каждому присутствующему блоку.
    present = {b: w for b, w in block_weights.items() if by_block.get(b)}
    total_w = sum(present.values()) or 1
    quota = {b: max(1, round(count * w / total_w)) for b, w in present.items()}

    selected: List[str] = []
    for block, k in quota.items():
        candidates = by_block[block]
        chosen = _weighted_sample(candidates, min(k, len(candidates)), rng)
        selected.extend(n.id for n in chosen)

    rng.shuffle(selected)
    return selected[:count]


def _weighted_sample(nodes: List[Node], k: int, rng: random.Random) -> List[Node]:
    """Выбрать k нод без повторов, взвешивая по node.weight."""
    pool = list(nodes)
    out: List[Node] = []
    for _ in range(min(k, len(pool))):
        weights = [max(1, n.weight) for n in pool]
        pick = rng.choices(pool, weights=weights, k=1)[0]
        out.append(pick)
        pool.remove(pick)
    return out
