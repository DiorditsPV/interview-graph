// Набор витринных скриншотов: сеет демо-данные через API и снимает экраны в docs/screenshots.
//
// Требует запущенного сервера (по умолчанию :8000) и собранного фронта:
//   ./run.sh --build           # терминал 1
//   cd frontend && npm run shots
//
// Демо-данные (кандидаты «Кандидат А/Б · демо») пишутся в ту же БД, что отдаёт сервер,
// поэтому снимать лучше на отдельной БД и со своим паролем owner'а:
//   INTERVIEW_DB_PATH=$PWD/backend/demo.db INTERVIEW_OWNER_PASSWORD=interview-dev ./run.sh
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const BASE = process.env.SHOTS_URL || "http://localhost:8000";
const OUTDIR = process.env.SHOTS_DIR || path.resolve("../docs/screenshots");
const VIEW = { width: 1600, height: 1000 };

// ---------- сид демо-данных ----------

const OWNER_EMAIL = process.env.SHOTS_OWNER_EMAIL || "owner@interview.local";
const OWNER_PASSWORD = process.env.SHOTS_OWNER_PASSWORD || "interview-dev";

// API за auth-гейтом: логинимся owner'ом и таскаем session-cookie руками
// (fetch в Node не хранит cookie-jar между вызовами).
let cookie = null;

const api = async (method, url, body) => {
  const r = await fetch(BASE + url, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status} ${await r.text()}`);
  const setCookie = r.headers.getSetCookie?.()[0];
  if (setCookie) cookie = setCookie.split(";")[0];
  return r.json();
};

const login = async () => {
  await api("POST", "/api/auth/login", { email: OWNER_EMAIL, password: OWNER_PASSWORD });
  if (!cookie) throw new Error("login прошёл, но session-cookie не пришла");
};

// Детерминированный хеш строки → 0..99: одинаковые скрины при каждом прогоне.
const h = (s) => {
  let x = 7;
  for (const ch of s) x = (x * 31 + ch.codePointAt(0)) % 1000003;
  return x % 100;
};

/**
 * Профиль кандидата: сила по блокам (средний балл) + охват (доля оценённых).
 * Оценка = сила блока со штрафом за сложность и небольшим детерминированным разбросом.
 */
const profile = (nodes, strength, coverage, salt, forceIds = []) => {
  const DIFF_PENALTY = { base: 0.6, junior: 0.2, middle: -0.2, senior: -0.9 };
  const force = new Set(forceIds);
  const out = [];
  for (const n of nodes) {
    if (!force.has(n.id) && h(salt + n.id) >= coverage) continue;
    const jitter = ((h(salt + n.id + "j") % 5) - 2) / 2; // -1 … +1 с шагом 0.5
    const raw = (strength[n.block] ?? 3) + DIFF_PENALTY[n.difficulty] + jitter;
    out.push({ node_id: n.id, score: Math.max(1, Math.min(5, Math.round(raw))) });
  }
  return out;
};

async function seed() {
  await login();
  const { nodes } = await api("GET", "/api/graph");
  const existing = await api("GET", "/api/candidates");
  const byName = new Map(existing.map((c) => [c.name, c]));

  const mk = async (name, position, seniority) =>
    byName.get(name) ?? (await api("POST", "/api/candidates", { name, position, seniority }));

  const a = await mk("Кандидат А · демо", "Data Engineer", "middle");
  const b = await mk("Кандидат Б · демо", "Data Engineer", "junior+");

  const [iv] = await api("GET", "/api/interviewers");

  // Заметки интервьюера на нескольких вопросах: видно и в drawer, и в итоговом отчёте.
  const notes = {
    "spark-batch-01": "Назвал wide-трансформации и AQE; про bucketing напомнил я. Практика есть.",
    "af-orchestration-01": "Чёткое определение идемпотентности, привёл пример с backfill.",
    "sql-02": "Оконку написал сразу, про ничьи и RANK вспомнил после наводящего вопроса.",
    "pg-isolation-01": "Уровни изоляции знает, MVCC — поверхностно.",
  };

  // Идемпотентно: повторный прогон переиспользует сессию кандидата, а не плодит новые.
  const sessions = await api("GET", "/api/sessions");
  const run = async (cand, strength, coverage, salt, forceIds = []) => {
    const prev = sessions.find((s) => s.candidate === cand.name);
    if (prev) {
      const full = await api("GET", `/api/sessions/${prev.id}`);
      if (Object.keys(full.scores).length > 0) return full;
    }
    const s = prev ?? (await api("POST", "/api/sessions", {
      candidate: cand.name,
      candidate_id: cand.id,
      interviewer_id: iv?.id ?? null,
    }));
    for (const { node_id, score } of profile(nodes, strength, coverage, salt, forceIds))
      await api("POST", `/api/sessions/${s.id}/score`, { node_id, score, note: notes[node_id] });
    return api("GET", `/api/sessions/${s.id}`);
  };

  // Кандидат А — крепкие БД и оркестрация, слабее платформа: видно на радаре сравнения.
  // Принудительно добираем вопросы с заметками (иначе заметка может не попасть в охват)
  // и весь блок «Платформа»: в нём 5 нод, при случайном охвате блок остаётся почти пустым
  // и сравнение кандидатов по нему ничего не показывает.
  const platform = nodes.filter((n) => n.block === "platform").map((n) => n.id);
  const sA = await run(
    a,
    { databases: 4.4, frameworks: 4.0, python: 3.6, platform: 2.2 },
    62,
    "a",
    [...Object.keys(notes), ...platform],
  );
  // Кандидат Б — обратный профиль и меньший охват (интервью «в процессе»).
  const sB = await run(b, { databases: 3.0, frameworks: 3.2, python: 4.2, platform: 4.2 }, 45, "b", platform);

  console.log(
    `seeded: A#${sA.id} ${Object.keys(sA.scores).length} оценок · B#${sB.id} ${Object.keys(sB.scores).length} оценок`,
  );
  return { sA, sB, nodes };
}

