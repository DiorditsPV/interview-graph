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
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

_SCHEMA = """
CREATE TABLE IF NOT EXISTS tenants (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS nodes (
    tenant_id    TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
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
    created_at TEXT NOT NULL
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


class Database:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as conn:
            conn.executescript(_SCHEMA)
            self._migrate_sessions(conn)

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
            conn.execute(
                "INSERT INTO auth_sessions (token, tenant_id, user_id, created_at) "
                "VALUES (?, ?, ?, ?)",
                (token, tenant_id, user_id, _now()),
            )
        return token

    def get_auth_session(self, token: str) -> Optional[Dict]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM auth_sessions WHERE token = ?", (token,)
            ).fetchone()
        return dict(row) if row else None

    def delete_auth_session(self, token: str) -> None:
        with self._conn() as conn:
            conn.execute("DELETE FROM auth_sessions WHERE token = ?", (token,))

    # --- nodes (банк вопросов, per-tenant) ---
    def count_nodes(self, tenant_id: str) -> int:
        with self._conn() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM nodes WHERE tenant_id = ?", (tenant_id,)
            ).fetchone()[0]

    def list_nodes(self, tenant_id: str, include_hidden: bool = True) -> List[Dict]:
        sql = "SELECT * FROM nodes WHERE tenant_id = ?"
        if not include_hidden:
            sql += " AND hidden = 0"
        sql += " ORDER BY block, subblock, id"
        with self._conn() as conn:
            rows = conn.execute(sql, (tenant_id,)).fetchall()
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
                    tenant_id, id, kind, block, subblock, topic, title, difficulty,
                    weight, question, answer, starter_code, rubric, tags, source,
                    hidden, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(tenant_id, id) DO UPDATE SET
                    kind=excluded.kind, block=excluded.block, subblock=excluded.subblock,
                    topic=excluded.topic, title=excluded.title, difficulty=excluded.difficulty,
                    weight=excluded.weight, question=excluded.question, answer=excluded.answer,
                    starter_code=excluded.starter_code, rubric=excluded.rubric,
                    tags=excluded.tags, updated_at=excluded.updated_at
                """,
                (
                    tenant_id, node["id"], node.get("kind", "question"), node["block"],
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
                        tenant_id, id, kind, block, subblock, topic, title, difficulty,
                        weight, question, answer, starter_code, rubric, tags, source,
                        hidden, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', 0, ?, ?)
                    """,
                    (
                        tenant_id, node["id"], node.get("kind", "question"), node["block"],
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
    ) -> Dict:
        with self._conn() as conn:
            cur = conn.execute(
                """
                INSERT INTO sessions (candidate, tenant_id, candidate_id, interviewer_id, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (candidate, tenant_id, candidate_id, interviewer_id, _now()),
            )
            sid = cur.lastrowid
        return self.get_session(sid)

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
        return [dict(r) for r in rows]

    def list_sessions(self) -> List[Dict]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM sessions ORDER BY created_at DESC"
            ).fetchall()
        return [dict(r) for r in rows]

    def get_session(self, session_id: int) -> Optional[Dict]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
            if row is None:
                return None
            scores = conn.execute(
                "SELECT node_id, score, note, created_at FROM scores WHERE session_id = ?",
                (session_id,),
            ).fetchall()
        result = dict(row)
        result["scores"] = {s["node_id"]: dict(s) for s in scores}
        return result

    # --- scores ---
    def set_score(
        self, session_id: int, node_id: str, score: int, note: Optional[str] = None
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
        return self.get_session(session_id)
