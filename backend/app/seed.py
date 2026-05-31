"""Сид банка вопросов из content/*.md в БД при первом старте.

Источник правды для вопросов — БД. content/*.md остаются в git как стартовый набор:
при пустой таблице nodes (для тенанта) они загружаются тем же импортёром и пишутся в БД.
Идемпотентно: при непустой таблице повторный сид ничего не перетирает.
"""

from __future__ import annotations

from pathlib import Path
from typing import Tuple

from .db import Database
from .importer import load_content


def seed_tenant_if_empty(db: Database, tenant_id: str, content_dir: Path) -> Tuple[int, list]:
    """Если у тенанта нет нод — залить их из content_dir. Вернуть (вставлено, ошибки импорта).

    При непустой таблице возвращает (0, []) — сид не выполняется (не трогаем пользовательские данные).
    """
    db.ensure_tenant(tenant_id)
    if db.count_nodes(tenant_id) > 0:
        return 0, []
    nodes, errors = load_content(content_dir)
    rows = [n.model_dump() for n in nodes]
    inserted = db.seed_nodes(tenant_id, rows)
    return inserted, errors


def seed_interviewer_if_empty(db: Database, tenant_id: str) -> int:
    """Сид одного интервьюера по умолчанию («Я») при пустой таблице interviewers тенанта.

    Без auth у сессии всё равно должен быть проводивший: дефолтный интервьюер
    преселектится в UI. Идемпотентно: при непустой таблице ничего не делает.
    """
    db.ensure_tenant(tenant_id)
    if db.count_interviewers(tenant_id) > 0:
        return 0
    db.create_interviewer(tenant_id, {"name": "Я", "role": "Ведущий"})
    return 1
