# Старт сессии на главной · CRUD направлений · RU/EN · пул X5 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести старт сессии с доски на главную, дать CRUD направлений с пресетами вопросов, переключатель RU/EN и новый пул «Data Engineer X5».

**Architecture:** Четыре части — стек веток A → B → C (`feature/home-session-start` → `feature/pool-crud` → `feature/i18n`) и независимая контентная ветка D (`feature/pool-de-x5`, от `dev`, параллельно). Пулы переезжают из in-memory `POOLS` в таблицу `pools` (сид из `content/<pool>/pool.yaml`, как ноды). Локализация — словарь «русская строка → английская» без библиотек.

**Tech Stack:** FastAPI + SQLite (`backend/app`), React + Vite + TypeScript (`frontend/src`), Playwright smoke (`frontend/smoke.mjs`), `python-frontmatter` для контента.

**Spec:** `docs/superpowers/specs/2026-09-03-home-sessions-pool-crud-i18n-x5-design.md`

## Global Constraints

- Контент читать через `cat`/`grep`, править через `python-frontmatter` (`backend/.venv`), запись `f.write_text(frontmatter.dumps(post) + "\n")`.
- Теги нод — только из 17 концептов: architecture, orchestration, optimization, partitioning, deployment, storage, streaming, consistency, data-modeling, quality, distributed, sql, monitoring, memory, file-formats, domain, concurrency. 1–3 на ноду.
- Id нод уникальны в пределах тенанта; у нового пула — префикс `x5-`.
- `Node` имеет `extra="forbid"`: полей ноды не добавляем.
- Изменения `frontend/src` требуют `npm run build` (tsc + vite); smoke (`npm run smoke`) нужен сервер на `SMOKE_URL` (по умолчанию `http://localhost:8000/`), логин `owner@interview.local` / `interview-dev` (задать `INTERVIEW_OWNER_PASSWORD=interview-dev` серверу).
- Тесты бэкенда: `cd backend && . .venv/bin/activate && pytest -q` (временная БД через `backend/conftest.py`).
- В `main` не пушить. Коммиты — на русском, стиль `feat(scope): …` / `fix(scope): …` / `test(scope): …`, трейлеры Co-Authored-By/Claude-Session как в репозитории.
- Не удалять `content/` и не трогать `pool.yaml` существующих пулов.

### Как гонять smoke локально

```bash
cd backend && . .venv/bin/activate
INTERVIEW_DB_PATH=/tmp/smoke-$$.db INTERVIEW_OWNER_PASSWORD=interview-dev \
  uvicorn app.main:app --port 8010 &            # свежая БД → сид пулов и owner
cd ../frontend && npm run build && SMOKE_URL=http://localhost:8010/ npm run smoke
```

Сервер отдаёт `frontend/dist`, поэтому сначала `npm run build`. После правок фронта — пересобрать; сервер перезапускать не нужно (статика читается с диска).

---

# Часть A — старт сессии на главной (`feature/home-session-start`, база `dev`)

### Task A1: интервьюер по умолчанию при создании сессии (режим: инлайн)

**Files:**
- Modify: `backend/app/main.py` (`create_session`, около строки 476)
- Test: `backend/tests/test_people.py`

**Interfaces:**
- Produces: `POST /api/sessions` без `interviewerId` возвращает `interviewer_id` первого интервьюера тенанта.

- [ ] **Step 1: Failing test**

```python
def test_session_defaults_to_first_interviewer():
    c = _client()
    ivs = c.get("/api/interviewers").json()
    assert ivs, "seed interviewer expected"
    r = c.post("/api/sessions", json={"candidate": "Default Iv"})
    assert r.status_code == 200
    assert r.json()["interviewer_id"] == ivs[0]["id"]
```

