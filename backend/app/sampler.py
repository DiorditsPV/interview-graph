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


LEVELS = ["base", "junior", "middle", "senior"]


def filter_nodes(
    nodes: List[Node],
    blocks: Optional[List[str]] = None,
    subblocks: Optional[Dict[str, List[str]]] = None,
    difficulties: Optional[List[str]] = None,
) -> List[Node]:
    """Ноды под условия плана интервью: разделы, под-колонки (по разделу), уровни.

    `subblocks` = {раздел: [под-колонки]} — ограничение действует только на перечисленные разделы;
    у остальных разделов берутся все ноды. Пустые/None фильтры не ограничивают.
    """
    out = nodes
    if blocks:
        out = [n for n in out if n.block in blocks]
    if subblocks:
        out = [n for n in out if n.block not in subblocks or n.subblock in subblocks[n.block]]
    if difficulties:
        out = [n for n in out if n.difficulty in difficulties]
    return out


def matrix_order(nodes: List[Node], block_order: List[str], sub_order: Dict[str, List[str]]) -> List[str]:
    """Порядок матрицы: раздел (как в pool.yaml) → под-колонка → уровень → id. Для ручного плана."""

    def key(n: Node):
        b = block_order.index(n.block) if n.block in block_order else len(block_order)
        subs = sub_order.get(n.block) or []
        s = subs.index(n.subblock) if n.subblock in subs else len(subs)
        d = LEVELS.index(n.difficulty) if n.difficulty in LEVELS else len(LEVELS)
        return (b, s, d, n.id)

    return [n.id for n in sorted(nodes, key=key)]


def build_interview(
    nodes: List[Node],
    count: int = 20,
    difficulties: Optional[List[str]] = None,
    block_weights: Optional[Dict[str, int]] = None,
    seed: Optional[int] = None,
    blocks: Optional[List[str]] = None,
    subblocks: Optional[Dict[str, List[str]]] = None,
) -> List[str]:
    """Собрать интервью: вернуть упорядоченный список id нод.

    Кол-во вопросов на блок пропорционально весам блоков; внутри блока выбор
    взвешен по полю weight ноды. Фильтры: разделы, под-колонки, уровни (см. filter_nodes).
    """
    rng = random.Random(seed)
    block_weights = block_weights or DEFAULT_BLOCK_WEIGHTS

    pool = filter_nodes(nodes, blocks=blocks, subblocks=subblocks, difficulties=difficulties)
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
