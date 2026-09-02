"""Балансировка тем: выбор вопросов пропорционально весам.

Баланс задаётся данными (веса блоков из pool.yaml и поля weight у нод),
а не хардкодом. Sampler собирает интервью из N вопросов с учётом профиля
сложности.
"""

from __future__ import annotations

import random
from collections import defaultdict
from typing import Dict, List, Optional

from .models import Node

# Дефолтные веса блоков (% банка) — из измеренного дисбаланса репозиториев.
DEFAULT_BLOCK_WEIGHTS: Dict[str, int] = {
    "frameworks": 35,
    "databases": 30,
    "python": 23,
    "platform": 12,
}


def build_interview(
    nodes: List[Node],
    count: int = 20,
    difficulties: Optional[List[str]] = None,
    block_weights: Optional[Dict[str, int]] = None,
    seed: Optional[int] = None,
) -> List[str]:
    """Собрать интервью: вернуть упорядоченный список id нод.

    Кол-во вопросов на блок пропорционально весам блоков; внутри блока выбор
    взвешен по полю weight ноды. Фильтры: уровни сложности (difficulties).
    """
    rng = random.Random(seed)
    block_weights = block_weights or DEFAULT_BLOCK_WEIGHTS

    pool = nodes
    if difficulties:
        pool = [n for n in pool if n.difficulty in difficulties]
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
