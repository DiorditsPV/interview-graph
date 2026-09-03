"""Персистентность в SQLite: тенанты, банк вопросов (nodes), сессии и оценки.

Вопросы — источник правды в БД (а не в content/*.md): UI создаёт/правит/грузит их в
рантайме, и они должны переживать деплой (который перезаписывает код, но не БД из
INTERVIEW_DB_PATH). content/*.md остаются сидом при первом старте (см. seed.py).

Все доменные таблицы несут `tenant_id` (сейчас всегда 'default') — схема tenant-ready:
переход на мультитенант не требует миграции структуры (см. tenancy.py).
"""

from __future__ import annotations

import json
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional

# TTL сессии аутентификации: время жизни server-side auth-session и max_age cookie (см. main.py).
SESSION_MAX_AGE = 30 * 24 * 3600  # 30 дней, секунды

_SCHEMA = """
CREATE TABLE IF NOT EXISTS tenants (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS nodes (
    tenant_id    TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
    pool         TEXT NOT NULL DEFAULT 'data-engineer',  -- id пула (content/<pool>/)
    id           TEXT NOT NULL,
    kind         TEXT NOT NULL DEFAULT 'question',
    block        TEXT NOT NULL,
    subblock     TEXT,
    topic        TEXT NOT NULL,
    title        TEXT,
    difficulty   TEXT NOT NULL DEFAULT 'middle',
    weight       INTEGER NOT NULL DEFAULT 1,
    question     TEXT NOT NULL,
    answer       TEXT NOT NULL DEFAULT '',
    starter_code TEXT,
    rubric       TEXT NOT NULL DEFAULT '[]',
    tags         TEXT NOT NULL DEFAULT '[]',
    source       TEXT NOT NULL DEFAULT 'seed',
    hidden       INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    PRIMARY KEY (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS pools (
    tenant_id   TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
    id          TEXT NOT NULL,                 -- = content/<pool>/ у сидов; slug из названия у UI-созданных
    label       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    blocks      TEXT NOT NULL,                 -- JSON: [{id,label,color,weight,subblocks:[{id,label}]}]
    source      TEXT NOT NULL DEFAULT 'seed',  -- seed | user
    deleted_at  TEXT,                          -- tombstone: сид не воскрешает, id остаётся занятым
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS users (
    tenant_id     TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
    id            TEXT NOT NULL,                -- генерится сервером (token_hex); TEXT — под шов interviewers.user_id
    email         TEXT NOT NULL,
    password_hash TEXT NOT NULL,                -- bcrypt; пароль в открытом виде не хранится
    role          TEXT NOT NULL DEFAULT 'member', -- owner | member | viewer
    created_at    TEXT NOT NULL,
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, email)
);
CREATE TABLE IF NOT EXISTS auth_sessions (
    token      TEXT PRIMARY KEY,                -- значение HttpOnly-cookie (server-side session)
    tenant_id  TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS interviewers (
    tenant_id   TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
    id          INTEGER NOT NULL,            -- автоинкремент в пределах тенанта, уник. (tenant_id,id)
    name        TEXT NOT NULL,
    email       TEXT,
    role        TEXT,                         -- напр. «Tech Lead», «HR»
    user_id     TEXT,                         -- ШОВ: связь с auth-пользователем (пока NULL)
    created_at  TEXT NOT NULL,
    PRIMARY KEY (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS candidates (
    tenant_id   TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
    id          INTEGER NOT NULL,
    name        TEXT NOT NULL,
    position    TEXT,                         -- на какую позицию
    seniority   TEXT,                         -- грейд (junior/middle/senior/…) — НЕ difficulty вопроса
    contact     TEXT,                         -- email/телефон/ссылка (свободно)
    note        TEXT,                         -- заметка рекрутера
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate  TEXT NOT NULL,
    created_at TEXT NOT NULL,
    pool       TEXT NOT NULL DEFAULT 'data-engineer'
);
CREATE TABLE IF NOT EXISTS scores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    node_id    TEXT NOT NULL,
    score      INTEGER NOT NULL,
    note       TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(session_id, node_id)
);
"""

