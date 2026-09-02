"""FastAPI-приложение сервиса интервью «граф вопросов».

Запуск:  uvicorn app.main:app --reload  (из каталога backend/)
Конфиг через переменные окружения:
    INTERVIEW_CONTENT_DIR  — каталог с *.md/*.json (по умолч. ../content)
    INTERVIEW_DB_PATH      — путь к SQLite (по умолч. ./interview.db)
    INTERVIEW_FRONTEND_DIR — каталог собранного фронта (по умолч. ../frontend/dist)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
import tempfile
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .auth import (
    COOKIE_NAME,
    current_user,
    hash_password,
    require_member,
    require_owner,
    verify_password,
)
from .db import SESSION_MAX_AGE, Database
from .hub import SessionHub
from .importer import parse_file, validate_against_pool
from .models import Block, Difficulty, GraphResponse, Kind, Node
from .pools import PoolCfg, block_weights, default_pool_id, load_pools
from .sampler import build_interview
from .seed import seed_interviewer_if_empty, seed_owner_if_empty, seed_pool_if_empty
from .tenancy import resolve_tenant

log = logging.getLogger("interview")

BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
PROJECT_DIR = BASE_DIR.parent                              # interview/
CONTENT_DIR = Path(os.environ.get("INTERVIEW_CONTENT_DIR", PROJECT_DIR / "content"))
DB_PATH = Path(os.environ.get("INTERVIEW_DB_PATH", BASE_DIR / "interview.db"))
FRONTEND_DIR = Path(os.environ.get("INTERVIEW_FRONTEND_DIR", PROJECT_DIR / "frontend" / "dist"))
# Креды первого owner-аккаунта для тенанта default (сид при первом старте, см. ниже).
OWNER_EMAIL = os.environ.get("INTERVIEW_OWNER_EMAIL", "owner@interview.local")


def _resolve_owner_password() -> tuple[str, bool]:
    """Пароль owner-аккаунта: из env или случайный.

    Если `INTERVIEW_OWNER_PASSWORD` не задан — НЕ используем известный дефолт (иначе
    публичный логин-барьер бутафорский), а генерим случайный и сигналим, что он
    сгенерирован (залогируется один раз при сиде). Возвращает (пароль, сгенерирован_ли).
    """
    env = os.environ.get("INTERVIEW_OWNER_PASSWORD")
    if env:
        return env, False
    return secrets.token_urlsafe(24), True


OWNER_PASSWORD, _OWNER_PASSWORD_GENERATED = _resolve_owner_password()

app = FastAPI(title="Interview Graph", version="0.1.0")

# CORS для dev-режима Vite (localhost:5173). allow_credentials=True — фронт шлёт session-cookie
# (credentials:'include'); со списком явных origin это валидно (с "*" — нет).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db = Database(DB_PATH)
app.state.db = db  # auth-зависимости берут db отсюда (request.app.state.db)
hub = SessionHub()

# Пулы направлений: content/<pool>/pool.yaml. Читаются при старте; сид — на каждый пул
# отдельно (пустой засеивается из своего каталога, полный не трогается).
POOLS: Dict[str, PoolCfg] = load_pools(CONTENT_DIR)
if not POOLS:
    log.warning("no pools found in %s — /api/pools will be empty", CONTENT_DIR)
for _pool in POOLS.values():
    _seeded, _seed_errors = seed_pool_if_empty(db, resolve_tenant(), _pool)
    if _seeded:
        log.info("seeded %d nodes into pool %s", _seeded, _pool.id)
    if _seed_errors:
        log.warning("content import errors in pool %s: %s", _pool.id, _seed_errors)
# Сид интервьюера по умолчанию («Я») для тенанта default — у сессии всегда есть проводивший.
if seed_interviewer_if_empty(db, resolve_tenant()):
    log.info("seeded default interviewer")
# Сид первого owner-аккаунта для тенанта default — иначе после включения auth некому войти.
if seed_owner_if_empty(db, resolve_tenant(), OWNER_EMAIL, OWNER_PASSWORD):
    log.info("seeded owner account %s", OWNER_EMAIL)
    if _OWNER_PASSWORD_GENERATED:
        # Пароль не задан через env — показываем сгенерированный ОДИН раз, иначе войти нельзя.
        log.warning(
            "INTERVIEW_OWNER_PASSWORD не задан — сгенерирован случайный пароль owner-аккаунта "
            "%s: %s  (задайте INTERVIEW_OWNER_PASSWORD, чтобы управлять им)",
            OWNER_EMAIL,
            OWNER_PASSWORD,
        )


# ---------- request models ----------
class LoginIn(BaseModel):
    email: str = Field(min_length=1)
    password: str = Field(min_length=1)


class UserCreate(BaseModel):
    """Создание пользователя owner'ом: email + пароль + роль."""

    email: str = Field(min_length=3)
    password: str = Field(min_length=6)
    role: str = Field(default="member", pattern="^(owner|member|viewer)$")