// ---------- съёмка ----------

const shot = async (page, name, opts = {}) => {
  const file = path.join(OUTDIR, name);
  await page.screenshot({ path: file, ...opts });
  console.log("  ✓", name);
};

const settle = (page, ms = 600) => page.waitForTimeout(ms);

/** Развернуть доску так, чтобы колонки не уходили под панель фильтров справа. */
async function frameBoard(page, { zoomOut = 1, panLeft = 170 } = {}) {
  await page.click(".react-flow__controls-fitview");
  await settle(page, 500);
  const box = await page.locator(".react-flow__pane").boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  for (let i = 0; i < zoomOut; i++) {
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, 240);
    await settle(page, 250);
  }
  if (panLeft) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - panLeft, cy, { steps: 12 });
    await page.mouse.up();
  }
  await settle(page, 400);
}

async function main() {
  await mkdir(OUTDIR, { recursive: true });
  const { sA, sB } = await seed();

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // Доска за auth-гейтом: один раз логинимся в UI, дальше cookie живёт в контексте.
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".login__card", { timeout: 10000 });
  await page.fill('.login__input[type="email"]', OWNER_EMAIL);
  await page.fill('.login__input[type="password"]', OWNER_PASSWORD);
  await page.click(".login__card button[type=submit]");
  await page.waitForSelector(".qnode", { timeout: 15000 });

  const open = async (theme, query = `?session=${sA.id}`) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("theme", t);
      localStorage.setItem("bgVariant", "dots");
      localStorage.removeItem("draftScores");
      localStorage.removeItem("hiddenIds");
      localStorage.removeItem("agendaOpen");
    }, theme);
    // networkidle не годится: сессия держит открытый SSE-стрим /events.
    await page.goto(BASE + "/" + query, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".qnode--scored", { timeout: 15000 });
    await settle(page, 800);
  };

  // 1. Доска целиком, тёмная тема, сессия в разгаре.
  await open("dark");
  await frameBoard(page, { zoomOut: 1 });
  await shot(page, "01-board-dark.png");

  // 2. Оценка вопроса: HUD снизу + карточки со звёздами крупным планом.
  await page.locator(".qnode__title", { hasText: "Shuffle в Spark" }).first().click();
  await settle(page, 300);
  await page.keyboard.press("4");
  await settle(page, 300);
  await page.keyboard.press("Escape"); // закрыть drawer, «текущий» вопрос остаётся в HUD
  await settle(page, 400);
  const cardBox = await page.locator(".qnode--current").boundingBox();
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, -240);
    await settle(page, 200);
  }
  // Сдвиг вправо: после зума левая колонка иначе обрезается по краю кадра.
  const pane2 = await page.locator(".react-flow__pane").boundingBox();
  await page.mouse.move(pane2.x + pane2.width / 2, pane2.y + pane2.height / 2);
  await page.mouse.down();
  await page.mouse.move(pane2.x + pane2.width / 2 + 90, pane2.y + pane2.height / 2, { steps: 10 });
  await page.mouse.up();
  await settle(page, 500);
  await shot(page, "02-scoring.png");

  // 3. Drawer рядом с доской: полный текст вопроса, теги, оценка и заметка интервьюера.
  await open("dark");
  await page.locator(".fp__collapse").click(); // свернуть список тегов: панель не перекрывает доску
  await settle(page, 300);
  const zoomBox = await page.locator(".qnode__title", { hasText: "Shuffle в Spark" }).first().boundingBox();
  await page.mouse.move(zoomBox.x, zoomBox.y);
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, -240);
    await settle(page, 200);
  }
  await page.locator(".qnode__title", { hasText: "Shuffle в Spark" }).first().click();
  await page.waitForSelector(".drawer", { timeout: 5000 });
  await settle(page, 700);
  await shot(page, "03-drawer.png");

  // 4. Тот же вопрос на весь экран: задача со стартовым кодом, эталоном и критериями.
  await page.keyboard.press("Escape");
  await page.locator(".qnode__title", { hasText: "Топ-3 SKU по регионам" }).first().click();
  await page.waitForSelector(".drawer", { timeout: 5000 });
  await page.locator(".drawer__actions button", { hasText: "на весь экран" }).click();
  await page.waitForSelector(".drawer--full", { timeout: 5000 });
  await settle(page, 700);
  await shot(page, "04-task.png");

  // 5. Банк вопросов: поиск по всем 61 вопросу с раскрытием ответа.
  await page.keyboard.press("Escape");
  await page.locator(".contentbar .bankscreenbtn").click();
  await page.waitForSelector(".bankbrowser", { timeout: 5000 });
  await page.locator(".bankbrowser__search").fill("spark");
  await settle(page, 400);
  await page.locator(".bankrow", { hasText: "Shuffle в Spark" }).first().click();
  await settle(page, 500);
  await shot(page, "05-bank.png");
  await page.keyboard.press("Escape");

  // 7. Светлая тема.
  await open("light");
  await frameBoard(page, { zoomOut: 1 });
  await shot(page, "07-board-light.png");

  // 8. Итоговый HTML-отчёт по сессии (генерируется на клиенте, самодостаточный файл).
  const dl = page.waitForEvent("download", { timeout: 15000 });
  await page.locator(".dlbtn").click();
  const report = await dl;
  const reportPath = path.join(os.tmpdir(), "interview-report-demo.html");
  await report.saveAs(reportPath);
  const rp = await ctx.newPage();
  await rp.setViewportSize({ width: 1200, height: 980 });
  await rp.goto("file://" + reportPath, { waitUntil: "networkidle" });
  await settle(rp, 600);
  await shot(rp, "08-report.png", { fullPage: false });
  await rp.close();

  await browser.close();
  await writeFile(
    path.join(OUTDIR, "README.md"),
    "Скриншоты собираются скриптом `frontend/shots.mjs` (`npm run shots`) на демо-сессиях.\n" +
      "Кандидаты в кадре — синтетические («Кандидат А/Б · демо»).\n",
  );
  console.log("готово →", OUTDIR);
}

await main();
