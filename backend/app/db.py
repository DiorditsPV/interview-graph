"""Персистентность сессий интервью и оценок в SQLite."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

_SCHEMA = """
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


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Database:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as conn:
            conn.executescript(_SCHEMA)

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    # --- sessions ---
    def create_session(self, candidate: str) -> Dict:
        with self._conn() as conn:
            cur = conn.execute(
                "INSERT INTO sessions (candidate, created_at) VALUES (?, ?)",
                (candidate, _now()),
            )
            sid = cur.lastrowid
        return self.get_session(sid)

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
