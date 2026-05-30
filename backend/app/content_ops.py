"""Операции мутации контента банка (удаление вопроса).

Резолвер id→файл СКАНИРУЕТ распарсенный контент — путь из id НЕ строится никогда,
поэтому path-injection (`../`, абсолютные пути) невозможен по конструкции: такой id
просто не найдётся среди нод → NodeNotFound. Поддержаны оба формата content/:
Markdown (один вопрос на файл) и JSON (`{"nodes":[...]}` / список / одиночный объект).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List

from pydantic import ValidationError

from .importer import _node_from_markdown


class NodeNotFound(Exception):
    """Вопрос с таким id не найден ни в одном файле content/."""


def _content_files(content_dir: Path) -> List[Path]:
    return sorted(
        p
        for p in content_dir.rglob("*")
        if p.suffix.lower() in {".md", ".json"} and p.name != "weights.yaml"
    )


def _effective_id(item: object, stem: str) -> str:
    # JSON-элемент без явного id наследует stem файла (как в importer._nodes_from_json).
    return item.get("id", stem) if isinstance(item, dict) else stem


def _rel(path: Path, root: Path) -> str:
    return str(path.resolve().relative_to(root))


def delete_node(content_dir: Path, node_id: str) -> Dict:
    """Удалить вопрос `node_id` из банка. Возврат `{deleted, file, fileRemoved}`.

    `.md` → unlink файла. JSON multi-node → выкинуть совпавший сырой элемент и
    переписать файл (или unlink, если опустел). Не найдено → `NodeNotFound`.
    Битые файлы при скане пропускаются (как в `importer.load_content`).
    """
    root = content_dir.resolve()
    for path in _content_files(root):
        try:
            if path.suffix.lower() == ".md":
                if _node_from_markdown(path).id != node_id:
                    continue
                # found: одиночный вопрос на файл → удаляем файл целиком.
                path.unlink()
                return {"deleted": node_id, "file": _rel(path, root), "fileRemoved": True}

            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict) and "nodes" in raw:
                items, container = raw["nodes"], "wrapped"
            elif isinstance(raw, list):
                items, container = raw, "list"
            else:
                items, container = [raw], "single"

            if not any(_effective_id(it, path.stem) == node_id for it in items):
                continue
            # found: выкидываем совпавший элемент из СЫРОГО списка (соседи — байт-в-байт).
            remaining = [it for it in items if _effective_id(it, path.stem) != node_id]
            if not remaining:
                path.unlink()
                return {"deleted": node_id, "file": _rel(path, root), "fileRemoved": True}
            out = {**raw, "nodes": remaining} if container == "wrapped" else remaining
            path.write_text(
                json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            return {"deleted": node_id, "file": _rel(path, root), "fileRemoved": False}
        except (ValidationError, ValueError, OSError):
            # битый/нечитаемый файл — пропускаем, как делает importer.load_content.
            continue

    raise NodeNotFound(node_id)