# rubric/tags хранятся в БД JSON-строками (паттерн SQLite без доп. таблиц).
_NODE_JSON_FIELDS = ("rubric", "tags")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _row_to_node(row: sqlite3.Row) -> Dict:
    """Строка БД → dict ноды (JSON-поля десериализуются, starterCode через alias)."""
    d = dict(row)
    for f in _NODE_JSON_FIELDS:
        d[f] = json.loads(d.get(f) or "[]")
    d["hidden"] = bool(d.get("hidden"))
    # models.Node принимает starter_code по alias starterCode; отдаём snake_case как есть.
    return d


def _row_to_pool(row: sqlite3.Row) -> Dict:
    """Строка pools → dict направления: blocks из JSON в список."""
    d = dict(row)
    d["blocks"] = json.loads(d.get("blocks") or "[]")
    return d


class Database:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as conn:
            conn.executescript(_SCHEMA)
            self._migrate_sessions(conn)
            self._migrate_nodes(conn)

    @staticmethod
    def _migrate_sessions(conn: sqlite3.Connection) -> None:
        """Мягкая миграция существующей БД: добавить новые столбцы в sessions, если их нет.

        Старые БД содержат sessions только с (id, candidate, created_at). Новые столбцы —
        nullable (или с DEFAULT), поэтому ALTER ... ADD COLUMN безопасен и не теряет данные:
        старые строки получают NULL/'default'. PRAGMA table_info защищает от повторного ALTER
        (идемпотентность при каждом старте).
        """
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(sessions)").fetchall()}
        # tenant_id без DEFAULT в ALTER → NOT NULL невозможен на готовых строках; даём DEFAULT.
        if "tenant_id" not in cols:
            conn.execute(
                "ALTER TABLE sessions ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'"
            )
        if "candidate_id" not in cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN candidate_id INTEGER")
        if "interviewer_id" not in cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN interviewer_id INTEGER")
        if "pool" not in cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN pool TEXT NOT NULL DEFAULT 'data-engineer'")
        if "plan" not in cols:
            # План интервью (JSON: mode, blocks, subblocks, difficulties, count, order). NULL — сессия
            # по всей матрице, как до v1-closure.
            conn.execute("ALTER TABLE sessions ADD COLUMN plan TEXT")
        if "status" not in cols:
            # Итог сессии: active → finished с решением (hire | no_hire | hold) и комментарием.
            conn.execute("ALTER TABLE sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
            conn.execute("ALTER TABLE sessions ADD COLUMN decision TEXT")
            conn.execute("ALTER TABLE sessions ADD COLUMN summary TEXT")
            conn.execute("ALTER TABLE sessions ADD COLUMN finished_at TEXT")

    @staticmethod
    def _migrate_nodes(conn: sqlite3.Connection) -> None:
        """Пулы направлений: столбец nodes.pool. Старые строки — бывший единственный банк,
        то есть 'data-engineer'. Индекс создаём здесь, а не в _SCHEMA: на старой БД столбца
        ещё нет в момент executescript."""
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(nodes)").fetchall()}
        if "pool" not in cols:
            conn.execute("ALTER TABLE nodes ADD COLUMN pool TEXT NOT NULL DEFAULT 'data-engineer'")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_nodes_tenant_pool ON nodes(tenant_id, pool)")

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    # --- tenants ---
    def ensure_tenant(self, tenant_id: str, name: Optional[str] = None) -> None:
        """Создать тенанта, если его ещё нет (идемпотентно)."""
        with self._conn() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO tenants (id, name, created_at) VALUES (?, ?, ?)",
                (tenant_id, name or tenant_id, _now()),
            )

    # --- users (auth, per-tenant) ---
    def count_users(self, tenant_id: str) -> int:
        with self._conn() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM users WHERE tenant_id = ?", (tenant_id,)
            ).fetchone()[0]

    def list_users(self, tenant_id: str) -> List[Dict]:
        """Пользователи тенанта без password_hash (хеш наружу не отдаём)."""
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT tenant_id, id, email, role, created_at FROM users "
                "WHERE tenant_id = ? ORDER BY created_at",
                (tenant_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def get_user_by_id(self, tenant_id: str, user_id: str) -> Optional[Dict]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE tenant_id = ? AND id = ?",
                (tenant_id, user_id),
            ).fetchone()
        return dict(row) if row else None

    def get_user_by_email(self, tenant_id: str, email: str) -> Optional[Dict]:
        """Полная строка (с password_hash) — для проверки пароля при логине."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE tenant_id = ? AND email = ?",
                (tenant_id, email),
            ).fetchone()
        return dict(row) if row else None

    def create_user(
        self, tenant_id: str, email: str, password_hash: str, role: str = "member"
    ) -> Dict:
        """Создать пользователя (id — случайный token_hex). Бросает sqlite3.IntegrityError
        при дубликате email в тенанте (UNIQUE(tenant_id, email))."""
        uid = secrets.token_hex(8)
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO users (tenant_id, id, email, password_hash, role, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (tenant_id, uid, email, password_hash, role, _now()),
            )
        return self.get_user_by_id(tenant_id, uid)

    # --- auth sessions (server-side, токен = значение cookie) ---
    def create_auth_session(self, tenant_id: str, user_id: str) -> str:
        token = secrets.token_urlsafe(32)
        with self._conn() as conn:
            # Повторный логин инвалидирует прежние сессии того же пользователя:
            # один активный токен на аккаунт (старые cookie перестают работать).
            conn.execute(
                "DELETE FROM auth_sessions WHERE tenant_id = ? AND user_id = ?",
                (tenant_id, user_id),
            )
            conn.execute(
                "INSERT INTO auth_sessions (token, tenant_id, user_id, created_at) "
                "VALUES (?, ?, ?, ?)",
                (token, tenant_id, user_id, _now()),
            )
        return token

    def get_auth_session(self, token: str) -> Optional[Dict]:
        """Вернуть сессию по токену или None. Протухшую (старше SESSION_MAX_AGE) удалить и вернуть None."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM auth_sessions WHERE token = ?", (token,)
            ).fetchone()
            if row is None:
                return None
            created = datetime.fromisoformat(row["created_at"])
            if datetime.now(timezone.utc) - created > timedelta(seconds=SESSION_MAX_AGE):
                conn.execute("DELETE FROM auth_sessions WHERE token = ?", (token,))
                return None
        return dict(row)

    def delete_auth_session(self, token: str) -> None:
        with self._conn() as conn:
            conn.execute("DELETE FROM auth_sessions WHERE token = ?", (token,))

    # --- nodes (банк вопросов, per-tenant) ---
    def count_nodes(self, tenant_id: str, pool: Optional[str] = None) -> int:
        sql, args = "SELECT COUNT(*) FROM nodes WHERE tenant_id = ?", [tenant_id]
        if pool is not None:
            sql += " AND pool = ?"
            args.append(pool)
        with self._conn() as conn:
            return conn.execute(sql, args).fetchone()[0]

    def list_nodes(self, tenant_id: str, pool: Optional[str] = None, include_hidden: bool = True) -> List[Dict]:
        sql, args = "SELECT * FROM nodes WHERE tenant_id = ?", [tenant_id]
        if pool is not None:
            sql += " AND pool = ?"
            args.append(pool)
        if not include_hidden:
            sql += " AND hidden = 0"
        sql += " ORDER BY block, subblock, id"
        with self._conn() as conn:
            rows = conn.execute(sql, args).fetchall()
        return [_row_to_node(r) for r in rows]

    def get_node(self, tenant_id: str, node_id: str) -> Optional[Dict]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM nodes WHERE tenant_id = ? AND id = ?",
                (tenant_id, node_id),
            ).fetchone()
        return _row_to_node(row) if row else None

    def upsert_node(self, tenant_id: str, node: Dict, source: str = "user") -> Dict:
        """Создать/обновить ноду. `node` — dict из models.Node (rubric/tags = списки)."""
        now = _now()
        rubric = json.dumps(node.get("rubric") or [], ensure_ascii=False)
        tags = json.dumps(node.get("tags") or [], ensure_ascii=False)
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO nodes (
                    tenant_id, id, pool, kind, block, subblock, topic, title, difficulty,
                    weight, question, answer, starter_code, rubric, tags, source,
                    hidden, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(tenant_id, id) DO UPDATE SET
                    pool=excluded.pool,
                    kind=excluded.kind, block=excluded.block, subblock=excluded.subblock,
                    topic=excluded.topic, title=excluded.title, difficulty=excluded.difficulty,
                    weight=excluded.weight, question=excluded.question, answer=excluded.answer,
                    starter_code=excluded.starter_code, rubric=excluded.rubric,
                    tags=excluded.tags, updated_at=excluded.updated_at
                """,
                (
                    tenant_id, node["id"], node.get("pool", "data-engineer"),
                    node.get("kind", "question"), node["block"],
                    node.get("subblock"), node["topic"], node.get("title"),
                    node.get("difficulty", "middle"), int(node.get("weight", 1)),
                    node["question"], node.get("answer", ""), node.get("starter_code"),
                    rubric, tags, source, int(bool(node.get("hidden", False))), now, now,
                ),
            )
        return self.get_node(tenant_id, node["id"])

    def delete_node(self, tenant_id: str, node_id: str) -> bool:
        with self._conn() as conn:
            cur = conn.execute(
                "DELETE FROM nodes WHERE tenant_id = ? AND id = ?", (tenant_id, node_id)
            )
        return cur.rowcount > 0

    def set_node_hidden(self, tenant_id: str, node_id: str, hidden: bool) -> Optional[Dict]:
        with self._conn() as conn:
            conn.execute(
                "UPDATE nodes SET hidden = ?, updated_at = ? WHERE tenant_id = ? AND id = ?",
                (int(hidden), _now(), tenant_id, node_id),
            )
        return self.get_node(tenant_id, node_id)

    def seed_nodes(self, tenant_id: str, nodes: List[Dict]) -> int:
        """Залить ноды как сид (source='seed'), не перетирая существующие.

        INSERT OR IGNORE по (tenant_id, id): повторный вызов идемпотентен и не трогает
        пользовательские правки. Возвращает число фактически вставленных нод.
        """
        now = _now()
        inserted = 0
        with self._conn() as conn:
            for node in nodes:
                cur = conn.execute(
                    """
                    INSERT OR IGNORE INTO nodes (
                        tenant_id, id, pool, kind, block, subblock, topic, title, difficulty,
                        weight, question, answer, starter_code, rubric, tags, source,
                        hidden, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', 0, ?, ?)
                    """,
                    (
                        tenant_id, node["id"], node.get("pool", "data-engineer"),
                        node.get("kind", "question"), node["block"],
                        node.get("subblock"), node["topic"], node.get("title"),
                        node.get("difficulty", "middle"), int(node.get("weight", 1)),
                        node["question"], node.get("answer", ""), node.get("starter_code"),
                        json.dumps(node.get("rubric") or [], ensure_ascii=False),
                        json.dumps(node.get("tags") or [], ensure_ascii=False),
                        now, now,
                    ),
                )
                inserted += cur.rowcount
        return inserted

    # --- pools (направления: сид из content/<pool>/pool.yaml, CRUD из UI; per-tenant) ---
    def list_pools(self, tenant_id: str) -> List[Dict]:
        """Живые направления в порядке создания (сиды идут в порядке каталогов content/)."""
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM pools WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY rowid",
                (tenant_id,),
            ).fetchall()
        return [_row_to_pool(r) for r in rows]

    def get_pool(self, tenant_id: str, pool_id: str) -> Optional[Dict]:
        """Направление по id, включая tombstone (deleted_at не None) — для проверки занятости id."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM pools WHERE tenant_id = ? AND id = ?", (tenant_id, pool_id)
            ).fetchone()
        return _row_to_pool(row) if row else None

    def upsert_pool_seed(self, tenant_id: str, pool: Dict) -> bool:
        """Сид конфига направления: INSERT OR IGNORE — правки из UI и tombstone переживают рестарт.

        `pool` — {id, label, description, blocks: list}. Возвращает True, если строка вставлена.
        """
        now = _now()
        with self._conn() as conn:
            cur = conn.execute(
                """
                INSERT OR IGNORE INTO pools (
                    tenant_id, id, label, description, blocks, source, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'seed', ?, ?)
                """,
                (
                    tenant_id, pool["id"], pool["label"], pool.get("description") or "",
                    json.dumps(pool["blocks"], ensure_ascii=False), now, now,
                ),
            )
        return cur.rowcount == 1

    def create_pool(
        self,
        tenant_id: str,
        pool_id: str,
        label: str,
        description: str,
        blocks: List[Dict],
        copy_from: Optional[str] = None,
    ) -> Dict:
        """Направление из UI (source='user'); с copy_from — ещё и копия его вопросов.

        Строка пула и копии нод пишутся одной транзакцией: падение посередине (в том числе
        коллизия id ноды) откатывает всё, «пула-сироты» без вопросов не остаётся.
        Занятость id пула проверяет вызывающий (get_pool).
        """
        now = _now()
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO pools (
                    tenant_id, id, label, description, blocks, source, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'user', ?, ?)
                """,
                (tenant_id, pool_id, label, description, json.dumps(blocks, ensure_ascii=False), now, now),
            )
            if copy_from is not None:
                self._copy_nodes(conn, tenant_id, copy_from, pool_id, now)
        return self.get_pool(tenant_id, pool_id)

    def update_pool(self, tenant_id: str, pool_id: str, fields: Dict) -> Optional[Dict]:
        """Правка названия/описания/колонок (остальные ключи игнорируются). None — нет или удалено.

        `blocks` — уже валидированный список dict (см. pools.normalize_blocks + parse_blocks).
        Смена колонок и её последствия для вопросов — одна транзакция: вопросы исчезнувших колонок
        удаляются, вопросы исчезнувших под-колонок остаются в колонке без под-колонки.
        """
        current = self.get_pool(tenant_id, pool_id)
        if current is None or current["deleted_at"] is not None:
            return None
        allowed = {k: v for k, v in fields.items() if k in ("label", "description")}
        blocks = fields.get("blocks")
        if not allowed and blocks is None:
            return current
        now = _now()
        with self._conn() as conn:
            if allowed:
                sets = ", ".join(f"{k} = ?" for k in allowed)
                conn.execute(
                    f"UPDATE pools SET {sets}, updated_at = ? WHERE tenant_id = ? AND id = ?",
                    (*allowed.values(), now, tenant_id, pool_id),
                )
            if blocks is not None:
                conn.execute(
                    "UPDATE pools SET blocks = ?, updated_at = ? WHERE tenant_id = ? AND id = ?",
                    (json.dumps(blocks, ensure_ascii=False), now, tenant_id, pool_id),
                )
                kept = [b["id"] for b in blocks]
                if not kept:  # `NOT IN ()` удалил бы все вопросы; непустоту гарантирует parse_blocks у вызывающего
                    raise ValueError("blocks must not be empty")
                marks = ",".join("?" * len(kept))
                conn.execute(
                    f"DELETE FROM nodes WHERE tenant_id = ? AND pool = ? AND block NOT IN ({marks})",
                    (tenant_id, pool_id, *kept),
                )
                for b in blocks:
                    subs = [s["id"] for s in b.get("subblocks") or []]
                    sub_marks = ",".join("?" * len(subs))
                    cond = f"AND subblock NOT IN ({sub_marks})" if subs else ""
                    conn.execute(
                        f"UPDATE nodes SET subblock = NULL, updated_at = ? WHERE tenant_id = ? AND pool = ? "
                        f"AND block = ? AND subblock IS NOT NULL {cond}",
                        (now, tenant_id, pool_id, b["id"], *subs),
                    )
        return self.get_pool(tenant_id, pool_id)

    def delete_pool(self, tenant_id: str, pool_id: str) -> Optional[int]:
        """Удалить направление: вопросы стираются, строка остаётся tombstone'ом (сессии не трогаем —
        история интервью). Возвращает число удалённых нод; None — нет или уже удалено."""
        current = self.get_pool(tenant_id, pool_id)
        if current is None or current["deleted_at"] is not None:
            return None
        now = _now()
        with self._conn() as conn:
            removed = conn.execute(
                "DELETE FROM nodes WHERE tenant_id = ? AND pool = ?", (tenant_id, pool_id)
            ).rowcount
            conn.execute(
                "UPDATE pools SET deleted_at = ?, updated_at = ? WHERE tenant_id = ? AND id = ?",
                (now, now, tenant_id, pool_id),
            )
        return removed

    def copy_nodes(self, tenant_id: str, src_pool: str, dst_pool: str) -> int:
        """Скопировать все ноды src в dst (пресет → новое направление) одной транзакцией.

        Возвращает число скопированных. Коллизия id (`<dst>-<id>` уже занят чужой нодой) —
        sqlite3.IntegrityError, ничего не копируется.
        """
        with self._conn() as conn:
            return self._copy_nodes(conn, tenant_id, src_pool, dst_pool, _now())

    @staticmethod
    def _copy_nodes(
        conn: sqlite3.Connection, tenant_id: str, src_pool: str, dst_pool: str, now: str
    ) -> int:
        """Копии нод внутри открытой транзакции: id с префиксом dst, source='user', hidden=0.

        Обычный INSERT (не upsert): чужая нода с таким же id не перетирается молча — ошибка
        целостности откатывает транзакцию целиком.
        """
        rows = conn.execute(
            "SELECT * FROM nodes WHERE tenant_id = ? AND pool = ? ORDER BY rowid", (tenant_id, src_pool)
        ).fetchall()
        for r in rows:
            conn.execute(
                """
                INSERT INTO nodes (
                    tenant_id, id, pool, kind, block, subblock, topic, title, difficulty,
                    weight, question, answer, starter_code, rubric, tags, source,
                    hidden, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', 0, ?, ?)
                """,
                (
                    tenant_id, f"{dst_pool}-{r['id']}", dst_pool, r["kind"], r["block"], r["subblock"],
                    r["topic"], r["title"], r["difficulty"], r["weight"], r["question"], r["answer"],
                    r["starter_code"], r["rubric"], r["tags"], now, now,
                ),
            )
        return len(rows)

    # --- interviewers (per-tenant) ---
    def list_interviewers(self, tenant_id: str) -> List[Dict]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM interviewers WHERE tenant_id = ? ORDER BY id",
                (tenant_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def count_interviewers(self, tenant_id: str) -> int:
        with self._conn() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM interviewers WHERE tenant_id = ?", (tenant_id,)
            ).fetchone()[0]

    def get_interviewer(self, tenant_id: str, interviewer_id: int) -> Optional[Dict]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM interviewers WHERE tenant_id = ? AND id = ?",
                (tenant_id, interviewer_id),
            ).fetchone()
        return dict(row) if row else None

    def create_interviewer(self, tenant_id: str, data: Dict) -> Dict:
        """Создать интервьюера. id — автоинкремент в пределах тенанта (MAX(id)+1)."""
        now = _now()
        with self._conn() as conn:
            nid = conn.execute(
                "SELECT COALESCE(MAX(id), 0) + 1 FROM interviewers WHERE tenant_id = ?",
                (tenant_id,),
            ).fetchone()[0]
            conn.execute(
                """
                INSERT INTO interviewers (tenant_id, id, name, email, role, user_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    tenant_id, nid, data["name"], data.get("email"),
                    data.get("role"), data.get("user_id"), now,
                ),
            )
        return self.get_interviewer(tenant_id, nid)

    # --- candidates (per-tenant) ---
    def list_candidates(self, tenant_id: str) -> List[Dict]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM candidates WHERE tenant_id = ? ORDER BY id",
                (tenant_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def get_candidate(self, tenant_id: str, candidate_id: int) -> Optional[Dict]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM candidates WHERE tenant_id = ? AND id = ?",
                (tenant_id, candidate_id),
            ).fetchone()
        return dict(row) if row else None

    def create_candidate(self, tenant_id: str, data: Dict) -> Dict:
        """Создать кандидата. id — автоинкремент в пределах тенанта (MAX(id)+1)."""
        now = _now()
        with self._conn() as conn:
            cid = conn.execute(
                "SELECT COALESCE(MAX(id), 0) + 1 FROM candidates WHERE tenant_id = ?",
                (tenant_id,),
            ).fetchone()[0]
            conn.execute(
                """
                INSERT INTO candidates (
                    tenant_id, id, name, position, seniority, contact, note,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    tenant_id, cid, data["name"], data.get("position"),
                    data.get("seniority"), data.get("contact"), data.get("note"),
                    now, now,
                ),
            )
        return self.get_candidate(tenant_id, cid)

    def update_candidate(self, tenant_id: str, candidate_id: int, fields: Dict) -> Optional[Dict]:
        """Обновить переданные поля кандидата (None-поля не передаются вызывающим)."""
        allowed = ("name", "position", "seniority", "contact", "note")
        sets = {k: v for k, v in fields.items() if k in allowed}
        if not sets:
            return self.get_candidate(tenant_id, candidate_id)
        cols = ", ".join(f"{k} = ?" for k in sets)
        params = list(sets.values()) + [_now(), tenant_id, candidate_id]
        with self._conn() as conn:
            cur = conn.execute(
                f"UPDATE candidates SET {cols}, updated_at = ? WHERE tenant_id = ? AND id = ?",
                params,
            )
            if cur.rowcount == 0:
                return None
        return self.get_candidate(tenant_id, candidate_id)

    # --- sessions ---
    def create_session(
        self,
        candidate: str,
        tenant_id: str = "default",
        candidate_id: Optional[int] = None,
        interviewer_id: Optional[int] = None,
        pool: str = "data-engineer",
        plan: Optional[Dict] = None,
    ) -> Dict:
        with self._conn() as conn:
            cur = conn.execute(
                """
                INSERT INTO sessions (candidate, tenant_id, candidate_id, interviewer_id, pool, plan, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (candidate, tenant_id, candidate_id, interviewer_id, pool,
                 json.dumps(plan, ensure_ascii=False) if plan else None, _now()),
            )
            sid = cur.lastrowid
        return self.get_session(sid, tenant_id)

    def finish_session(
        self, session_id: int, tenant_id: str, decision: str, summary: str
    ) -> Optional[Dict]:
        """Завершить сессию с итогом; повторный вызов правит решение/комментарий. None — нет сессии."""
        with self._conn() as conn:
            cur = conn.execute(
                """
                UPDATE sessions SET status = 'finished', decision = ?, summary = ?,
                    finished_at = COALESCE(finished_at, ?)
                WHERE id = ? AND tenant_id = ?
                """,
                (decision, summary, _now(), session_id, tenant_id),
            )
            if cur.rowcount == 0:
                return None
        return self.get_session(session_id, tenant_id)

    @staticmethod
    def _session_summary(row: sqlite3.Row) -> Dict:
        """Строка sessions для списков: вместо JSON плана — его размер (plan_count, NULL без плана)."""
        d = dict(row)
        raw = d.pop("plan", None)
        d["plan_count"] = len(json.loads(raw).get("order") or []) if raw else None
        return d

    def sessions_by_candidate(self, tenant_id: str, candidate_id: int) -> List[Dict]:
        """Все сессии кандидата в тенанте (история), без оценок — для списка."""
        with self._conn() as conn:
            rows = conn.execute(
                """
                SELECT * FROM sessions
                WHERE tenant_id = ? AND candidate_id = ?
                ORDER BY created_at DESC
                """,
                (tenant_id, candidate_id),
            ).fetchall()
        return [self._session_summary(r) for r in rows]

    def list_sessions(self, tenant_id: str, pool: Optional[str] = None) -> List[Dict]:
        sql, args = "SELECT * FROM sessions WHERE tenant_id = ?", [tenant_id]
        if pool is not None:
            sql += " AND pool = ?"
            args.append(pool)
        sql += " ORDER BY created_at DESC"
        with self._conn() as conn:
            rows = conn.execute(sql, args).fetchall()
        return [self._session_summary(r) for r in rows]

    def count_sessions(self, tenant_id: str, pool: str) -> int:
        with self._conn() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM sessions WHERE tenant_id = ? AND pool = ?", (tenant_id, pool)
            ).fetchone()[0]

    def get_session(self, session_id: int, tenant_id: str) -> Optional[Dict]:
        """Сессия по id в пределах тенанта (изоляция: чужой тенант → None)."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM sessions WHERE id = ? AND tenant_id = ?",
                (session_id, tenant_id),
            ).fetchone()
            if row is None:
                return None
            scores = conn.execute(
                "SELECT node_id, score, note, created_at FROM scores WHERE session_id = ?",
                (session_id,),
            ).fetchall()
        result = dict(row)
        result["plan"] = json.loads(result["plan"]) if result.get("plan") else None
        result["scores"] = {s["node_id"]: dict(s) for s in scores}
        return result

    # --- scores ---
    def set_score(
        self,
        session_id: int,
        node_id: str,
        score: int,
        note: Optional[str] = None,
        *,
        tenant_id: str,
    ) -> Dict:
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO scores (session_id, node_id, score, note, created_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(session_id, node_id)
                DO UPDATE SET score = excluded.score,
                              note = excluded.note,
                              created_at = excluded.created_at
                """,
                (session_id, node_id, score, note, _now()),
            )
        return self.get_session(session_id, tenant_id)
