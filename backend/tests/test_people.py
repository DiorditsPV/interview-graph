"""Тесты сущностей людей (people-schema): кандидаты, интервьюеры, изоляция тенантов,
ссылки сессий на людей и мягкая миграция старых БД.

API-тесты используют общий module-level app/db (паттерн _client из test_app/test_nodes).
DAL-тесты создают изолированные временные БД (tmp_path) — это нужно для проверки
tenant-изоляции и миграции старой схемы, не затрагивая общий app.db.
"""

import sqlite3

from fastapi.testclient import TestClient

from app.db import Database


def _client() -> TestClient:
    from app.main import OWNER_EMAIL, OWNER_PASSWORD, app

    c = TestClient(app)
    # auth-identity (#36): логинимся owner'ом — ручки гейтятся.
    c.post("/api/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    return c


# --- API: CRUD кандидатов ---
def test_candidate_crud_via_api():
    c = _client()
    created = c.post(
        "/api/candidates",
        json={"name": "Иван Кандидатов", "position": "Backend", "seniority": "middle"},
    ).json()
    cid = created["id"]
    assert created["name"] == "Иван Кандидатов"
    assert created["position"] == "Backend"
    assert created["tenant_id"] == "default"

    listed = c.get("/api/candidates").json()
    assert any(x["id"] == cid and x["name"] == "Иван Кандидатов" for x in listed)

    updated = c.put(f"/api/candidates/{cid}", json={"seniority": "senior", "note": "ок"}).json()
    assert updated["seniority"] == "senior"
    assert updated["note"] == "ок"
    assert updated["name"] == "Иван Кандидатов"  # не затёрто

    miss = c.put("/api/candidates/999999", json={"note": "x"})
    assert miss.status_code == 404


# --- API: интервьюеры ---
def test_interviewer_create_and_list_via_api():
    c = _client()
    # Дефолтный интервьюер засеян при старте.
    before = c.get("/api/interviewers").json()
    assert any(x["name"] == "Я" for x in before), "default interviewer should be seeded"

    created = c.post("/api/interviewers", json={"name": "Тех Лид", "role": "Tech Lead"}).json()
    assert created["name"] == "Тех Лид"
    assert created["tenant_id"] == "default"
    assert created["user_id"] is None  # auth-шов пока пуст

    listed = c.get("/api/interviewers").json()
    assert any(x["id"] == created["id"] for x in listed)


# --- API: сессия со ссылками на людей ---
def test_session_persists_people_refs_via_api():
    c = _client()
    cand = c.post("/api/candidates", json={"name": "Сессионный"}).json()
    interviewers = c.get("/api/interviewers").json()
    iid = interviewers[0]["id"]

    sess = c.post(
        "/api/sessions",
        json={"candidate": "ignored-name", "candidateId": cand["id"], "interviewerId": iid},
    ).json()
    sid = sess["id"]
    assert sess["candidate_id"] == cand["id"]
    assert sess["interviewer_id"] == iid
    # Имя денормализовано из карточки кандидата, а не из переданного candidate-текста.
    assert sess["candidate"] == "Сессионный"

    detail = c.get(f"/api/sessions/{sid}").json()
    assert detail["candidate_id"] == cand["id"]


def test_session_backward_compat_free_text_via_api():
    """Сессия по старому контракту (только candidate-текст) по-прежнему создаётся."""
    c = _client()
    sess = c.post("/api/sessions", json={"candidate": "Свободный Текст"}).json()
    assert sess["candidate"] == "Свободный Текст"
    assert sess["candidate_id"] is None
    assert sess["interviewer_id"] is None


def test_session_unknown_candidate_404():
    c = _client()
    r = c.post("/api/sessions", json={"candidate": "x", "candidateId": 999999})
    assert r.status_code == 404


# --- DAL: tenant-изоляция ---
def test_tenant_isolation_candidates(tmp_path):
    db = Database(tmp_path / "iso.db")
    db.ensure_tenant("A")
    db.ensure_tenant("default")
    a_cand = db.create_candidate("A", {"name": "Только-в-A"})

    # Под 'default' кандидата тенанта A не видно.
    default_list = db.list_candidates("default")
    assert all(x["name"] != "Только-в-A" for x in default_list)
    assert db.get_candidate("default", a_cand["id"]) is None
    # А под своим тенантом — виден.
    assert db.get_candidate("A", a_cand["id"])["name"] == "Только-в-A"


def test_tenant_isolation_interviewers(tmp_path):
    db = Database(tmp_path / "iso2.db")
    db.ensure_tenant("A")
    db.ensure_tenant("default")
    db.create_interviewer("A", {"name": "Интервьюер-A"})
    assert db.list_interviewers("default") == []
    assert len(db.list_interviewers("A")) == 1


def test_per_tenant_autoincrement_ids(tmp_path):
    """id кандидатов автоинкрементятся независимо в пределах каждого тенанта."""
    db = Database(tmp_path / "ids.db")
    db.ensure_tenant("A")
    db.ensure_tenant("B")
    a1 = db.create_candidate("A", {"name": "a1"})
    b1 = db.create_candidate("B", {"name": "b1"})
    a2 = db.create_candidate("A", {"name": "a2"})
    assert a1["id"] == 1 and b1["id"] == 1 and a2["id"] == 2


# --- DAL: сессии по кандидату ---
def test_sessions_by_candidate(tmp_path):
    db = Database(tmp_path / "sbc.db")
    db.ensure_tenant("default")
    cand = db.create_candidate("default", {"name": "Историк"})
    db.create_session("Историк", tenant_id="default", candidate_id=cand["id"])
    db.create_session("Историк", tenant_id="default", candidate_id=cand["id"])
    db.create_session("Другой", tenant_id="default")  # без candidate_id

    hist = db.sessions_by_candidate("default", cand["id"])
    assert len(hist) == 2
    assert all(s["candidate_id"] == cand["id"] for s in hist)


def test_update_candidate_dal(tmp_path):
    db = Database(tmp_path / "upd.db")
    db.ensure_tenant("default")
    cand = db.create_candidate("default", {"name": "Правимый", "position": "x"})
    updated = db.update_candidate("default", cand["id"], {"position": "y"})
    assert updated["position"] == "y"
    assert updated["name"] == "Правимый"
    assert db.update_candidate("default", 999, {"position": "z"}) is None


# --- Миграция старой БД ---
def test_migration_upgrades_old_sessions_schema(tmp_path):
    """Старая БД с sessions(id, candidate, created_at) апгрейдится без потери данных."""
    path = tmp_path / "old.db"
    # Воспроизводим до-миграционную схему и кладём старую строку.
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE sessions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            candidate  TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        INSERT INTO sessions (candidate, created_at) VALUES ('Старый Кандидат', '2024-01-01T00:00:00');
        """
    )
    conn.commit()
    conn.close()

    # Открытие через Database выполняет миграцию (ALTER ADD COLUMN под guard'ом).
    db = Database(path)
    sess = db.get_session(1, "default")
    assert sess is not None
    assert sess["candidate"] == "Старый Кандидат"
    assert sess["tenant_id"] == "default"  # новый столбец с DEFAULT
    assert sess["candidate_id"] is None
    assert sess["interviewer_id"] is None

    # Повторное открытие идемпотентно (guard PRAGMA не делает повторный ALTER).
    db2 = Database(path)
    assert db2.get_session(1, "default")["candidate"] == "Старый Кандидат"

    # И новые сессии со ссылками работают на мигрированной БД.
    db2.ensure_tenant("default")
    cand = db2.create_candidate("default", {"name": "Новый"})
    new = db2.create_session("Новый", tenant_id="default", candidate_id=cand["id"])
    assert new["candidate_id"] == cand["id"]


def test_migration_adds_pool_to_old_nodes_and_sessions(tmp_path):
    """БД без столбца pool апгрейдится: старые ноды и сессии получают 'data-engineer'."""
    path = tmp_path / "old.db"
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
        INSERT INTO tenants VALUES ('default', 'default', '2024-01-01T00:00:00');
        CREATE TABLE nodes (
            tenant_id TEXT NOT NULL DEFAULT 'default', id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'question',
            block TEXT NOT NULL, subblock TEXT, topic TEXT NOT NULL, title TEXT,
            difficulty TEXT NOT NULL DEFAULT 'middle', weight INTEGER NOT NULL DEFAULT 1,
            question TEXT NOT NULL, answer TEXT NOT NULL DEFAULT '', starter_code TEXT,
            rubric TEXT NOT NULL DEFAULT '[]', tags TEXT NOT NULL DEFAULT '[]',
            source TEXT NOT NULL DEFAULT 'seed', hidden INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (tenant_id, id)
        );
        INSERT INTO nodes (id, block, topic, question, created_at, updated_at)
            VALUES ('old-01', 'python', 't', 'q', '2024-01-01T00:00:00', '2024-01-01T00:00:00');
        CREATE TABLE sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, candidate TEXT NOT NULL, created_at TEXT NOT NULL,
            tenant_id TEXT NOT NULL DEFAULT 'default', candidate_id INTEGER, interviewer_id INTEGER
        );
        INSERT INTO sessions (candidate, created_at) VALUES ('Старый', '2024-01-01T00:00:00');
        """
    )
    conn.commit()
    conn.close()

    db = Database(path)
    assert db.count_nodes("default") == 1
    assert db.count_nodes("default", pool="data-engineer") == 1
    assert db.count_nodes("default", pool="system-analyst") == 0
    assert db.get_node("default", "old-01")["pool"] == "data-engineer"
    assert db.get_session(1, "default")["pool"] == "data-engineer"
    assert db.list_sessions("default", pool="data-engineer")[0]["candidate"] == "Старый"
    assert db.list_sessions("default", pool="system-analyst") == []
    Database(path)  # повторное открытие идемпотентно
