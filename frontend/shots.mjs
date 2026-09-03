// Набор витринных скриншотов для README: сеет демо-данные через API и снимает экраны
// в docs/screenshots. Интерфейс переключается в английский (localStorage lang=en), поэтому
// сервер поднимают на англоязычном демо-контенте demo/content-en — тогда и вопросы в кадре
// на английском.
//
// Требует запущенного сервера (по умолчанию :8000) и собранного фронта:
//   INTERVIEW_CONTENT_DIR=$PWD/demo/content-en INTERVIEW_DB_PATH=$PWD/backend/demo.db \
//   INTERVIEW_OWNER_PASSWORD=interview-dev ./run.sh --build     # терминал 1
//   cd frontend && npm run shots                                # терминал 2
//
// Демо-кандидаты («… · demo») пишутся в ту же БД, что отдаёт сервер, — снимай на отдельной.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const BASE = process.env.SHOTS_URL || "http://localhost:8000";
const OUTDIR = process.env.SHOTS_DIR || path.resolve("../docs/screenshots");
const POOL = process.env.SHOTS_POOL || "data-engineer";
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

const login = () => api("POST", "/api/auth/login", { email: OWNER_EMAIL, password: OWNER_PASSWORD });

// Детерминированный «профиль кандидата»: охват и баллы — функция от id ноды, поэтому
// повторный прогон даёт тот же кадр (диффы скриншотов не шумят).
const h = (s) => {
  let x = 0;
  for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) % 1000;
  return x;
};

const profile = (nodes, strength, coverage, salt, forceIds = []) => {
  const DIFF_PENALTY = { base: 0.6, junior: 0.2, middle: -0.2, senior: -0.9 };
  const force = new Set(forceIds);
  const out = [];
  for (const n of nodes) {
    if (!force.has(n.id) && h(salt + n.id) >= coverage * 10) continue;
    const jitter = ((h(salt + n.id + "j") % 5) - 2) / 2; // -1 … +1 с шагом 0.5
    const raw = (strength[n.block] ?? 3) + DIFF_PENALTY[n.difficulty] + jitter;
    out.push({ node_id: n.id, score: Math.max(1, Math.min(5, Math.round(raw))) });
  }
  return out;
};

