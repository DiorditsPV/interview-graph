"""Импорт банка вопросов из Markdown (YAML-frontmatter) и JSON.

Markdown: метаданные в frontmatter, тело делится на «вопрос» и «ответ» по
заголовкам (## Вопрос / ## Ответ, либо синонимы). Если в frontmatter уже есть
поля question/answer — тело игнорируется.

JSON: либо один объект-нода, либо {"nodes": [...]}, либо список нод.

Каждая нода валидируется схемой models.Node. Битые файлы не роняют загрузку —
они попадают в список ошибок.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, List, Tuple

import frontmatter
from pydantic import ValidationError

from .models import ImportError_, Node
from .pools import PoolCfg

# Заголовки-маркеры тела Markdown (регистронезависимо).
_Q_HEADINGS = ["вопрос", "задача", "question", "task"]
_A_HEADINGS = ["ответ", "решение", "эталон", "answer", "solution"]

_HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s+(.+?)\s*$", re.MULTILINE)


def _split_body(body: str) -> Tuple[str, str]:
    """Разделить тело Markdown на (question, answer) по заголовкам-маркерам.

    Если маркеров нет — всё тело считается ответом (question берётся из
    frontmatter вызывающей стороной).
    """
    matches = list(_HEADING_RE.finditer(body))
    if not matches:
        return "", body.strip()

    q_text = ""
    a_text = ""
    for i, m in enumerate(matches):
        title = m.group(1).strip().lower().rstrip(":")
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        section = body[start:end].strip()
        if any(title.startswith(h) for h in _Q_HEADINGS):
            q_text = section
        elif any(title.startswith(h) for h in _A_HEADINGS):
            a_text = section

    # Текст до первого заголовка — если не распознали явный вопрос, считаем его вопросом.
    preamble = body[: matches[0].start()].strip()
    if not q_text and preamble:
        q_text = preamble
    return q_text, a_text


def _node_from_markdown(path: Path, pool_id: str) -> Node:
    post = frontmatter.load(str(path))
    data: Dict = dict(post.metadata)
    if "question" not in data or "answer" not in data:
        q, a = _split_body(post.content)
        data.setdefault("question", q)
        data.setdefault("answer", a)
    data.setdefault("id", path.stem)
    data["pool"] = pool_id  # источник правды — каталог, не frontmatter
    return Node.model_validate(data)


def _nodes_from_json(path: Path, pool_id: str) -> List[Node]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "nodes" in raw:
        items = raw["nodes"]
    elif isinstance(raw, list):
        items = raw
    else:
        items = [raw]
    out: List[Node] = []
    for item in items:
        if isinstance(item, dict):
            item.setdefault("id", path.stem)
            item["pool"] = pool_id
        out.append(Node.model_validate(item))
    return out


def parse_file(path: Path, pool_id: str) -> List[Node]:
    """Распарсить один файл (.md → одна нода, .json → одна или несколько) в список Node
    пула `pool_id`. Бросает ValidationError/ValueError/JSONDecodeError/OSError — вызывающий ловит.
    id-less Markdown берёт id из `path.stem`, поэтому имя файла важно (см. /api/import).
    """
    if path.suffix.lower() == ".md":
        return [_node_from_markdown(path, pool_id)]
    return _nodes_from_json(path, pool_id)


def validate_against_pool(node: Node, pool: PoolCfg) -> None:
    """block/subblock ноды должны быть объявлены в pool.yaml её пула."""
    if node.block not in pool.block_ids:
        raise ValueError(
            f"block '{node.block}' is not declared in pool '{pool.id}' "
            f"(allowed: {', '.join(sorted(pool.block_ids))})"
        )
    if node.subblock and node.subblock not in pool.subblock_ids(node.block):
        raise ValueError(
            f"subblock '{node.subblock}' is not declared for block '{node.block}' in pool '{pool.id}'"
        )


def load_pool_content(pool: PoolCfg) -> Tuple[List[Node], List[ImportError_]]:
    """Загрузить все *.md и *.json каталога пула (рекурсивно), проверив блоки по pool.yaml."""
    nodes: List[Node] = []
    errors: List[ImportError_] = []
    seen: Dict[str, str] = {}

    if pool.dir is None or not pool.dir.exists():
        return nodes, [ImportError_(file=str(pool.dir), error="pool dir not found")]

    files = sorted(p for p in pool.dir.rglob("*") if p.suffix.lower() in {".md", ".json"})
    for path in files:
        rel = str(path.relative_to(pool.dir))
        try:
            batch = parse_file(path, pool.id)
            for node in batch:
                validate_against_pool(node, pool)
        except (ValidationError, ValueError, json.JSONDecodeError, OSError) as exc:
            errors.append(ImportError_(file=rel, error=_fmt_error(exc)))
            continue
        for node in batch:
            if node.id in seen:
                errors.append(
                    ImportError_(file=rel, error=f"duplicate id '{node.id}' (already in {seen[node.id]})")
                )
                continue
            seen[node.id] = rel
            nodes.append(node)

    return nodes, errors


def _fmt_error(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        parts = []
        for err in exc.errors():
            loc = ".".join(str(x) for x in err["loc"])
            parts.append(f"{loc}: {err['msg']}")
        return "; ".join(parts)
    return f"{type(exc).__name__}: {exc}"
