"""Тесты идут по своей временной БД, а не по рабочей ./interview.db.

`app.main` читает INTERVIEW_DB_PATH на импорте и при первом старте сидит owner-аккаунт
со случайным паролем (когда INTERVIEW_OWNER_PASSWORD не задан). На дефолтном пути это
делает `pytest` зелёным ровно один раз: первый прогон создаёт interview.db, а каждый
следующий генерит новый пароль и не может войти в уже засиженную БД — 43 падения с 401
на ровном месте. Поэтому уводим БД во временный каталог, свой на каждый прогон.
"""

from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

_TMPDIR = tempfile.mkdtemp(prefix="interview-tests-")
# setdefault: заданный снаружи INTERVIEW_DB_PATH (скилл interview-verify, CI) уважаем.
os.environ.setdefault("INTERVIEW_DB_PATH", str(Path(_TMPDIR) / "test.db"))


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(_TMPDIR, ignore_errors=True)