async function seed() {
  await login();
  const { nodes } = await api("GET", `/api/graph?pool=${POOL}`);
  if (!nodes.length) throw new Error(`пул ${POOL} пуст — поднимите сервер на demo/content-en`);
  const existing = await api("GET", "/api/candidates");
  const byName = new Map(existing.map((c) => [c.name, c]));

  const mk = async (name, position, seniority) =>
    byName.get(name) ?? (await api("POST", "/api/candidates", { name, position, seniority }));

  const a = await mk("Alex Rivera · demo", "Data Engineer", "middle");
  const b = await mk("Jordan Lee · demo", "Data Engineer", "junior+");

  // Интервьюер: сид заводит «Я» (русский), а имя видно в шапке отчёта — для витрины нужен английский.
  const ivs = await api("GET", "/api/interviewers");
  const iv =
    ivs.find((x) => x.name === "Sam Okafor") ??
    (await api("POST", "/api/interviewers", { name: "Sam Okafor", role: "Tech Lead" }));

  // Заметки интервьюера на нескольких вопросах: видны и в drawer, и в итоговом отчёте.
  // Ноды берём по блокам, а не по захардкоженным id: демо-контент может меняться.
  const pick = (block, n) => nodes.filter((x) => x.block === block).slice(0, n).map((x) => x.id);
  const noted = [...pick("frameworks", 2), ...pick("databases", 2)];
  const NOTES = [
    "Named the wide transformations right away; brought up AQE without prompting.",
    "Solid on idempotent backfills, walked through a re-run scenario.",
    "Wrote the window function immediately, ties needed a nudge.",
    "Knows the isolation levels, MVCC only on the surface.",
  ];
  const notes = Object.fromEntries(noted.map((id, i) => [id, NOTES[i % NOTES.length]]));

  // Идемпотентно: повторный прогон переиспользует сессию кандидата, а не плодит новые.
  const sessions = await api("GET", `/api/sessions?pool=${POOL}`);
  const run = async (cand, strength, coverage, salt, forceIds = []) => {
    const prev = sessions.find((s) => s.candidate === cand.name);
    if (prev) {
      const full = await api("GET", `/api/sessions/${prev.id}`);
      if (Object.keys(full.scores).length > 0) return full;
    }
    const s =
      prev ??
      (await api("POST", "/api/sessions", {
        pool: POOL,
        candidate: cand.name,
        candidateId: cand.id,
        interviewerId: iv.id,
      }));
    for (const { node_id, score } of profile(nodes, strength, coverage, salt, forceIds))
      await api("POST", `/api/sessions/${s.id}/score`, { nodeId: node_id, score, note: notes[node_id] });
    return api("GET", `/api/sessions/${s.id}`);
  };

  // Кандидат А — крепкие БД и оркестрация, слабее платформа: в отчёте видны сильные/слабые разделы.
  const platform = nodes.filter((n) => n.block === "platform").map((n) => n.id);
  const sA = await run(
    a,
    { databases: 4.4, frameworks: 4.0, python: 3.6, platform: 2.2 },
    62,
    "a",
    [...noted, ...platform],
  );
  // Кандидат Б — обратный профиль и меньший охват (интервью «в процессе»).
  const sB = await run(b, { databases: 3.0, frameworks: 3.2, python: 4.2, platform: 4.2 }, 45, "b", platform);

  console.log(
    `seeded: A#${sA.id} ${Object.keys(sA.scores).length} scores · B#${sB.id} ${Object.keys(sB.scores).length} scores`,
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
  const { sA } = await seed();

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // Доска за auth-гейтом: один раз логинимся в UI, дальше cookie живёт в контексте.
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".login__card", { timeout: 10000 });
  await page.fill('.login__input[type="email"]', OWNER_EMAIL);
  await page.fill('.login__input[type="password"]', OWNER_PASSWORD);
  await page.click(".login__card button[type=submit]");
  await page.waitForSelector(".poolcard", { timeout: 15000 });
  // Английский интерфейс: скриншоты идут в англоязычный README. Язык читается на старте
  // приложения, поэтому после записи в localStorage нужна перезагрузка.
  await page.evaluate(() => localStorage.setItem("lang", "en"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".poolcard", { timeout: 15000 });

  const open = async (theme, query = `?session=${sA.id}`) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("lang", "en");
      localStorage.setItem("theme", t);
      localStorage.setItem("bgVariant", "dots");
      localStorage.removeItem("agendaOpen");
    }, theme);
    // networkidle не годится: сессия держит открытый SSE-стрим /events.
    await page.goto(`${BASE}/#/board/${POOL}${query}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".qnode--scored", { timeout: 15000 });
    await settle(page, 800);
  };

  // 01. Главная: направления как входы, разделы проведения интервью.
  await page.goto(BASE + "/#/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".poolcard", { timeout: 10000 });
  await settle(page, 400);
  await shot(page, "01-home.png");

  // 02. Настройка интервью: кандидат, разделы, уровни, режим набора.
  await page.locator(`.poolcard[data-pool="${POOL}"] .poolcard__start`).click();
  await page.waitForSelector(".setup__summary", { timeout: 10000 });
  await page.locator(".setup__name").fill("Alex Rivera");
  await page.locator(".setup .cand-pos").fill("Data Engineer");
  await page.locator(".setup .cand-sen").fill("middle");
  await settle(page, 400);
  await shot(page, "02-setup.png");

  // 03. Доска в разгаре сессии, светлая тема.
  await open("light");
  await frameBoard(page, { zoomOut: 0 });
  await shot(page, "03-board.png");

  // 04. Оценка вопроса: HUD снизу + карточки крупным планом.
  const first = page.locator(".qnode:not(.qnode--dimmed) .qnode__title").first();
  await first.click();
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
  const pane2 = await page.locator(".react-flow__pane").boundingBox();
  await page.mouse.move(pane2.x + pane2.width / 2, pane2.y + pane2.height / 2);
  await page.mouse.down();
  await page.mouse.move(pane2.x + pane2.width / 2 + 90, pane2.y + pane2.height / 2, { steps: 10 });
  await page.mouse.up();
  await settle(page, 500);
  await shot(page, "04-scoring.png");

  // 05. Drawer рядом с доской: полный текст, теги, оценка и заметка интервьюера.
  await open("light");
  const noteCard = page.locator(".qnode--scored").first();
  const zoomBox = await noteCard.boundingBox();
  await page.mouse.move(zoomBox.x, zoomBox.y);
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, -240);
    await settle(page, 200);
  }
  await page.locator(".qnode--scored .qnode__title").first().click();
  await page.waitForSelector(".drawer", { timeout: 5000 });
  await settle(page, 700);
  await shot(page, "05-drawer.png");

  // 06. Задача на весь экран: условие, стартовый код, эталон и критерии.
  await page.keyboard.press("Escape");
  await open("light");
  const taskCard = page.locator(".qnode", { has: page.locator(".qnode__kind--task") }).first();
  await taskCard.locator(".qnode__title").click();
  await page.waitForSelector(".drawer", { timeout: 5000 });
  await page.locator(".drawer__actions button", { hasText: "Full screen" }).click();
  await page.waitForSelector(".drawer--full", { timeout: 5000 });
  await settle(page, 700);
  await shot(page, "06-task.png");

  // 07. Банк вопросов: поиск по всему банку с раскрытым ответом.
  await page.keyboard.press("Escape");
  await page.goto(`${BASE}/#/bank/${POOL}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".bankbrowser--embedded", { timeout: 10000 });
  await page.locator(".bankbrowser__search").fill("spark");
  await settle(page, 400);
  await page.locator(".bankrow").first().click();
  await settle(page, 500);
  await shot(page, "07-bank.png");

  // 08. Итог интервью: решение и общий комментарий.
  await open("light");
  await page.locator(".session .cta-done").click();
  await page.waitForSelector(".finish", { timeout: 5000 });
  await page.locator('.finish input[value="hire"]').check();
  await page.locator(".finish__summary").fill(
    "Strong on storage internals and orchestration; Python is solid but platform topics are thin. Worth a follow-up on Kubernetes.",
  );
  await settle(page, 500);
  await shot(page, "08-verdict.png");
  await page.locator(".finish__submit").click();
  await page.waitForSelector(".session__status", { timeout: 5000 });
  await settle(page, 400);

  // 09. Итоговый HTML-отчёт (генерируется на клиенте, самодостаточный файл).
  const dl = page.waitForEvent("download", { timeout: 15000 });
  await page.locator(".topbar .exportbtn").click();
  await page.locator(".exportmenu .dlbtn").click();
  const report = await dl;
  const reportPath = path.join(os.tmpdir(), "interview-report-demo.html");
  await report.saveAs(reportPath);
  const rp = await ctx.newPage();
  await rp.setViewportSize({ width: 1200, height: 1000 });
  await rp.goto("file://" + reportPath, { waitUntil: "networkidle" });
  await settle(rp, 600);
  await shot(rp, "09-report.png", { fullPage: false });
  await rp.close();

  // 10. Редактор структуры направления: разделы, подкатегории, палитра, drag & drop.
  await page.goto(BASE + "/#/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".poolcard", { timeout: 10000 });
  await page.locator(`.poolcard[data-pool="${POOL}"] .poolcard__menu`).click();
  await page.locator(`.poolcard[data-pool="${POOL}"] .poolcard__edit`).click();
  await page.waitForSelector(".poolform", { timeout: 5000 });
  await page.locator(".wizard__next").click();
  await page.waitForSelector(".struct__section", { timeout: 5000 });
  await settle(page, 600);
  await shot(page, "10-structure.png");
  await page.keyboard.press("Escape");

  // 11. Тёмная тема.
  await open("dark");
  await frameBoard(page, { zoomOut: 0 });
  await shot(page, "11-board-dark.png");

  await browser.close();
  await writeFile(
    path.join(OUTDIR, "README.md"),
    "Screenshots are produced by `frontend/shots.mjs` (`npm run shots`) against the English demo\n" +
      "content in `demo/content-en`, on seeded demo sessions. Candidates in frame are synthetic.\n",
  );
  console.log("готово →", OUTDIR);
}

await main();
