"""Сид банка вопросов из content/*.md в БД при первом старте.

Источник правды для вопросов — БД. content/*.md остаются в git как стартовый набор:
при пустой таблице nodes (для тенанта) они загружаются тем же импортёром и пишутся в БД.
Идемпотентно: при непустой таблице повторный сид ничего не перетирает.
"""

from __future__ import annotations

import json
from typing import Tuple

from .auth import hash_password
from .db import Database
from .importer import load_pool_content
from .pools import PoolCfg, blocks_to_json


def seed_pool_if_empty(db: Database, tenant_id: str, pool: PoolCfg) -> Tuple[int, list]:
    """Сид направления: конфиг (pool.yaml → таблица pools) и, если нод пула нет, его ноды.

    Конфиг — INSERT OR IGNORE: правки названия/описания из UI и tombstone удалённого
    направления переживают рестарт; удалённое направление не воскрешается и не пересеивается.
    Ноды — по count_nodes(tenant, pool): полный пул не трогается, пустой — засеивается.
    Так после миграции старой БД (все ноды → 'data-engineer') DE не пересеивается,
    а новый пул засеивается при первом старте. Возвращает (вставлено, ошибки импорта).
    """
    db.ensure_tenant(tenant_id)
    db.upsert_pool_seed(
        tenant_id,
        {"id": pool.id, "label": pool.label, "description": pool.description,
         "blocks": json.loads(blocks_to_json(pool.blocks))},
    )
    existing = db.get_pool(tenant_id, pool.id)
    if existing is not None and existing["deleted_at"] is not None:
        return 0, []
    if db.count_nodes(tenant_id, pool=pool.id) > 0:
        return 0, []
    nodes, errors = load_pool_content(pool)
    inserted = db.seed_nodes(tenant_id, [n.model_dump() for n in nodes])
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


def seed_owner_if_empty(db: Database, tenant_id: str, email: str, password: str) -> int:
    """Сид первого owner-пользователя при пустой таблице users тенанта.

    Без этого после включения auth никто не сможет войти (нет аккаунтов) — owner
    нужен, чтобы залогиниться и завести коллег. Креды берутся из env (см. main.py).
    Идемпотентно: при непустой таблице ничего не делает.
    """
    db.ensure_tenant(tenant_id)
    if db.count_users(tenant_id) > 0:
        return 0
    db.create_user(tenant_id, email, hash_password(password), role="owner")
    return 1
