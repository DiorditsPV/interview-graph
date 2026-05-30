"""In-memory pub/sub для live-синхронизации сессий через SSE.

Один процесс uvicorn держит набор asyncio-очередей подписчиков на каждый `session_id`.
`POST .../score` публикует обновлённый снимок сессии — все подключённые клиенты
(интервьюер, HR) получают его моментально по Server-Sent Events.
"""

from __future__ import annotations

import asyncio
from typing import Dict, Set


class SessionHub:
    def __init__(self) -> None:
        self._subs: Dict[int, Set[asyncio.Queue]] = {}

    def subscribe(self, session_id: int) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._subs.setdefault(session_id, set()).add(q)
        return q

    def unsubscribe(self, session_id: int, q: asyncio.Queue) -> None:
        subs = self._subs.get(session_id)
        if subs is None:
            return
        subs.discard(q)
        if not subs:
            self._subs.pop(session_id, None)

    def publish(self, session_id: int, payload: dict) -> None:
        """Разослать снимок всем подписчикам сессии (не блокирует при полной очереди-маловероятно)."""
        for q in self._subs.get(session_id, set()):
            q.put_nowait(payload)
