"""FastAPI-приложение сервиса интервью «граф вопросов».

Запуск:  uvicorn app.main:app --reload  (из каталога backend/)
Конфиг через переменные окружения:
    INTERVIEW_CONTENT_DIR  — каталог с *.md/*.json (по умолч. ../content)
    INTERVIEW_DB_PATH      — путь к SQLite (по умолч. ./interview.db)
    INTERVIEW_FRONTEND_DIR — каталог собранного фронта (по умолч. ../frontend/dist)
"""

from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .db import Database
from .importer import load_content, parse_file
from .models import GraphResponse
from .sampler import build_interview, load_weights

BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
PROJECT_DIR = BASE_DIR.parent                              # interview/
CONTENT_DIR = Path(os.environ.get("INTERVIEW_CONTENT_DIR", PROJECT_DIR / "content"))
DB_PATH = Path(os.environ.get("INTERVIEW_DB_PATH", BASE_DIR / "interview.db"))
FRONTEND_DIR = Path(os.environ.get("INTERVIEW_FRONTEND_DIR", PROJECT_DIR / "frontend" / "dist"))

app = FastAPI(title="Interview Graph", version="0.1.0")

# CORS для dev-режима Vite (localhost:5173).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

db = Database(DB_PATH)


# ---------- request models ----------
class SessionCreate(BaseModel):
    candidate: str = Field(min_length=1)


class ScoreIn(BaseModel):
    node_id: str = Field(alias="nodeId")
    score: int = Field(ge=1, le=5)
    note: Optional[str] = None
    model_config = {"populate_by_name": True}


class InterviewRequest(BaseModel):
    count: int = Field(default=20, ge=1, le=200)
    difficulties: Optional[List[str]] = None
    seed: Optional[int] = None


class ImportFile(BaseModel):
    filename: str = Field(min_length=1)
    content: str


# ---------- graph & content ----------
@app.get("/api/graph", response_model=GraphResponse)
def get_graph() -> GraphResponse:
    nodes, errors = load_content(CONTENT_DIR)
    return GraphResponse(nodes=nodes, errors=errors)


@app.get("/api/weights")
def get_weights() -> dict:
    return load_weights(CONTENT_DIR)


@app.post("/api/import")
def import_file(body: ImportFile) -> dict:
    """Загрузить .md/.json: распарсить тем же импортёром, валидные новые ноды сохранить в content/<block>/."""
    name = Path(body.filename).name
    ext = Path(name).suffix.lower()
    if ext not in {".md", ".json"}:
        raise HTTPException(status_code=400, detail="only .md or .json files are supported")

    # Парсим во временной директории, сохраняя ОРИГИНАЛЬНОЕ имя: id-less md берёт id из stem.
    from .importer import _fmt_error  # локально — внутренний хелпер форматирования ошибок

    added: List[dict] = []
    errors: List[dict] = []
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td) / name
        tmp.write_text(body.content, encoding="utf-8")
        try:
            nodes = parse_file(tmp)
        except Exception as exc:  # noqa: BLE001 — любую ошибку парсинга показываем пользователю
            return {"added": [], "errors": [{"file": name, "error": _fmt_error(exc)}]}

    existing = {n.id for n in load_content(CONTENT_DIR)[0]}
    for node in nodes:
        if node.id in existing:
            errors.append({"file": name, "error": f"duplicate id '{node.id}' (already in content)"})
            continue
        safe_id = re.sub(r"[^A-Za-z0-9_-]+", "_", node.id)
        dest_dir = CONTENT_DIR / node.block
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f"{safe_id}{ext}"
        if ext == ".md":
            dest.write_text(body.content, encoding="utf-8")
        else:
            import json as _json
            dest.write_text(_json.dumps(node.model_dump(), ensure_ascii=False, indent=2), encoding="utf-8")
        existing.add(node.id)
        added.append({
            "id": node.id,
            "block": node.block,
            "title": node.title or "",
            "path": str(dest.relative_to(CONTENT_DIR)),
        })
    return {"added": added, "errors": errors}


@app.post("/api/interview")
def make_interview(req: InterviewRequest) -> dict:
    nodes, _ = load_content(CONTENT_DIR)
    order = build_interview(
        nodes,
        count=req.count,
        difficulties=req.difficulties,
        block_weights=load_weights(CONTENT_DIR),
        seed=req.seed,
    )
    return {"order": order}


# ---------- sessions ----------
@app.post("/api/sessions")
def create_session(body: SessionCreate) -> dict:
    return db.create_session(body.candidate)


@app.get("/api/sessions")
def list_sessions() -> list:
    return db.list_sessions()


@app.get("/api/sessions/{session_id}")
def get_session(session_id: int) -> dict:
    session = db.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found")
    return session


@app.post("/api/sessions/{session_id}/score")
def set_score(session_id: int, body: ScoreIn) -> dict:
    if db.get_session(session_id) is None:
        raise HTTPException(status_code=404, detail="session not found")
    return db.set_score(session_id, body.node_id, body.score, body.note)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "content_dir": str(CONTENT_DIR), "db": str(DB_PATH)}


# ---------- static frontend (если собран) ----------
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
