"""Конфигурация пулов направлений: content/<pool>/pool.yaml.

Пул — самостоятельный банк вопросов со своей таксономией блоков (см. спек
docs/superpowers/specs/2026-09-02-pools-and-main-menu-design.md). Отсюда берут
порядок и подписи колонок фронт, веса — sampler, допустимые block/subblock — импортёр.

Невалидный pool.yaml не роняет сервис: каталог пропускается с предупреждением в лог,
как сегодня битый контент попадает в errors, а не в 500.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, Tuple

import yaml

log = logging.getLogger("interview")

_ID_RE = re.compile(r"^[a-z0-9-]+$")
_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class PoolConfigError(ValueError):
    """pool.yaml есть, но не проходит валидацию."""


@dataclass(frozen=True)
class SubblockCfg:
    id: str
    label: str


@dataclass(frozen=True)
class BlockCfg:
    id: str
    label: str
    color: str
    weight: int
    subblocks: Tuple[SubblockCfg, ...]


@dataclass(frozen=True)
class PoolCfg:
    id: str
    label: str
    description: str
    blocks: Tuple[BlockCfg, ...]
    dir: Path

    @property
    def block_ids(self) -> frozenset:
        return frozenset(b.id for b in self.blocks)

    def subblock_ids(self, block_id: str) -> frozenset:
        for b in self.blocks:
            if b.id == block_id:
                return frozenset(s.id for s in b.subblocks)
        return frozenset()

    def to_dict(self) -> dict:
        """Форма для /api/pools — без пути к каталогу."""
        return {
            "id": self.id,
            "label": self.label,
            "description": self.description,
            "blocks": [
                {
                    "id": b.id,
                    "label": b.label,
                    "color": b.color,
                    "weight": b.weight,
                    "subblocks": [{"id": s.id, "label": s.label} for s in b.subblocks],
                }
                for b in self.blocks
            ],
        }


def _req_str(d: dict, key: str, where: str) -> str:
    v = d.get(key)
    if not isinstance(v, str) or not v.strip():
        raise PoolConfigError(f"{where}: '{key}' must be a non-empty string")
    return v.strip()


def _parse_pool(data: dict, pool_dir: Path) -> PoolCfg:
    if not isinstance(data, dict):
        raise PoolConfigError("pool.yaml must be a mapping")
    pid = _req_str(data, "id", "pool")
    if not _ID_RE.match(pid):
        raise PoolConfigError(f"pool id '{pid}' must match [a-z0-9-]+")
    if pid != pool_dir.name:
        raise PoolConfigError(f"pool id '{pid}' must equal directory name '{pool_dir.name}'")
    raw_blocks = data.get("blocks")
    if not isinstance(raw_blocks, list) or not raw_blocks:
        raise PoolConfigError("pool must declare a non-empty 'blocks' list")

    blocks = []
    seen = set()
    for rb in raw_blocks:
        if not isinstance(rb, dict):
            raise PoolConfigError("each block must be a mapping")
        bid = _req_str(rb, "id", "block")
        if not _ID_RE.match(bid):
            raise PoolConfigError(f"block id '{bid}' must match [a-z0-9-]+")
        if bid in seen:
            raise PoolConfigError(f"duplicate block id '{bid}'")
        seen.add(bid)
        color = _req_str(rb, "color", f"block {bid}")
        if not _COLOR_RE.match(color):
            raise PoolConfigError(f"block {bid}: color must be #rrggbb")
        weight = rb.get("weight", 1)
        if not isinstance(weight, int) or weight < 0:
            raise PoolConfigError(f"block {bid}: weight must be a non-negative integer")
        subs = []
        sub_seen = set()
        for rs in rb.get("subblocks") or []:
            if not isinstance(rs, dict):
                raise PoolConfigError(f"block {bid}: each subblock must be a mapping")
            sid = _req_str(rs, "id", f"subblock of {bid}")
            if not _ID_RE.match(sid):
                raise PoolConfigError(f"subblock id '{sid}' must match [a-z0-9-]+")
            if sid in sub_seen:
                raise PoolConfigError(f"block {bid}: duplicate subblock '{sid}'")
            sub_seen.add(sid)
            subs.append(SubblockCfg(id=sid, label=_req_str(rs, "label", f"subblock {sid}")))
        blocks.append(
            BlockCfg(
                id=bid,
                label=_req_str(rb, "label", f"block {bid}"),
                color=color,
                weight=weight,
                subblocks=tuple(subs),
            )
        )
    return PoolCfg(
        id=pid,
        label=_req_str(data, "label", "pool"),
        description=str(data.get("description") or "").strip(),
        blocks=tuple(blocks),
        dir=pool_dir,
    )


def load_pool(pool_dir: Path) -> PoolCfg:
    """Прочитать один каталог пула. Бросает PoolConfigError / OSError / yaml.YAMLError."""
    data = yaml.safe_load((pool_dir / "pool.yaml").read_text(encoding="utf-8"))
    return _parse_pool(data, pool_dir)


def load_pools(content_dir: Path) -> Dict[str, PoolCfg]:
    """Все валидные пулы в content_dir, по id. Каталоги без pool.yaml пропускаются молча,
    с невалидным — с предупреждением."""
    out: Dict[str, PoolCfg] = {}
    if not content_dir.exists():
        return out
    for d in sorted(p for p in content_dir.iterdir() if p.is_dir()):
        if not (d / "pool.yaml").exists():
            continue
        try:
            cfg = load_pool(d)
        except (PoolConfigError, yaml.YAMLError, OSError) as exc:
            log.warning("pool '%s' skipped: %s", d.name, exc)
            continue
        out[cfg.id] = cfg
    return out


def block_weights(pool: PoolCfg) -> Dict[str, int]:
    """Веса блоков для sampler (порядок блоков сохраняется)."""
    return {b.id: b.weight for b in pool.blocks}


def default_pool_id(pools: Iterable[str]) -> str | None:
    """Пул по умолчанию для запросов без ?pool: data-engineer, иначе первый по алфавиту."""
    ids = sorted(pools)
    if not ids:
        return None
    return "data-engineer" if "data-engineer" in ids else ids[0]
