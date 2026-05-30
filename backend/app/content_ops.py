"""Операции мутации контента банка (удаление вопроса).

Резолвер id→файл СКАНИРУЕТ распарсенный контент — путь из id НЕ строится никогда,
поэтому path-injection (`../`, абсолютные пути) невозможен по конструкции: такой id
просто не найдётся среди нод → NodeNotFound. Поддержаны оба формата content/:
Markdown (один вопрос на файл) и JSON (`{"nodes":[...]}` / список / одиночный объект).
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, List

import frontmatter
from pydantic import ValidationError

from .importer import _node_from_markdown, load_content
from .models import Node


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


def _md_body(kind: str, question: str, answer: str) -> str:
    """Тело markdown в конвенции банка: `## Вопрос`/`## Ответ` (для задач — Задача/Решение)."""
    q_h, a_h = ("Задача", "Решение") if kind == "task" else ("Вопрос", "Ответ")
    return f"## {q_h}\n\n{question}\n\n## {a_h}\n\n{answer}\n"


def _write_md(path: Path, node: Node) -> None:
    """Сериализовать Node в markdown: метаданные во frontmatter, q/a — в тело."""
    meta = node.model_dump(by_alias=True, exclude_none=True)
    question = meta.pop("question", "")
    answer = meta.pop("answer", "")
    post = frontmatter.Post(content=_md_body(node.kind, question, answer), **meta)
    path.write_text(frontmatter.dumps(post) + "\n", encoding="utf-8")


def _slugify(s: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", s.strip().lower()).strip("-")
    return slug or "q"


def _unique_id(base: str, taken: set) -> str:
    n = 1
    while f"{base}-{n:02d}" in taken:
        n += 1
    return f"{base}-{n:02d}"


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


def update_node(content_dir: Path, node_id: str, fields: Dict) -> Dict:
    """Обновить структурные поля вопроса (title/difficulty/question/answer).

    id резолвится сканом (путь из id не строится). Результат валидируется через
    `Node.model_validate` ДО записи — невалидное (напр. пустой question) бросает
    ValidationError, файл не трогается. Не найдено → `NodeNotFound`.
    """
    root = content_dir.resolve()
    for path in _content_files(root):
        try:
            if path.suffix.lower() == ".md":
                node = _node_from_markdown(path)
                if node.id != node_id:
                    continue
                merged = {**node.model_dump(by_alias=True), **fields}
                updated = Node.model_validate(merged)  # бросит при невалидном
                _write_md(path, updated)
                return {"updated": node_id, "file": _rel(path, root)}

            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict) and "nodes" in raw:
                items = raw["nodes"]
            elif isinstance(raw, list):
                items = raw
            else:
                items = [raw]
            target = next(
                (it for it in items if isinstance(it, dict) and _effective_id(it, path.stem) == node_id),
                None,
            )
            if target is None:
                continue
            candidate = {**target, **fields}
            candidate.setdefault("id", _effective_id(target, path.stem))
            Node.model_validate(candidate)  # бросит при невалидном — файл не трогаем
            target.update(fields)
            path.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            return {"updated": node_id, "file": _rel(path, root)}
        except OSError:
            # Только OSError: пробрасываем ValidationError цели (pydantic v2 ValidationError
            # ⊂ ValueError — ловить ValueError нельзя, иначе валид-ошибка → 404 вместо 422).
            continue

    raise NodeNotFound(node_id)


def create_node(content_dir: Path, data: Dict) -> Dict:
    """Создать новый вопрос (`content/{block}/{id}.md`). id уникален по всему банку.

    Безопасность записи из ввода: slug санитизирован `[a-z0-9-]+`, итоговый путь
    обязан лежать внутри `content/{block}/`, поля валидируются через `Node`.
    """
    root = content_dir.resolve()
    block = data["block"]  # валидируется Literal в роуте
    base = _slugify(data.get("topic") or data.get("title") or block)
    taken = {n.id for n in load_content(root)[0]}
    node_id = _unique_id(base, taken)

    block_dir = (root / block).resolve()
    path = (block_dir / f"{node_id}.md").resolve()
    if not str(path).startswith(str(block_dir) + "/"):
        raise ValueError(f"refusing to write outside content/{block}/: {path}")

    node = Node.model_validate({**data, "id": node_id})  # бросит при невалидном
    block_dir.mkdir(parents=True, exist_ok=True)
    _write_md(path, node)
    return {"id": node_id, "file": _rel(path, root)}