class SessionCreate(BaseModel):
    candidate: str = Field(min_length=1)
    candidate_id: Optional[int] = Field(default=None, alias="candidateId")
    interviewer_id: Optional[int] = Field(default=None, alias="interviewerId")
    model_config = {"populate_by_name": True}


class CandidateCreate(BaseModel):
    name: str = Field(min_length=1)
    position: Optional[str] = None
    seniority: Optional[str] = None
    contact: Optional[str] = None
    note: Optional[str] = None


class CandidateUpdate(BaseModel):
    """Правка кандидата — только переданные поля (None = не менять)."""

    name: Optional[str] = Field(default=None, min_length=1)
    position: Optional[str] = None
    seniority: Optional[str] = None
    contact: Optional[str] = None
    note: Optional[str] = None


class InterviewerCreate(BaseModel):
    name: str = Field(min_length=1)
    email: Optional[str] = None
    role: Optional[str] = None


class ScoreIn(BaseModel):
    node_id: str = Field(alias="nodeId")
    score: int = Field(ge=1, le=5)
    note: Optional[str] = None
    model_config = {"populate_by_name": True}


class InterviewRequest(BaseModel):
    count: int = Field(default=20, ge=1, le=200)
    difficulties: Optional[List[str]] = None
    pool: Optional[str] = None
    seed: Optional[int] = None


class ImportFile(BaseModel):
    filename: str = Field(min_length=1)
    content: str


class NodeCreate(BaseModel):
    """Создание вопроса из UI: id генерится сервером, остальное валидируется."""

    block: Block
    topic: str = Field(min_length=1)
    difficulty: Difficulty = "middle"
    kind: Kind = "question"
    title: Optional[str] = None
    question: str = Field(min_length=1)
    answer: str = ""
    tags: List[str] = Field(default_factory=list)


class NodeUpdate(BaseModel):
    """Структурная правка вопроса — только переданные поля (None = не менять)."""

    title: Optional[str] = None
    difficulty: Optional[Difficulty] = None
    question: Optional[str] = None
    answer: Optional[str] = None


# ---------- auth (login / logout / me) ----------
def _public_user(user: dict) -> dict:
    """Поля пользователя наружу — без password_hash."""
    return {
        "id": user["id"],
        "email": user["email"],
        "role": user["role"],
        "tenant_id": user["tenant_id"],
    }


@app.post("/api/auth/login")
def login(body: LoginIn, request: Request, response: Response) -> dict:
    """Проверить email+пароль, выдать server-side сессию в HttpOnly-cookie."""
    tenant = resolve_tenant(request)  # без сессии → default (single-workspace)
    user = db.get_user_by_email(tenant, body.email)
    if user is None or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="invalid credentials")
    token = db.create_auth_session(tenant, user["id"])
    # Без Secure: сервис локальный (http) — Secure-cookie не пересылалась бы по http.
    # max_age = TTL сессии (см. SESSION_MAX_AGE): cookie протухает синхронно с server-side.
    response.set_cookie(
        COOKIE_NAME, token, httponly=True, samesite="lax", path="/", max_age=SESSION_MAX_AGE
    )
    return _public_user(user)