(`_client()` уже есть в `test_people.py`: `TestClient(app)` + логин owner'ом.)

- [ ] **Step 2: Run** `pytest tests/test_people.py::test_session_defaults_to_first_interviewer -q` → FAIL (`interviewer_id` is None).

- [ ] **Step 3: Implement** — в `create_session` перед `db.create_session`:

```python
    interviewer_id = body.interviewer_id
    if interviewer_id is None:
        # Интервьюер из UI больше не выбирается: сессии нужен проводивший для отчёта
        # и страницы сессий — берём первого интервьюера тенанта (сид «Я»).
        ivs = db.list_interviewers(tenant)
        interviewer_id = ivs[0]["id"] if ivs else None
```

и передать `interviewer_id=interviewer_id`.

- [ ] **Step 4: Run** весь `pytest -q` → PASS.
- [ ] **Step 5: Commit** `feat(sessions): интервьюер по умолчанию — первый интервьюер тенанта`.

### Task A2: роутер — deep-link `#/?start=<pool>` (режим: инлайн)

**Files:**
- Modify: `frontend/src/router.ts`, `frontend/src/Router.tsx`, `frontend/src/pages/HomePage.tsx`

**Interfaces:**
- Produces: `Route` home = `{ name: "home"; start: string | null }`; `href.start(pool: string): string` → `#/?start=<pool>`; `HomePage` проп `startPool?: string | null`.

- [ ] **Step 1:** в `router.ts`:

```ts
  | { name: "home"; start: string | null }
…
  if (segs.length === 0) return { name: "home", start: query.get("start") };
…
  return { name: "home", start: null }; // неизвестный путь → меню
…
export const href = {
  home: "#/",
  start: (pool: string) => `#/?start=${encodeURIComponent(pool)}`,
  …
```

- [ ] **Step 2:** в `Router.tsx` `default:` → `return <HomePage pools={pools} startPool={route.name === "home" ? route.start : null} />;` В `HomePage` добавить проп `startPool?: string | null` (пока не используется — Task A3).
- [ ] **Step 3:** `cd frontend && npm run build` → OK. Commit `feat(router): deep-link на форму старта интервью #/?start=<pool>`.

### Task A3: форма старта на карточке направления (режим: субагент + ревью)

**Files:**
- Create: `frontend/src/components/StartSessionForm.tsx`
- Modify: `frontend/src/pages/HomePage.tsx`, `frontend/src/styles.css`

**Interfaces:**
- Consumes: `api.listCandidates`, `api.createCandidate`, `api.createSession(pool, candidate, candidateId?)`, `href.board`, `navigate` (`router.ts`).
- Produces: `StartSessionForm({ pool, onClose }: { pool: PoolConfig; onClose: () => void })`; на карточке `button.poolcard__start` «Начать интервью»; контейнер формы `div.poolcard__form`.

- [ ] **Step 1: Компонент**

```tsx
import { useEffect, useState } from "react";
import { api } from "../api";
import { href, navigate } from "../router";
import type { Candidate, PoolConfig } from "../types";

// Старт интервью с главной (переехал из шапки доски): существующий кандидат или новый
// (имя + позиция/грейд) → сессия → доска с ?session=<id>, где joinSession подхватит её.
export function StartSessionForm({ pool, onClose }: { pool: PoolConfig; onClose: () => void }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [seniority, setSeniority] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.listCandidates().then(setCandidates).catch(() => setCandidates([])); }, []);

  const start = async () => {
    let candidateId = pickedId;
    let candName = name.trim();
    if (candidateId != null) candName = candidates.find((c) => c.id === candidateId)?.name ?? candName;
    if (candidateId == null && !candName) return;
    setBusy(true);
    try {
      if (candidateId == null) {
        try {
          const created = await api.createCandidate({
            name: candName,
            position: position.trim() || undefined,
            seniority: seniority.trim() || undefined,
          });
          candidateId = created.id;
        } catch { /* сессия стартует по свободному имени */ }
      }
      const s = await api.createSession(pool.id, candName || "—", candidateId ?? undefined);
      // Именованная сессия персистит в БД — локальный черновик оценок больше не нужен;
      // таймер интервью стартует здесь, доска читает timerStart:<pool>.
      localStorage.removeItem(`draftScores:${pool.id}`);
      localStorage.setItem(`timerStart:${pool.id}`, String(Date.now()));
      navigate(href.board(pool.id, s.id));
    } catch {
      alert("Не удалось начать сессию");
      setBusy(false);
    }
  };

  return (
    <div className="poolcard__form" onClick={(e) => e.stopPropagation()}>
      {candidates.length > 0 && (
        <select className="cand-pick" value={pickedId ?? ""} title="Выбрать существующего кандидата"
          onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; setPickedId(v); if (v != null) setName(""); }}>
          <option value="">Новый кандидат…</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}{c.seniority ? ` · ${c.seniority}` : ""}</option>)}
        </select>
      )}
      {pickedId == null && (
        <>
          <input placeholder="Кандидат…" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()} autoFocus />
          <input className="cand-pos" placeholder="Позиция (опц.)" value={position} onChange={(e) => setPosition(e.target.value)} />
          <input className="cand-sen" placeholder="Грейд (опц.)" value={seniority} onChange={(e) => setSeniority(e.target.value)} />
        </>
      )}
      <div className="poolcard__form-actions">
        <button className="btn--primary" onClick={start} disabled={busy}>Начать</button>
        <button className="iconbtn" onClick={onClose}>Отмена</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: HomePage** — state `const [startPool, setStartPool] = useState<string | null>(startPool0 ?? null)` (проп переименовать при деструктуризации: `startPool: startPool0`). В карточке после `.poolcard__blocks`:

```tsx
<div className="poolcard__actions">
  <button className="poolcard__start btn--primary" onClick={() => setStartPool(p.id)}>Начать интервью</button>
  <a className="poolcard__bank" href={href.bank(p.id)}>банк вопросов →</a>
</div>
{startPool === p.id && <StartSessionForm pool={p} onClose={() => setStartPool(null)} />}
```

`HomePage` становится функцией с хуком — `import { useState } from "react"`. Растяжка `.poolcard__label::after` накрывает карточку, поэтому кнопка и форма должны быть над ней.

- [ ] **Step 3: CSS** (рядом с `.poolcard__bank`):

```css
.poolcard__actions { display: flex; align-items: center; gap: 12px; margin-top: 4px; position: relative; z-index: 1; }
.poolcard__start { padding: 6px 12px; font-size: 13px; }
.poolcard__form { position: relative; z-index: 1; display: grid; gap: 6px; padding: 10px; margin-top: 4px;
  border: 1px solid var(--border); border-radius: 8px; background: var(--bg); }
.poolcard__form input, .poolcard__form select { padding: 6px 10px; border: 1px solid var(--border-strong); border-radius: 6px; background: var(--surface); color: var(--text); }
.poolcard__form-actions { display: flex; gap: 8px; }
```

(Токены `--bg`, `--surface`, `--border`, `--border-strong`, `--text`, `--accent` уже есть в `styles.css`.)

- [ ] **Step 4:** `npm run build` → OK. Ручная проверка через smoke делается в Task A4 (там переписываются шаги). Commit `feat(home): «Начать интервью» и форма кандидата на карточке направления`.

### Task A4: доска без строки кандидата + smoke (режим: субагент + ревью)

**Files:**
- Modify: `frontend/src/pages/BoardPage.tsx` (state 250-311, функции 602-726, JSX 839-951, `reportPeople` 739-751), `frontend/src/pages/SessionsPage.tsx` (текст пустого состояния), `frontend/src/styles.css`, `frontend/smoke.mjs` (шаги 10, 11, 13-комментарий)

**Interfaces:**
- Consumes: `href.start(pool)` (Task A2), `.poolcard__start` и форма (Task A3).
- Produces: на доске без сессии `span.session__none` + `a.session__start`; при сессии — прежний `.session__active` без `🎤`.

- [ ] **Step 1: BoardPage — удалить** state `candidate`, `candidates`, `interviewers`, `pickedCandidateId`, `pickedInterviewerId`, `candPosition`, `candSeniority`, `pastSessions`, `sessions`; функции `startSession`, `loadSession`; эффект «people-schema: подтянуть кандидатов и интервьюеров»; в эффекте «Список сессий для пикера + авто-подключение» оставить только `if (sessionFromUrl) joinSession(sessionFromUrl);`. Неиспользуемые импорты (`Candidate`, `Interviewer`, `SessionMeta`, `SessionSummary`) убрать — `tsc` подскажет.

- [ ] **Step 2: reportPeople** — люди для шапки отчёта подгружаются по сессии:

```tsx
  // Позиция/грейд кандидата и имя интервьюера — для шапки отчёта; грузим по факту сессии.
  const [reportPeople, setReportPeople] = useState<{ interviewer: string | null; position: string | null; seniority: string | null }>({ interviewer: null, position: null, seniority: null });
  useEffect(() => {
    if (!session) { setReportPeople({ interviewer: null, position: null, seniority: null }); return; }
    Promise.all([api.listCandidates().catch(() => []), api.listInterviewers().catch(() => [])]).then(([cs, ivs]) => {
      const cand = cs.find((c) => c.id === session.candidate_id);
      const iv = ivs.find((i) => i.id === session.interviewer_id);
      setReportPeople({ interviewer: iv?.name ?? null, position: cand?.position ?? null, seniority: cand?.seniority ?? null });
    });
  }, [session]);
```

Вызовы `downloadReport(session?.candidate ?? candidate, …)` → `downloadReport(session?.candidate ?? "", …)`.

- [ ] **Step 3: JSX ряда 2** — ветка `session ? (…) : (…)`: в активной убрать IIFE с `🎤`; в неактивной вместо пикеров/инпутов/кнопок:

```tsx
<>
  <span className="session__none muted">Просмотр без сессии</span>
  <a className="session__start" href={href.start(pool.id)}>Начать интервью →</a>
</>
```

CSS: `.session__start { color: var(--accent); text-decoration: none; font-weight: 600; }`. Старые правила `.cand-pick`, `.iv-pick`, `.loadsess`, `.session__pick`, `.cand-pos`, `.cand-sen` в `styles.css` — оставить только те, что ещё используются формой на главной (`.cand-pick`, `.cand-pos`, `.cand-sen`), остальные удалить.

- [ ] **Step 4: SessionsPage** — «Сессий пока нет — начните интервью с главной».

- [ ] **Step 5: smoke.mjs** — шаг 10 заменить:

```js
// 10. Старт сессии с главной (home-session-start): «Начать интервью» на карточке DE → форма
//     кандидата (имя + грейд) → доска с ?session=<id> и активной сессией. Затем оценка в HUD.
await page.goto(URL + "#/", { waitUntil: "load" });
await page.waitForSelector('.poolcard[data-pool="data-engineer"] .poolcard__start', { timeout: 10000 });
await page.locator('.poolcard[data-pool="data-engineer"] .poolcard__start').click();
await page.waitForSelector(".poolcard__form", { timeout: 3000 });
await page.locator(".poolcard__form input[placeholder='Кандидат…']").fill("Cmp Bot");
await page.locator(".poolcard__form input[placeholder^='Грейд']").fill("middle");
await page.locator(".poolcard__form button", { hasText: "Начать" }).click();
await page.waitForFunction(() => /^#\/board\/data-engineer\?session=\d+/.test(location.hash), null, { timeout: 5000 });
await page.waitForSelector(".session__active", { timeout: 5000 });
const activeHdr = await page.locator(".session__active").innerText();
if (!activeHdr.includes("Cmp Bot")) fail(`active session missing candidate: "${activeHdr}"`);
console.log(`OK: session starts from main menu (${activeHdr.replace(/\s+/g, " ").slice(0, 50)})`);
await page.waitForSelector(".hud__score .scorebtn", { timeout: 3000 });
await page.locator(".hud__score .scorebtn").nth(2).click(); // 3/5 → персист в сессию
await page.waitForTimeout(400);
```

Шаг 11 заменить:

```js
// 11. Возобновление сессии: создать сессию+оценку через API → страница «Сессии» → «Открыть»
//     → доска подключается по ?session= и восстанавливает оценки. «Загрузить сессию» с доски убран.
const sid = (await (await page.request.post(URL + "api/sessions", { data: { candidate: "SmokeResume" } })).json()).id;
await page.request.post(`${URL}api/sessions/${sid}/score`, { data: { nodeId: "sql-01", score: 5 } });
await page.goto(URL + "#/sessions", { waitUntil: "load" });
await page.waitForSelector(`tr[data-session="${sid}"] a.iconbtn`, { timeout: 10000 });
await page.locator(`tr[data-session="${sid}"] a.iconbtn`, { hasText: "Открыть" }).click();
await page.waitForSelector(".session__active", { timeout: 5000 });
const active = await page.locator(".session__active").innerText();
if (!active.includes("SmokeResume")) fail(`resume did not load session: ${active}`);
const scoredCount = await page.locator(".qnode--scored").count();
if (scoredCount < 1) fail("resume did not restore scores onto the board");
// Выйти из сессии → доска без сессии ведёт на форму старта на главной.
await page.locator(".session button", { hasText: "Выйти" }).click();
await page.waitForSelector(".session__start", { timeout: 3000 });
const startHref = await page.locator(".session__start").getAttribute("href");
if (!startHref?.startsWith("#/?start=data-engineer")) fail(`board without session must link to start form, got ${startHref}`);
console.log(`OK: session resume restores scores (${scoredCount} scored), no-session board links to start form`);
```

Комментарий перед шагом 13 («После resume фокус на select.loadsess…») заменить на «После «Выйти» фокус на кнопке — «?» доходит до обработчика». Если после этого шаг 13 не открывает `.help-modal`, перед `press("?")` добавить `await page.locator(".app").click({ position: { x: 5, y: 5 } })` — но сначала проверить без него. Шаг 22 (страница сессий) и 23 (кандидаты) не меняются: `Cmp Bot` создаётся формой с главной так же, как раньше.

- [ ] **Step 6: Гейты** — `npm run build`; smoke по инструкции в Global Constraints → `ALL SMOKE CHECKS PASSED`; `pytest -q`. Commit `feat(board): строка кандидата переехала на главную; доска без сессии ведёт на форму старта`.

- [ ] **Step 7: PR** — `gh pr create --base dev --head feature/home-session-start` с описанием по спеку §1; дождаться CI gate.

---

# Часть B — CRUD направлений и пресеты (`feature/pool-crud`, база `feature/home-session-start`)

### Task B1: `pools.py` — блоки как данные, пул из строки БД, slug (режим: инлайн, TDD)

**Files:**
- Modify: `backend/app/pools.py`
- Test: `backend/tests/test_pools.py`

**Interfaces:**
- Produces:
  - `PoolCfg.dir: Optional[Path] = None` (последнее поле dataclass, default `None`);
  - `parse_blocks(raw_blocks, where: str = "pool") -> Tuple[BlockCfg, ...]` — та же валидация, что сегодня внутри `_parse_pool`;
  - `blocks_to_json(blocks: Tuple[BlockCfg, ...]) -> str` — JSON списка `{id,label,color,weight,subblocks:[{id,label}]}`;
  - `pool_from_row(row: dict) -> PoolCfg` — из `{id,label,description,blocks: list}` (blocks уже распарсенный список);
  - `slug_from_label(label: str) -> str` — транслитерация ru→lat, `[a-z0-9-]+`, пусто → `"pool"`.

- [ ] **Step 1: Failing tests** (в `test_pools.py`):

```python
from app.pools import blocks_to_json, parse_blocks, pool_from_row, slug_from_label
import json

def test_parse_blocks_and_json_roundtrip(tmp_path):
    _mk(tmp_path, "demo", VALID)
    cfg = load_pools(tmp_path)["demo"]
    raw = json.loads(blocks_to_json(cfg.blocks))
    assert raw[0]["subblocks"] == [{"id": "a1", "label": "A1"}, {"id": "a2", "label": "A2"}]
    assert parse_blocks(raw) == cfg.blocks

def test_pool_from_row_has_no_dir():
    row = {"id": "x", "label": "X", "description": "", "blocks": [{"id": "a", "label": "A", "color": "#000000", "weight": 1}]}
    cfg = pool_from_row(row)
    assert cfg.id == "x" and cfg.dir is None and cfg.block_ids == {"a"}
    assert cfg.to_dict()["blocks"][0]["subblocks"] == []

def test_pool_from_row_validates():
    with pytest.raises(PoolConfigError):
        pool_from_row({"id": "x", "label": "X", "description": "", "blocks": []})

@pytest.mark.parametrize("label,slug", [
    ("Аналитик данных", "analitik-dannyh"),
    ("Data Engineer X5", "data-engineer-x5"),
    ("  Щи & Ёж  ", "schi-ezh"),
    ("!!!", "pool"),
])
def test_slug_from_label(label, slug):
    assert slug_from_label(label) == slug
```

- [ ] **Step 2: Run** → FAIL (ImportError).

- [ ] **Step 3: Implement** — вынести цикл по `raw_blocks` из `_parse_pool` в `parse_blocks`; `_parse_pool` вызывает `parse_blocks(data.get("blocks"))`. Добавить:

```python
_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh", "з": "z",
    "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r",
    "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}

def slug_from_label(label: str) -> str:
    """Id направления из названия: транслитерация ru→lat, [a-z0-9-]+, пусто → 'pool'."""
    s = "".join(_TRANSLIT.get(ch, ch) for ch in label.strip().lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "pool"

def blocks_to_json(blocks: Tuple[BlockCfg, ...]) -> str:
    return json.dumps(
        [{"id": b.id, "label": b.label, "color": b.color, "weight": b.weight,
          "subblocks": [{"id": s.id, "label": s.label} for s in b.subblocks]} for b in blocks],
        ensure_ascii=False,
    )

def pool_from_row(row: dict) -> PoolCfg:
    """Пул из строки таблицы pools (blocks — уже список dict). Валидация та же, что для YAML."""
    return PoolCfg(
        id=row["id"], label=row["label"], description=row.get("description") or "",
        blocks=parse_blocks(row.get("blocks")), dir=None,
    )
```

`parse_blocks` должен бросать `PoolConfigError("pool must declare a non-empty 'blocks' list")` при пустом/не-списке (перенос текущей проверки).

- [ ] **Step 4: Run** `pytest -q` → PASS. Commit `refactor(pools): parse_blocks/pool_from_row/slug_from_label — пул как данные без каталога`.

### Task B2: `db.py` — таблица `pools` и DAL (режим: инлайн, TDD)

**Files:**
- Modify: `backend/app/db.py` (`_SCHEMA`, новые методы после блока nodes)
- Test: `backend/tests/test_pool_crud.py` (новый)

**Interfaces:**
- Produces (все per-tenant, dict-строки с `blocks` как списком):
  - `list_pools(tenant_id) -> List[Dict]` — без tombstone, порядок вставки (`ORDER BY rowid`);
  - `get_pool(tenant_id, pool_id) -> Optional[Dict]` — включая tombstone (`deleted_at` не None);
  - `upsert_pool_seed(tenant_id, pool: Dict) -> bool` — `INSERT OR IGNORE`, `source='seed'`; `pool` = `{id,label,description,blocks: list}`;
  - `create_pool(tenant_id, pool_id, label, description, blocks: list) -> Dict` — `source='user'`;
  - `update_pool(tenant_id, pool_id, fields: Dict) -> Optional[Dict]` — только `label`/`description`; None если нет или tombstone;
  - `delete_pool(tenant_id, pool_id) -> Optional[int]` — ставит `deleted_at`, удаляет ноды пула, возвращает число удалённых нод; None если нет/уже удалён;
  - `copy_nodes(tenant_id, src_pool, dst_pool) -> int` — копирует все ноды `src` в `dst` с id `f"{dst_pool}-{id}"`, `source='user'`, `hidden=0`; возвращает число.

- [ ] **Step 1: Failing tests**

```python
"""CRUD направлений: таблица pools (сид из pool.yaml + пользовательские), копирование нод."""
from pathlib import Path
from app.db import Database

BLOCKS = [{"id": "a", "label": "A", "color": "#111111", "weight": 1,
           "subblocks": [{"id": "a1", "label": "A1"}]}]

def _db(tmp_path: Path) -> Database:
    db = Database(tmp_path / "t.db")
    db.ensure_tenant("t")
    return db

def test_seed_then_user_pool_order_and_tombstone(tmp_path):
    db = _db(tmp_path)
    assert db.upsert_pool_seed("t", {"id": "de", "label": "DE", "description": "", "blocks": BLOCKS}) is True
    assert db.upsert_pool_seed("t", {"id": "de", "label": "DE2", "description": "", "blocks": BLOCKS}) is False
    db.create_pool("t", "sa", "SA", "desc", BLOCKS)
    assert [p["id"] for p in db.list_pools("t")] == ["de", "sa"]
    assert db.list_pools("t")[0]["label"] == "DE"           # OR IGNORE не перетирает
    assert db.list_pools("t")[1]["blocks"][0]["subblocks"] == [{"id": "a1", "label": "A1"}]
    assert db.update_pool("t", "sa", {"label": "SA!"})["label"] == "SA!"
    assert db.update_pool("t", "nope", {"label": "x"}) is None
    assert db.delete_pool("t", "sa") == 0
    assert [p["id"] for p in db.list_pools("t")] == ["de"]
    assert db.get_pool("t", "sa")["deleted_at"] is not None  # tombstone: id занят
    assert db.delete_pool("t", "sa") is None
    assert db.update_pool("t", "sa", {"label": "y"}) is None
    assert db.upsert_pool_seed("t", {"id": "sa", "label": "SA", "description": "", "blocks": BLOCKS}) is False

def test_copy_nodes_and_delete_pool_removes_them(tmp_path):
    db = _db(tmp_path)
    db.create_pool("t", "src", "Src", "", BLOCKS)
    db.create_pool("t", "dst", "Dst", "", BLOCKS)
    db.upsert_node("t", {"id": "q-01", "pool": "src", "block": "a", "subblock": "a1", "topic": "x",
                         "question": "Q?", "answer": "A", "tags": ["sql"], "rubric": []}, source="seed")
    db.set_node_hidden("t", "q-01", True)
    assert db.copy_nodes("t", "src", "dst") == 1
    copied = db.get_node("t", "dst-q-01")
    assert copied["pool"] == "dst" and copied["source"] == "user" and copied["hidden"] == 0
    assert copied["tags"] == ["sql"] and copied["subblock"] == "a1"
    assert db.count_nodes("t", pool="src") == 1
    assert db.delete_pool("t", "dst") == 1
    assert db.get_node("t", "dst-q-01") is None
    assert db.count_nodes("t", pool="src") == 1
```

- [ ] **Step 2: Run** `pytest tests/test_pool_crud.py -q` → FAIL.

- [ ] **Step 3: Implement** — в `_SCHEMA` добавить таблицу из спека §2 (после `nodes`). `_row_to_pool(row)`: dict + `json.loads(blocks)`. Методы:

```python
    # --- pools (направления; сид из content/<pool>/pool.yaml, CRUD из UI) ---
    def list_pools(self, tenant_id: str) -> List[Dict]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM pools WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY rowid",
                (tenant_id,),
            ).fetchall()
        return [_row_to_pool(r) for r in rows]

    def get_pool(self, tenant_id: str, pool_id: str) -> Optional[Dict]:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM pools WHERE tenant_id = ? AND id = ?", (tenant_id, pool_id)).fetchone()
        return _row_to_pool(row) if row else None

    def upsert_pool_seed(self, tenant_id: str, pool: Dict) -> bool:
        now = _now()
        with self._conn() as conn:
            cur = conn.execute(
                """INSERT OR IGNORE INTO pools (tenant_id, id, label, description, blocks, source, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, 'seed', ?, ?)""",
                (tenant_id, pool["id"], pool["label"], pool.get("description") or "",
                 json.dumps(pool["blocks"], ensure_ascii=False), now, now),
            )
        return cur.rowcount == 1

    def create_pool(self, tenant_id: str, pool_id: str, label: str, description: str, blocks: List[Dict]) -> Dict:
        now = _now()
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO pools (tenant_id, id, label, description, blocks, source, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, 'user', ?, ?)""",
                (tenant_id, pool_id, label, description, json.dumps(blocks, ensure_ascii=False), now, now),
            )
        return self.get_pool(tenant_id, pool_id)

    def update_pool(self, tenant_id: str, pool_id: str, fields: Dict) -> Optional[Dict]:
        allowed = {k: v for k, v in fields.items() if k in ("label", "description")}
        cur_row = self.get_pool(tenant_id, pool_id)
        if cur_row is None or cur_row["deleted_at"] is not None:
            return None
        if allowed:
            sets = ", ".join(f"{k} = ?" for k in allowed)
            with self._conn() as conn:
                conn.execute(f"UPDATE pools SET {sets}, updated_at = ? WHERE tenant_id = ? AND id = ?",
                             (*allowed.values(), _now(), tenant_id, pool_id))
        return self.get_pool(tenant_id, pool_id)

    def delete_pool(self, tenant_id: str, pool_id: str) -> Optional[int]:
        cur_row = self.get_pool(tenant_id, pool_id)
        if cur_row is None or cur_row["deleted_at"] is not None:
            return None
        with self._conn() as conn:
            removed = conn.execute("DELETE FROM nodes WHERE tenant_id = ? AND pool = ?", (tenant_id, pool_id)).rowcount
            conn.execute("UPDATE pools SET deleted_at = ?, updated_at = ? WHERE tenant_id = ? AND id = ?",
                         (_now(), _now(), tenant_id, pool_id))
        return removed

    def copy_nodes(self, tenant_id: str, src_pool: str, dst_pool: str) -> int:
        n = 0
        for node in self.list_nodes(tenant_id, pool=src_pool):
            self.upsert_node(tenant_id, {**node, "id": f"{dst_pool}-{node['id']}", "pool": dst_pool, "hidden": 0}, source="user")
            n += 1
        return n
```

Проверить, что `upsert_node` пишет `hidden` из dict (если нет — сбрасывать `hidden` явным `set_node_hidden(..., False)` после вставки, либо upsert принимает `hidden` через `node.get("hidden", 0)`; читай тело `upsert_node` строки 292-323 и подстрой).

- [ ] **Step 4: Run** `pytest -q` → PASS. Commit `feat(db): таблица pools — сид, создание, правка, tombstone-удаление, копирование нод`.

### Task B3: сид и API пулов, `POOLS` → БД (режим: субагент + ревью)

**Files:**
- Modify: `backend/app/seed.py`, `backend/app/main.py` (стартовый сид ~78-90, `_pool_or_404` 270, `get_pools` 287, все вызовы `_pool_or_404`/`POOLS`), `AGENTS.md` (раздел API), `CLAUDE.md` (строка про `pools.py`)
- Test: `backend/tests/test_pool_crud.py` (API-тесты), существующие тесты не должны меняться

**Interfaces:**
- Consumes: Task B1, B2.
- Produces:
  - `POST /api/pools` body `{label: str (min 1), description: str = "", preset: str}` → объект как в `GET /api/pools` (с `counts`); 404 если `preset` не найден;
  - `PUT /api/pools/{id}` body `{label?: str (min 1), description?: str}` → объект пула; 404;
  - `DELETE /api/pools/{id}` → `{deleted: id, nodes_removed: int, sessions_kept: int}`; 404;
  - id пула = `slug_from_label(label)`, при занятости (включая tombstone) суффикс `-2`, `-3`, …

- [ ] **Step 1: Failing API tests** (добавить в `test_pool_crud.py`):

```python
from fastapi.testclient import TestClient

def _client():
    from app.main import OWNER_EMAIL, OWNER_PASSWORD, app
    c = TestClient(app)
    c.post("/api/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    return c

def test_create_pool_from_preset_copies_blocks_and_nodes():
    c = _client()
    de = next(p for p in c.get("/api/pools").json() if p["id"] == "data-engineer")
    r = c.post("/api/pools", json={"label": "Аналитик данных", "description": "тест", "preset": "data-engineer"})
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["id"] == "analitik-dannyh" and p["label"] == "Аналитик данных"
    assert p["blocks"] == de["blocks"]
    assert p["counts"]["nodes"] == de["counts"]["nodes"] > 0
    nodes = c.get("/api/graph?pool=analitik-dannyh").json()["nodes"]
    assert all(n["id"].startswith("analitik-dannyh-") and n["pool"] == "analitik-dannyh" for n in nodes)
    # второй с тем же названием → суффикс
    r2 = c.post("/api/pools", json={"label": "Аналитик данных", "preset": "data-engineer"})
    assert r2.json()["id"] == "analitik-dannyh-2"
    for pid in ("analitik-dannyh", "analitik-dannyh-2"):
        assert c.delete(f"/api/pools/{pid}").status_code == 200

def test_create_pool_errors():
    c = _client()
    assert c.post("/api/pools", json={"label": "X", "preset": "nope"}).status_code == 404
    assert c.post("/api/pools", json={"label": "", "preset": "data-engineer"}).status_code == 422

def test_update_and_delete_pool_keeps_sessions_and_blocks_reseed():
    c = _client()
    p = c.post("/api/pools", json={"label": "Temp Pool", "preset": "system-analyst"}).json()
    pid = p["id"]
    assert c.put(f"/api/pools/{pid}", json={"label": "Temp Pool 2", "description": "d"}).json()["label"] == "Temp Pool 2"
    assert c.put("/api/pools/nope", json={"label": "x"}).status_code == 404
    sid = c.post("/api/sessions", json={"candidate": "Keep Me", "pool": pid}).json()["id"]
    r = c.delete(f"/api/pools/{pid}")
    assert r.status_code == 200
    assert r.json()["nodes_removed"] > 0 and r.json()["sessions_kept"] == 1
    assert pid not in {x["id"] for x in c.get("/api/pools").json()}
    assert c.get(f"/api/graph?pool={pid}").status_code == 404
    assert c.get(f"/api/sessions/{sid}").status_code == 200          # история осталась
    assert c.delete(f"/api/pools/{pid}").status_code == 404
    # tombstone: то же название даёт новый id, а не воскрешает старый
    p2 = c.post("/api/pools", json={"label": "Temp Pool", "preset": "system-analyst"}).json()
    assert p2["id"] == f"{pid}-2"
    c.delete(f"/api/pools/{p2['id']}")

def test_seed_does_not_resurrect_deleted_pool(tmp_path):
    from app.db import Database
    from app.pools import load_pools
    from app.seed import seed_pool_if_empty
    from pathlib import Path
    cfg = load_pools(Path(__file__).resolve().parent.parent.parent / "content")["system-analyst"]
    db = Database(tmp_path / "s.db")
    db.ensure_tenant("default")
    inserted, errors = seed_pool_if_empty(db, "default", cfg)
    assert inserted > 0 and errors == []
    assert [p["id"] for p in db.list_pools("default")] == ["system-analyst"]
    db.delete_pool("default", "system-analyst")
    assert seed_pool_if_empty(db, "default", cfg) == (0, [])
    assert db.list_pools("default") == []
```

- [ ] **Step 2: Run** → FAIL (405/404 на новых ручках).

- [ ] **Step 3: seed.py** — в `seed_pool_if_empty` первой строкой после `ensure_tenant`:

```python
    # Конфиг пула тоже сид: INSERT OR IGNORE — правки label/description из UI и tombstone
    # удалённого направления переживают рестарт.
    db.upsert_pool_seed(tenant_id, {"id": pool.id, "label": pool.label,
                                    "description": pool.description, "blocks": json.loads(blocks_to_json(pool.blocks))})
    existing = db.get_pool(tenant_id, pool.id)
    if existing is not None and existing["deleted_at"] is not None:
        return 0, []
```

- [ ] **Step 4: main.py**
  - Стартовый блок: `POOLS` остаётся только как локальная переменная `_content_pools = load_pools(CONTENT_DIR)` для сида; предупреждение «no pools found» — по ней.
  - Хелперы:

```python
def _pools(request: Request) -> Dict[str, PoolCfg]:
    """Направления тенанта из БД (источник правды; content/ — сид), в порядке создания."""
    return {row["id"]: pool_from_row(row) for row in db.list_pools(resolve_tenant(request))}


def _pool_or_404(request: Request, pool_id: Optional[str]) -> PoolCfg:
    pools = _pools(request)
    pid = pool_id or default_pool_id(pools)
    if pid is None or pid not in pools:
        raise HTTPException(status_code=404, detail=f"pool '{pool_id}' not found")
    return pools[pid]


def _pool_out(request: Request, p: PoolCfg) -> dict:
    tenant = resolve_tenant(request)
    return {**p.to_dict(), "counts": {"nodes": db.count_nodes(tenant, pool=p.id),
                                      "sessions": db.count_sessions(tenant, p.id)}}
```

  - Все вызовы `_pool_or_404(x)` → `_pool_or_404(request, x)`; в `edit_node` вместо `if merged["pool"] in POOLS: validate_against_pool(node, POOLS[...])` — `pools = _pools(request); if merged["pool"] in pools: validate_against_pool(node, pools[merged["pool"]])`.
  - `get_pools` → `[_pool_out(request, p) for p in _pools(request).values()]`.
  - Модели `PoolCreate(label: str = Field(min_length=1), description: str = "", preset: str = Field(min_length=1))`, `PoolUpdate(label: Optional[str] = Field(default=None, min_length=1), description: Optional[str] = None)`.
  - Ручки:

```python
@app.post("/api/pools")
def create_pool(body: PoolCreate, request: Request, _user: dict = Depends(require_member)) -> dict:
    """Новое направление из пресета: колонки и все вопросы пресета копируются (id с префиксом)."""
    tenant = resolve_tenant(request)
    preset = _pool_or_404(request, body.preset)
    base = slug_from_label(body.label)
    pid, n = base, 2
    while db.get_pool(tenant, pid) is not None:      # занято, в т.ч. tombstone
        pid, n = f"{base}-{n}", n + 1
    row = db.create_pool(tenant, pid, body.label.strip(), body.description.strip(),
                         json.loads(blocks_to_json(preset.blocks)))
    db.copy_nodes(tenant, preset.id, pid)
    return _pool_out(request, pool_from_row(row))


@app.put("/api/pools/{pool_id}")
def update_pool(pool_id: str, body: PoolUpdate, request: Request, _user: dict = Depends(require_member)) -> dict:
    fields = {k: v.strip() for k, v in body.model_dump(exclude_none=True).items()}
    row = db.update_pool(resolve_tenant(request), pool_id, fields)
    if row is None:
        raise HTTPException(status_code=404, detail=f"pool '{pool_id}' not found")
    return _pool_out(request, pool_from_row(row))


@app.delete("/api/pools/{pool_id}")
def delete_pool(pool_id: str, request: Request, _user: dict = Depends(require_member)) -> dict:
    """Удалить направление: вопросы удаляются, сессии остаются в истории, id остаётся занятым."""
    tenant = resolve_tenant(request)
    kept = db.count_sessions(tenant, pool_id)
    removed = db.delete_pool(tenant, pool_id)
    if removed is None:
        raise HTTPException(status_code=404, detail=f"pool '{pool_id}' not found")
    return {"deleted": pool_id, "nodes_removed": removed, "sessions_kept": kept}
```

  Импорты: `from .pools import PoolCfg, block_weights, blocks_to_json, default_pool_id, load_pools, pool_from_row, slug_from_label`.

- [ ] **Step 5: Docs** — `AGENTS.md` раздел API: добавить `POST/PUT/DELETE /api/pools`; в описании `pools.py` (`CLAUDE.md`, `AGENTS.md`) — «pool.yaml — сид, рантайм читает таблицу pools». Комментарий в `main.py` над сидом обновить.

- [ ] **Step 6: Run** `pytest -q` → всё зелёное (включая старые `test_app/test_nodes/test_people/test_pools`). Commit `feat(api): направления в БД — POST/PUT/DELETE /api/pools, пресет копирует колонки и вопросы`.

### Task B4: главная — создать / изменить / удалить направление (режим: субагент + ревью)

**Files:**
- Create: `frontend/src/components/PoolFormModal.tsx`
- Modify: `frontend/src/api.ts`, `frontend/src/pages/HomePage.tsx`, `frontend/src/Router.tsx`, `frontend/src/styles.css`, `frontend/smoke.mjs`

**Interfaces:**
- Consumes: ручки Task B3.
- Produces:
  - `api.createPool({ label, description?, preset }) → Promise<PoolConfig>`, `api.updatePool(id, { label?, description? }) → Promise<PoolConfig>`, `api.deletePool(id) → Promise<{ deleted: string; nodes_removed: number; sessions_kept: number }>`;
  - `PoolFormModal({ mode, pools, pool, onClose, onSaved }: { mode: "create" | "edit"; pools: PoolConfig[]; pool?: PoolConfig; onClose: () => void; onSaved: () => void })`;
  - `HomePage` проп `onChanged: () => void` (обязательный); `Router` передаёт `reloadPools`;
  - DOM: `button.poolcard.poolcard--new`, `button.poolcard__edit`, `button.poolcard__delete`, модалка `.modal .modal__card.poolform`, `select.pool-preset`, `input.poolform__label`, `input.poolform__desc`, кнопка `.poolform__submit`.

- [ ] **Step 1: api.ts** — три метода по образцу `createNode`/`updateNode`/`deleteNode` (`/pools`, `/pools/{id}`).

- [ ] **Step 2: PoolFormModal**

```tsx
import { useState } from "react";
import { api } from "../api";
import type { PoolConfig } from "../types";

// Создание направления (название, описание, набор вопросов = существующее направление, его
// колонки и вопросы копируются) и правка названия/описания. Пресет при правке не предлагается.
export function PoolFormModal({ mode, pools, pool, onClose, onSaved }: {
  mode: "create" | "edit"; pools: PoolConfig[]; pool?: PoolConfig; onClose: () => void; onSaved: () => void;
}) {
  const [label, setLabel] = useState(pool?.label ?? "");
  const [desc, setDesc] = useState(pool?.description ?? "");
  const [preset, setPreset] = useState(pools[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!label.trim() || (mode === "create" && !preset)) return;
    setBusy(true);
    try {
      if (mode === "create") await api.createPool({ label: label.trim(), description: desc.trim(), preset });
      else if (pool) await api.updatePool(pool.id, { label: label.trim(), description: desc.trim() });
      onSaved();
    } catch {
      alert(mode === "create" ? "Не удалось создать направление" : "Не удалось сохранить направление");
      setBusy(false);
    }
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__card poolform" onClick={(e) => e.stopPropagation()}>
        <h3>{mode === "create" ? "Новое направление" : `Направление · ${pool?.label}`}</h3>
        <label className="drawer__field">Название
          <input className="poolform__label" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus /></label>
        <label className="drawer__field">Описание
          <input className="poolform__desc" value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
        {mode === "create" && (
          <label className="drawer__field">Набор вопросов
            <select className="pool-preset" value={preset} onChange={(e) => setPreset(e.target.value)}>
              {pools.map((p) => <option key={p.id} value={p.id}>{p.label} · {p.counts?.nodes ?? 0} вопросов</option>)}
            </select>
          </label>
        )}
        <div className="addform__actions">
          <button className="btn--primary poolform__submit" onClick={submit} disabled={busy || !label.trim()}>
            {mode === "create" ? "Создать" : "Сохранить"}
          </button>
          <button className="iconbtn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}
```

(`.drawer__field`, `.addform__actions`, `.modal`, `.modal__card` уже есть — см. `AddQuestionModal.tsx`; если `.addform__actions` нет в CSS — использовать тот же класс, что там.)

- [ ] **Step 3: HomePage** — state `modal: { mode: "create" } | { mode: "edit"; pool: PoolConfig } | null`. В `.poolcard__actions` после «банк вопросов →»: `button.poolcard__edit` «изменить», `button.poolcard__delete` «удалить» (класс `iconbtn btn--quiet`). Удаление:

```tsx
const remove = async (p: PoolConfig) => {
  const ok = window.confirm(`Удалить направление «${p.label}»? Вопросы (${p.counts?.nodes ?? 0}) будут удалены, сессии (${p.counts?.sessions ?? 0}) останутся в истории.`);
  if (!ok) return;
  try { await api.deletePool(p.id); onChanged(); } catch { alert("Не удалось удалить направление"); }
};
```

Последний элемент сетки `home__pools`: `<button className="poolcard poolcard--new" onClick={() => setModal({ mode: "create" })}>+ Новое направление</button>` — показывается и при `pools.length === 0`? Нет: без пресета создать нечего; при пустом списке остаётся сегодняшняя подсказка. Модалка: `{modal && <PoolFormModal mode={modal.mode} pools={pools} pool={modal.mode === "edit" ? modal.pool : undefined} onClose={() => setModal(null)} onSaved={() => { setModal(null); onChanged(); }} />}`.
`Router.tsx`: везде, где рендерится `HomePage`, передать `onChanged={reloadPools}`.

- [ ] **Step 4: CSS** — `.poolcard--new { align-items: center; justify-content: center; font: inherit; font-weight: 700; color: var(--accent); cursor: pointer; border-style: dashed; min-height: 120px; }`, `.poolcard__edit, .poolcard__delete { font-size: 12px; }`, `.poolform { display: grid; gap: 10px; min-width: 360px; }`.

- [ ] **Step 5: smoke** — после шага 0b (главное меню), до шага 1:

```js
// 0c. CRUD направлений (pool-crud): создать из пресета DE → карточка с тем же числом вопросов →
//     переименовать → удалить (confirm принимается).
const deMeta = await deCard.locator(".poolcard__meta").innerText();
await page.locator(".poolcard--new").click();
await page.waitForSelector(".poolform", { timeout: 3000 });
await page.fill(".poolform__label", "Smoke Pool");
await page.locator(".pool-preset").selectOption("data-engineer");
await page.locator(".poolform__submit").click();
await page.waitForSelector('.poolcard[data-pool="smoke-pool"]', { timeout: 10000 });
const smokeMeta = await page.locator('.poolcard[data-pool="smoke-pool"] .poolcard__meta').innerText();
if (smokeMeta.split("·")[0].trim() !== deMeta.split("·")[0].trim()) fail(`preset copy mismatch: "${smokeMeta}" vs "${deMeta}"`);
await page.locator('.poolcard[data-pool="smoke-pool"] .poolcard__edit').click();
await page.waitForSelector(".poolform", { timeout: 3000 });
await page.fill(".poolform__label", "Smoke Pool 2");
await page.locator(".poolform__submit").click();
await page.waitForFunction(() => document.querySelector('.poolcard[data-pool="smoke-pool"] .poolcard__label')?.textContent === "Smoke Pool 2", null, { timeout: 5000 });
page.once("dialog", (d) => d.accept());
await page.locator('.poolcard[data-pool="smoke-pool"] .poolcard__delete').click();
await page.waitForSelector('.poolcard[data-pool="smoke-pool"]', { state: "detached", timeout: 5000 });
console.log("OK: pool create from preset / rename / delete");
```

Шаг 0b кликает по DE-карточке и уходит на доску — вставить 0c **перед** этим кликом (после проверки `deCard.count()`), а клик на доску оставить после.

- [ ] **Step 6: Гейты** — `npm run build`, smoke → PASSED, `pytest -q`. Commit `feat(home): создание направления из пресета, правка названия/описания, удаление`. PR `feature/pool-crud` → base `feature/home-session-start`, описание по спеку §2.

---

# Часть C — RU / EN (`feature/i18n`, база `feature/pool-crud`)

### Task C1: каркас i18n и переключатель (режим: инлайн)

**Files:**
- Create: `frontend/src/i18n.tsx`, `frontend/src/i18n/en.ts`, `frontend/src/components/LangSwitch.tsx`
- Modify: `frontend/src/main.tsx`, `frontend/src/pages/PageShell.tsx`, `frontend/src/pages/HomePage.tsx` (шапка), `frontend/src/pages/BoardPage.tsx` (ряд 1 рядом с ⚙), `frontend/src/styles.css`, `frontend/smoke.mjs`

**Interfaces:**
- Produces:
  - `i18n.tsx`: `type Lang = "ru" | "en"`, `getLang(): Lang`, `t(s: string, vars?: Record<string, string | number>): string` (модульная функция — годится и для `report.ts`), `LangProvider({ children })`, `useLang(): [Lang, (l: Lang) => void]`, `useT(): typeof t` (подписан на контекст → компонент перерисовывается при смене языка);
  - `i18n/en.ts`: `export const EN: Record<string, string>` — ключ = русская строка **ровно как в коде**; подстановки `{name}`;
  - `LangSwitch()` → `button.langswitch` с текстом `EN` (когда ru) / `RU` (когда en), `aria-label="Switch language"`.

- [ ] **Step 1: i18n.tsx**

```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { EN } from "./i18n/en";

// Локализация без библиотек: ключ — русская строка как в коде, перевод — из словаря EN.
// Нет перевода → показываем русскую строку (ничего не ломается). Подстановки: {name}.
export type Lang = "ru" | "en";
type Vars = Record<string, string | number>;

let current: Lang = (() => { try { return localStorage.getItem("lang") === "en" ? "en" : "ru"; } catch { return "ru"; } })();

export function getLang(): Lang { return current; }

export function t(s: string, vars?: Vars): string {
  const out = current === "en" ? (EN[s] ?? s) : s;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : out;
}

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: current, setLang: () => void 0 });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);
  const setLang = useCallback((l: Lang) => {
    current = l;
    try { localStorage.setItem("lang", l); } catch { /* приватный режим */ }
    document.documentElement.lang = l;
    setLangState(l);
  }, []);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useLang(): [Lang, (l: Lang) => void] {
  const { lang, setLang } = useContext(LangCtx);
  return [lang, setLang];
}

/** t, привязанный к контексту: компонент перерисуется при смене языка. */
export function useT(): typeof t {
  useContext(LangCtx);
  return t;
}
```

`document.documentElement.lang = current` выставить и при первой загрузке (в `LangProvider` через `useEffect` один раз).

- [ ] **Step 2: en.ts** — начальный словарь с опорными фразами (остальное дополняет Task C2):

```ts
// Ключ — русская строка ровно как в коде (см. i18n.tsx). Группы — по файлам.
export const EN: Record<string, string> = {
  // HomePage
  "Интервью · доска вопросов": "Interview · question board",
  "Направления": "Tracks",
  "Разделы": "Sections",
  "Начать интервью": "Start interview",
  "банк вопросов →": "question bank →",
  "+ Новое направление": "+ New track",
  // PageShell / BoardPage
  "← Меню": "← Menu",
};
```

- [ ] **Step 3: LangSwitch**

```tsx
import { useLang } from "../i18n";

export function LangSwitch() {
  const [lang, setLang] = useLang();
  return (
    <button className="langswitch iconbtn btn--quiet" aria-label="Switch language" aria-pressed={lang === "en"}
      onClick={() => setLang(lang === "en" ? "ru" : "en")} title={lang === "en" ? "Русский" : "English"}>
      {lang === "en" ? "RU" : "EN"}
    </button>
  );
}
```

- [ ] **Step 4: Разместить** — `main.tsx`: `<LangProvider><AuthGate /></LangProvider>`; `PageShell`: после `pageshell__title` (внутри/рядом с `pageshell__actions`) `<LangSwitch />`; `HomePage` шапка: `<LangSwitch />` справа от заголовка (`pageshell__actions`); `BoardPage` ряд 1: перед `div.settings.topbar__settings`. Опорные фразы в `HomePage`/`PageShell`/`BoardPage` ряд 1 обернуть в `t()` (через `const t = useT()`). CSS: `.langswitch { font-size: 11px; letter-spacing: .08em; }`.

- [ ] **Step 5: smoke** — после шага 0c (до клика на доску):

```js
// 0d. RU/EN (i18n): переключатель на главной меняет опорные подписи и возвращает обратно.
await page.locator(".langswitch").first().click();
await page.waitForFunction(() => document.querySelector(".home__h2")?.textContent === "Tracks", null, { timeout: 3000 });
await page.locator(".langswitch").first().click();
await page.waitForFunction(() => document.querySelector(".home__h2")?.textContent === "Направления", null, { timeout: 3000 });
console.log("OK: RU/EN switch");
```

- [ ] **Step 6:** `npm run build`, smoke → PASSED. Commit `feat(i18n): каркас RU/EN — словарь, LangProvider, переключатель в шапках`.

### Task C2: перевод всех строк интерфейса (режим: субагент + ревью; можно два субагента — страницы и компоненты — без общих файлов кроме `en.ts`, поэтому последовательно)

**Files:**
- Modify: `frontend/src/pages/{HomePage,BoardPage,BankPage,CandidatesPage,SessionsPage,ConnectPage,PageShell}.tsx`, `frontend/src/components/{AddQuestionModal,BankBrowser,DetailDrawer,Login,PoolFormModal,QuestionNode,SettingsMenu,ShortcutsHelp,StartSessionForm,UploadModal,BlockGroupNode,SubHeadNode,BandsNode}.tsx` (те, где есть кириллица в JSX/атрибутах/строках), `frontend/src/Router.tsx`, `frontend/src/AuthGate.tsx`, `frontend/src/report.ts`, `frontend/src/layout.ts` (если кириллица в подписях), `frontend/src/i18n/en.ts`

**Interfaces:**
- Consumes: `useT`, `t` из Task C1.
- Produces: полный словарь `EN`; ни одной кириллической строки интерфейса вне `t()`.

- [ ] **Step 1: Инвентаризация** — `grep -n "[А-Яа-яЁё]" frontend/src/<file>` по каждому файлу; комментарии (`//`, `/* */`, `{/* */}`) не трогать.
- [ ] **Step 2: Правило замены** — JSX-текст `>Скачать<` → `>{t("Скачать")}<`; атрибуты `title="…"`/`placeholder="…"`/`aria-label="…"` → `title={t("…")}`; шаблонные строки с переменными → `t("оценено {done} / {total} ({pct}%)", { done, total, pct })`; массивы/константы подписей (`KIND_LABEL`, тексты подсказок в `ShortcutsHelp`) — оборачивать в месте рендера, не в константе (константа модульная, язык меняется в рантайме); `report.ts` — модульная `t` из `../i18n` (не хук). `alert()`/`confirm()` тексты — тоже через `t`.
- [ ] **Step 3: Словарь** — каждая новая строка добавляется в `EN` в группу своего файла; перевод короткий, в стиле UI (Title case не нужен: «Скачать» → «Download», «Начать сессию» → «Start session», «Кандидаты» → «Candidates», «Сессии» → «Sessions», «Подключение» → «Connect», «Банк вопросов» → «Question bank», «Настройки» → «Settings», «Выйти» → «Leave», «оценено» → «scored», «средн.» → «avg»).
- [ ] **Step 4: Проверка** — `npm run build`; `grep -rn "[А-Яа-яЁё]" frontend/src --include='*.tsx' --include='*.ts' | grep -v '^\S*:\s*//' | grep -v 't("' | grep -v "i18n/en.ts"` — остаток разобрать вручную (допустимы комментарии и содержимое `en.ts`); smoke → PASSED (RU-путь) плюс ручной прогон в EN: `localStorage.setItem("lang","en")` и переход по всем страницам — консоль без ошибок.
- [ ] **Step 5: Commit** `feat(i18n): английский интерфейс — страницы, компоненты, отчёт`. PR `feature/i18n` → base `feature/pool-crud`, описание по спеку §3.

---

# Часть D — пул «Data Engineer X5» (`feature/pool-de-x5`, база `dev`, worktree параллельно A–C)

### Task D1: pool.yaml и карточки (режим: субагент + ревью контента)

**Files:**
- Create: `content/data-engineer-x5/pool.yaml`, `content/data-engineer-x5/{python,sql,spark,airflow,clickhouse,ai}/x5-*.md`
- Modify: `backend/tests/test_app.py` (параметризованный тест импорта), `frontend/smoke.mjs` (шаг 25), `AGENTS.md`/`CLAUDE.md` (упоминание пулов и под-колонок X5)

**Interfaces:**
- Consumes: формат ноды из `AGENTS.md` «Модель ноды и формат контента»; образец — `content/system-analyst/integration/sa-integration-01.md`; `pool.yaml` — как в спеке §4.
- Produces: пул `data-engineer-x5` с 30–36 нодами, импорт без ошибок.

- [ ] **Step 1: Источник** — прочитать `~/dev/docs/rabota/interviews/interview-playbook.md` целиком (`cat`). Для сверки «что реально задавалось»: строки `**Охват:**` в `~/dev/docs/rabota/interviews/*/interview_review_blocks.md` и таблицы «Хронометраж» в `transcript_*.md` — **только заголовки блоков**; тексты про кандидатов не читать и не переносить.
- [ ] **Step 2: pool.yaml** — ровно как в спеке §4 (id `data-engineer-x5` = имя каталога).
- [ ] **Step 3: Карточки** — писать скриптом на `python-frontmatter`:

```python
import frontmatter
from pathlib import Path
def write_node(path: Path, meta: dict, question: str, answer: str, task=False):
    post = frontmatter.Post(f"## {'Задача' if task else 'Вопрос'}\n{question.strip()}\n\n## {'Эталон' if task else 'Ответ'}\n{answer.strip()}\n", **meta)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(frontmatter.dumps(post) + "\n", encoding="utf-8")
```

  Раскладка (id = имя файла):
  - `python/x5-python-01..04.md` — задачи 2.1–2.4, `kind: task`, `starterCode` = данные/сигнатура из плейбука, `rubric` 3–5 пунктов (структура решения, корнер-кейсы, что должно быть произнесено), `difficulty`: 2.1 junior, 2.2 middle, 2.3 senior (★), 2.4 middle; `weight`: 2.1/2.3 — 5, остальные 3; теги например `memory`, `quality`, `concurrency` не подходят → выбирать из списка честно (`memory` для 2.2, `quality` для 2.1/2.3).
  - `sql/x5-sql-01..02.md` — задачи 3.1–3.2 (`subblock: queries`, `kind: task`, `starterCode` = DDL/описание таблицы `bookings`, `rubric` из эталона), теги `sql`.
  - `sql/x5-idx-01..05.md` + `x5-explain-01.md` — индексы Q1–Q5 и `EXPLAIN ANALYZE` (`subblock: indexes`), теги `sql`, `optimization`, `storage`.
  - `spark/x5-spark-01..08.md` — Q1–Q8 (Q2 и Q8 — `senior`, weight 5), теги `distributed`, `partitioning`, `memory`, `optimization`.
  - `airflow/x5-airflow-01..06.md` — Q1–Q6, теги `orchestration`, `consistency`, `architecture`.
  - `clickhouse/x5-clickhouse-01..04.md` — Q1–Q4, теги `storage`, `partitioning`, `architecture`.
  - `ai/x5-ai-01.md` — один вопрос «Как используешь AI-ассистента в работе и где не доверяешь» (`base`, weight 1, тег `quality`).
  - Вопросы из транскриптов, которых нет в плейбуке (если найдутся по заголовкам блоков) — в соответствующий блок с продолжением нумерации.
  - `title` — 3–6 слов; `topic` — slug латиницей (`driver-role`, `broadcast-join`, `sensors`, …).
  - Ответ — связная проза 120–350 слов из буллетов плейбука с раскрытием «*Добить:*» как продолжения ответа; **без** «Калибровка», дат, имён, отсылок к кандидатам, без «у нас» (проектные детали X5 не переносить).
- [ ] **Step 4: Тест** — в `test_app.py`:

```python
ALL_POOLS = sorted(p.name for p in CONTENT_ROOT.iterdir() if (p / "pool.yaml").exists())

@pytest.mark.parametrize("pool_id", ALL_POOLS)
def test_every_pool_imports_without_errors(pool_id):
    nodes, errors = load_pool_content(load_pools(CONTENT_ROOT)[pool_id])
    assert errors == [], f"{pool_id}: {errors}"
    assert len(nodes) >= 10
    assert all(n.pool == pool_id for n in nodes)
    assert all(n.title and 1 <= len(n.tags) <= 3 for n in nodes)
```

  Плюс `assert "data-engineer-x5" in ALL_POOLS` в отдельном тесте.
- [ ] **Step 5: smoke шаг 25** — убрать `if`, проверить обе карточки на главной и обе доски:

```js
// 25. Другие пулы рисуют СВОИ колонки: system-analyst и data-engineer-x5 (независимые пулы).
for (const [pid, needle] of [["system-analyst", "требования"], ["data-engineer-x5", "python"]]) {
  await page.goto(URL + "#/", { waitUntil: "load" });
  await page.waitForSelector(`.poolcard[data-pool="${pid}"]`, { timeout: 10000 });
  await page.goto(URL + `#/board/${pid}`, { waitUntil: "load" });
  await page.waitForSelector(".bgroup__header", { timeout: 10000 });
  const heads = await page.locator(".bgroup__header").allInnerTexts();
  if (!heads.some((h) => h.toLowerCase().includes(needle))) fail(`${pid} board lacks its own blocks: ${heads.join(" | ")}`);
  console.log(`OK: ${pid} board has its own blocks (${heads.length})`);
}
```

- [ ] **Step 6: Гейты** — `pytest -q`; проверка тегов скриптом (все теги ∈ 17); `grep -rn "Калибровка\|кандидат\|2026-0" content/data-engineer-x5` — пусто; smoke на локальном сервере с свежей БД (сид X5). Commit `feat(content): пул «Data Engineer X5» — вопросы и задачи скрипта интервью`. PR `feature/pool-de-x5` → `dev`.

### Task D2: ревью контента (режим: субагент-ревьюер, read-only)

- [ ] Проверить каждую карточку: техническая корректность ответа, соответствие вопросу плейбука, отсутствие персональных данных и проектных деталей, теги из списка, `difficulty`/`weight` по правилам спека, frontmatter нормализован (`python-frontmatter` перечитывает без изменений). Замечания — исправить в той же ветке отдельным коммитом `fix(content): …`.

---

## Порядок и мерж

1. Task D1–D2 стартуют сразу в worktree от `dev` (параллельно A).
2. A1 → A2 → A3 → A4 → PR A. Затем B1 → B2 → B3 → B4 → PR B (base A). Затем C1 → C2 → PR C (base B).
3. Мерж после зелёного CI: A (squash), B (`git merge -s ours origin/dev` в ветку, retarget на `dev`, squash), C (так же), затем D (`git merge origin/dev` обычный, конфликт в `smoke.mjs`/`test_app.py` разрешить вручную, squash). Затем `dev → main` merge-коммитом. После мержа закрыть GitHub-issue на каждую фичу (учёт фич — Issues, см. `AGENTS.md`).