@app.post("/api/auth/logout")
def logout(request: Request, response: Response) -> dict:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        db.delete_auth_session(token)
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@app.get("/api/auth/me")
def auth_me(user: dict = Depends(current_user)) -> dict:
    return _public_user(user)


# ---------- users (управление пользователями — owner) ----------
@app.get("/api/users")
def list_users(request: Request, _owner: dict = Depends(require_owner)) -> list:
    return db.list_users(resolve_tenant(request))


@app.post("/api/users")
def create_user(body: UserCreate, request: Request, _owner: dict = Depends(require_owner)) -> dict:
    """Завести пользователя в тенанте owner'а. 409 при дубликате email."""
    import sqlite3

    tenant = resolve_tenant(request)
    if db.get_user_by_email(tenant, body.email) is not None:
        raise HTTPException(status_code=409, detail="email already exists")
    try:
        user = db.create_user(tenant, body.email, hash_password(body.password), body.role)
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="email already exists")
    return _public_user(user)


# ---------- graph & content ----------
# Поля, которые понимает models.Node (остальные — tenant_id/source/hidden/таймстемпы —
# живут только в БД-слое; Node их не принимает из-за extra="forbid").
_NODE_FIELDS = set(Node.model_fields)


def _pool_or_404(pool_id: Optional[str]) -> PoolCfg:
    """Пул по id; без id — пул по умолчанию (data-engineer или первый по алфавиту)."""
    pid = pool_id or default_pool_id(POOLS)
    if pid is None or pid not in POOLS:
        raise HTTPException(status_code=404, detail=f"pool '{pool_id}' not found")
    return POOLS[pid]


def _db_nodes(request: Request, pool: PoolCfg) -> List[Node]:
    """Ноды пула из БД (источник правды) как объекты Node для текущего тенанта."""
    tenant = resolve_tenant(request)
    return [
        Node.model_validate({k: v for k, v in row.items() if k in _NODE_FIELDS})
        for row in db.list_nodes(tenant, pool=pool.id)
    ]


@app.get("/api/pools")
def get_pools(request: Request, _user: dict = Depends(current_user)) -> list:
    tenant = resolve_tenant(request)
    return [
        {
            **p.to_dict(),
            "counts": {
                "nodes": db.count_nodes(tenant, pool=p.id),
                "sessions": db.count_sessions(tenant, p.id),
            },
        }
        for p in POOLS.values()
    ]


@app.get("/api/graph", response_model=GraphResponse)
def get_graph(
    request: Request, pool: Optional[str] = None, _user: dict = Depends(current_user)
) -> GraphResponse:
    # Вопросы читаются из БД (а не с диска) — рантайм-правки переживают деплой.
    return GraphResponse(nodes=_db_nodes(request, _pool_or_404(pool)), errors=[])


# PR 1: заглушки для старого фронта; удаляются вместе с ним в PR 2.
@app.get("/api/weights")
def get_weights(_user: dict = Depends(current_user)) -> dict:
    return block_weights(_pool_or_404(None))


@app.get("/api/tracks")
def get_tracks(_user: dict = Depends(current_user)) -> list:
    return [{"id": p.id, "label": p.label, "include": []} for p in POOLS.values()]


@app.post("/api/import")
def import_file(body: ImportFile, request: Request, _user: dict = Depends(require_member)) -> dict:
    """Загрузить .md/.json: распарсить тем же импортёром, валидные новые ноды сохранить в БД.

    Пишем в БД (source='user'), а не на диск content/ — иначе деплой (rsync --delete)
    затёр бы загруженные вопросы. БД переживает деплой (INTERVIEW_DB_PATH).
    """
    name = Path(body.filename).name
    ext = Path(name).suffix.lower()
    if ext not in {".md", ".json"}:
        raise HTTPException(status_code=400, detail="only .md or .json files are supported")

    # Парсим во временной директории, сохраняя ОРИГИНАЛЬНОЕ имя: id-less md берёт id из stem.
    from .importer import _fmt_error  # локально — внутренний хелпер форматирования ошибок

    tenant = resolve_tenant(request)
    added: List[dict] = []
    errors: List[dict] = []
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td) / name
        tmp.write_text(body.content, encoding="utf-8")
        try:
            nodes = parse_file(tmp)
        except Exception as exc:  # noqa: BLE001 — любую ошибку парсинга показываем пользователю
            return {"added": [], "errors": [{"file": name, "error": _fmt_error(exc)}]}

    for node in nodes:
        if db.get_node(tenant, node.id) is not None:
            errors.append({"file": name, "error": f"duplicate id '{node.id}' (already in bank)"})
            continue
        saved = db.upsert_node(tenant, node.model_dump(), source="user")
        added.append({
            "id": saved["id"],
            "block": saved["block"],
            "title": saved.get("title") or "",
        })
    return {"added": added, "errors": errors}


# ---------- node CRUD (банк вопросов в БД) ----------
# Источник правды для вопросов — БД (см. db.py/seed.py). CRUD пишет в БД через DAL,
# а НЕ в content/*.md: иначе рантайм-правки затёр бы деплой (rsync --delete content/).
import re  # noqa: E402 — локальный хелпер slug для генерации id новых нод


def _slugify(s: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", s.strip().lower()).strip("-")
    return slug or "q"


def _unique_node_id(tenant: str, base: str) -> str:
    """Сгенерировать свободный id вида `<base>-NN`, уникальный среди нод тенанта."""
    taken = {n["id"] for n in db.list_nodes(tenant)}
    n = 1
    while f"{base}-{n:02d}" in taken:
        n += 1
    return f"{base}-{n:02d}"


@app.post("/api/nodes")
def add_node(body: NodeCreate, request: Request, _user: dict = Depends(require_member)) -> dict:
    """Создать новый вопрос в банке (БД, source='user'). id генерится из topic/title."""
    tenant = resolve_tenant(request)
    base = _slugify(body.topic or body.title or body.block)
    node_id = _unique_node_id(tenant, base)
    # Валидация через Node (extra=forbid, Literal-проверки) до записи.
    node = Node.model_validate({**body.model_dump(), "id": node_id})
    saved = db.upsert_node(tenant, node.model_dump(by_alias=True), source="user")
    return {"id": saved["id"], "block": saved["block"], "title": saved.get("title") or ""}


@app.put("/api/nodes/{node_id}")
def edit_node(
    node_id: str, body: NodeUpdate, request: Request, _user: dict = Depends(require_member)
) -> dict:
    """Обновить структурные поля вопроса. 404 если нет, 422 если результат невалиден."""
    tenant = resolve_tenant(request)
    existing = db.get_node(tenant, node_id)
    if existing is None:
        raise HTTPException(status_code=404, detail=f"node '{node_id}' not found")
    fields = body.model_dump(exclude_none=True)
    merged = {**existing, **fields}
    # existing несёт БД-поля (source/hidden/timestamps), которых нет в Node (extra=forbid):
    # валидируем только подмножество полей Node, а в БД пишем полный merged (db читает по .get).
    try:
        Node.model_validate({k: v for k, v in merged.items() if k in _NODE_FIELDS})
    except Exception as exc:  # noqa: BLE001 — pydantic ValidationError → 422
        raise HTTPException(status_code=422, detail=str(exc))
    saved = db.upsert_node(tenant, merged, source=existing.get("source", "user"))
    return {"updated": saved["id"]}


@app.delete("/api/nodes/{node_id}")
def remove_node(node_id: str, request: Request, _user: dict = Depends(require_member)) -> dict:
    """Безвозвратно удалить вопрос из банка (БД). 404, если нет."""
    tenant = resolve_tenant(request)
    if not db.delete_node(tenant, node_id):
        raise HTTPException(status_code=404, detail=f"node '{node_id}' not found")
    return {"deleted": node_id}


@app.post("/api/interview")
def make_interview(
    req: InterviewRequest, request: Request, _user: dict = Depends(current_user)
) -> dict:
    pool = _pool_or_404(req.pool)
    order = build_interview(
        _db_nodes(request, pool),
        count=req.count,
        difficulties=req.difficulties,
        block_weights=block_weights(pool),
        seed=req.seed,
    )
    return {"order": order}


# ---------- people (interviewers + candidates) ----------
@app.get("/api/candidates")
def list_candidates(request: Request, _user: dict = Depends(current_user)) -> list:
    return db.list_candidates(resolve_tenant(request))


@app.post("/api/candidates")
def add_candidate(
    body: CandidateCreate, request: Request, _user: dict = Depends(require_member)
) -> dict:
    return db.create_candidate(resolve_tenant(request), body.model_dump())


@app.put("/api/candidates/{candidate_id}")
def edit_candidate(
    candidate_id: int, body: CandidateUpdate, request: Request,
    _user: dict = Depends(require_member),
) -> dict:
    tenant = resolve_tenant(request)
    updated = db.update_candidate(tenant, candidate_id, body.model_dump(exclude_none=True))
    if updated is None:
        raise HTTPException(status_code=404, detail=f"candidate '{candidate_id}' not found")
    return updated


@app.get("/api/interviewers")
def list_interviewers(request: Request, _user: dict = Depends(current_user)) -> list:
    return db.list_interviewers(resolve_tenant(request))


@app.post("/api/interviewers")
def add_interviewer(
    body: InterviewerCreate, request: Request, _user: dict = Depends(require_member)
) -> dict:
    return db.create_interviewer(resolve_tenant(request), body.model_dump())


# ---------- sessions ----------
@app.post("/api/sessions")
def create_session(
    body: SessionCreate, request: Request, _user: dict = Depends(require_member)
) -> dict:
    tenant = resolve_tenant(request)
    # Если передан candidate_id — денормализуем имя в sessions.candidate (фиксация имени
    # на момент интервью + быстрый показ без джойна). Иначе используем свободный текст.
    candidate_name = body.candidate
    if body.candidate_id is not None:
        cand = db.get_candidate(tenant, body.candidate_id)
        if cand is None:
            raise HTTPException(status_code=404, detail=f"candidate '{body.candidate_id}' not found")
        candidate_name = cand["name"]
    return db.create_session(
        candidate_name,
        tenant_id=tenant,
        candidate_id=body.candidate_id,
        interviewer_id=body.interviewer_id,
    )


@app.get("/api/sessions")
def list_sessions(request: Request, _user: dict = Depends(current_user)) -> list:
    return db.list_sessions(resolve_tenant(request))


@app.get("/api/sessions/{session_id}")
def get_session(session_id: int, request: Request, _user: dict = Depends(current_user)) -> dict:
    session = db.get_session(session_id, resolve_tenant(request))
    if session is None:
        raise HTTPException(status_code=404, detail="session not found")
    return session


@app.post("/api/sessions/{session_id}/score")
async def set_score(
    session_id: int, body: ScoreIn, request: Request, _user: dict = Depends(require_member)
) -> dict:
    tenant = resolve_tenant(request)
    if db.get_session(session_id, tenant) is None:
        raise HTTPException(status_code=404, detail="session not found")
    session = db.set_score(session_id, body.node_id, body.score, body.note, tenant_id=tenant)
    hub.publish(session_id, session)
    return session


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.get("/api/sessions/{session_id}/events")
async def session_events(
    session_id: int, request: Request, _user: dict = Depends(current_user)
) -> StreamingResponse:
    """SSE-поток: снимок сессии при подключении + обновления после каждой оценки.

    Позволяет интервьюеру и HR одновременно видеть изменения по одному кандидату.
    """
    session = db.get_session(session_id, resolve_tenant(request))
    if session is None:
        raise HTTPException(status_code=404, detail="session not found")
    queue = hub.subscribe(session_id)

    async def gen():
        try:
            yield _sse("snapshot", session)
            while True:
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=15)
                    yield _sse("update", payload)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                if await request.is_disconnected():
                    break
        finally:
            hub.unsubscribe(session_id, queue)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "content_dir": str(CONTENT_DIR), "db": str(DB_PATH)}


# ---------- static frontend (если собран) ----------
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
