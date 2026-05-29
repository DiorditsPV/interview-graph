// Headless smoke-тест реального рантайма (граф рендерится, нода → drawer, оценка → ребро).
// Запуск: node smoke.mjs   (сервер должен слушать http://localhost:8000)
import { chromium } from "playwright";

const URL = process.env.SMOKE_URL || "http://localhost:8000/";
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: "networkidle" });

// 1. Граф отрисовался: есть кастомные ноды.
await page.waitForSelector(".qnode", { timeout: 10000 });
const nodeCount = await page.locator(".qnode").count();
if (nodeCount < 5) fail(`too few nodes rendered: ${nodeCount}`);
console.log(`OK: rendered ${nodeCount} nodes`);

// 1b. Swimlane: 4 заголовка блоков + под-колонки фреймворков + 4 метки оси сложности (base/junior/middle/senior).
const groups = await page.locator(".bgroup__header").count();
if (groups !== 4) fail(`expected 4 block headers, got ${groups}`);
const subs = await page.locator(".subhead").count();
if (subs < 4) fail(`expected >=4 sub-columns (frameworks split), got ${subs}`);
const bands = await page.locator(".bands__label").count();
if (bands !== 4) fail(`expected 4 difficulty band labels, got ${bands}`);
console.log(`OK: ${groups} blocks + ${subs} sub-columns + ${bands} difficulty bands`);

// 2. Ноды видимы в кадре (fitView отработал — bbox внутри вьюпорта).
const box = await page.locator(".qnode").first().boundingBox();
if (!box || box.y < 0 || box.x < 0) fail(`first node off-screen: ${JSON.stringify(box)}`);
console.log(`OK: first node in viewport at (${Math.round(box.x)}, ${Math.round(box.y)})`);

// 3. Клик по ноде с УСЛОВНЫМ ребром (sql-01 → conditional → sql-02) открывает drawer.
await page.locator(".qnode__title", { hasText: "ROW_NUMBER" }).first().click();
await page.waitForSelector(".drawer", { timeout: 5000 });
const drawerText = await page.locator(".drawer__body").innerText();
if (drawerText.length < 50) fail("drawer body too short");
console.log("OK: drawer opened with content");

// 3b. Клик задаёт «текущий вопрос» → появляется HUD ведущего.
await page.waitForSelector(".hud", { timeout: 3000 });
const hudTitle = await page.locator(".hud__title").innerText();
if (!hudTitle.includes("ROW_NUMBER")) fail(`HUD shows wrong question: ${hudTitle}`);
console.log("OK: interviewer HUD shows current question");

// 4. Выставление оценки: клик по 4-й звезде → отображается 4/5.
await page.locator(".drawer__scoring .scorebtn").nth(3).click();
await page.waitForSelector(".scoreval", { timeout: 3000 });
const scoreval = await page.locator(".scoreval").innerText();
if (!scoreval.includes("4")) fail(`score not applied: ${scoreval}`);
console.log(`OK: score applied (${scoreval})`);

// 5. Карточка показывает короткий заголовок (title), а не полный текст вопроса.
const cardText = await page.locator(".qnode__title", { hasText: "ROW_NUMBER" }).first().innerText();
if (cardText.length > 60) fail(`card shows full question, not short title: "${cardText}"`);
console.log(`OK: card shows short title ("${cardText}")`);

// 5b. Фильтр по тегам: клик по тегу гасит нерелевантные ноды.
await page.locator(".fp__tag", { hasText: "optimization" }).first().click();
await page.waitForTimeout(300);
const dimmed = await page.locator(".qnode--dimmed").count();
if (dimmed < 1) fail("tag filter did not dim any nodes");
console.log(`OK: tag filter dims ${dimmed} non-matching nodes`);
await page.locator(".fp__clear").click(); // сброс тегов

// 5c. Направление интервью: смена трека на «Аналитик» гасит вне-трековые ноды (PySpark и т.п.).
const trackSel = page.locator(".tb__select");
if ((await trackSel.count()) < 1) fail("track selector (.tb__select) missing");
const dimBefore = await page.locator(".qnode--dimmed").count();
await trackSel.selectOption("analyst");
await page.waitForTimeout(300);
const dimAfter = await page.locator(".qnode--dimmed").count();
if (dimAfter <= dimBefore) fail(`track switch did not dim more nodes (${dimBefore}→${dimAfter})`);
console.log(`OK: track selector scopes board (analyst → ${dimAfter} dimmed)`);
await trackSel.selectOption("data-engineer"); // сброс трека

// 5c. Фильтр по типу (вопрос/задача): выключение «вопрос» гасит вопросные ноды.
await page.locator(".fp__chip", { hasText: "вопрос" }).click();
await page.waitForTimeout(250);
const dimmedByKind = await page.locator(".qnode--dimmed").count();
if (dimmedByKind < 1) fail("kind filter did not dim any nodes");
await page.locator(".fp__chip", { hasText: "вопрос" }).click(); // вернуть
console.log(`OK: kind filter dims ${dimmedByKind} nodes`);

// 6. «Дальше» на листовой ноде (без исходящих рёбер) всё равно переходит дальше.
await page.locator(".qnode__title", { hasText: "KubernetesExecutor" }).first().click();
await page.waitForSelector(".hud", { timeout: 3000 });
const beforeNext = await page.locator(".hud__title").innerText();
await page.locator(".hud button.btn--primary").click();
await page.waitForTimeout(500);
const afterNext = await page.locator(".hud__title").innerText();
if (afterNext === beforeNext) fail("«Дальше» stuck on leaf node");
console.log("OK: «Дальше» advances from a leaf node");

// 6b. Панель отображения (левая часть шапки): иконки-тумблеры направляющих и точек-фона.
const tbBtns = await page.locator(".topbar .toolbar .tb__toggle").count();
if (tbBtns < 3) fail(`display toolbar buttons missing in topbar (got ${tbBtns})`);
const vBefore = await page.locator(".guides__v").count();
if (vBefore !== 0) fail(`vertical guides should be off by default (got ${vBefore})`);
await page.locator(".tb__toggle", { hasText: "Верт" }).click(); // включить вертикальные
await page.waitForTimeout(200);
const vAfter = await page.locator(".guides__v").count();
if (vAfter < 1) fail("vertical guides did not toggle on");
const bgDefault = await page.locator(".react-flow__background").count();
if (bgDefault !== 0) fail(`background should be off by default (got ${bgDefault})`);
await page.locator(".tb__toggle", { hasText: "Точки" }).click(); // включить точки
await page.waitForTimeout(200);
const bgDots = await page.locator(".react-flow__background").count();
if (bgDots < 1) fail("dots background not shown after toggling icon");
console.log("OK: display toolbar (icons) toggles guides + dots grid (default off)");

// 7. Скачивание результатов: кнопка отдаёт .html-файл.
const [dl] = await Promise.all([
  page.waitForEvent("download"),
  page.locator(".dlbtn").click(),
]);
const fn = dl.suggestedFilename();
if (!fn.endsWith(".html")) fail(`download is not .html: ${fn}`);
console.log(`OK: results download (${fn})`);

// 8. Тёмная тема: переключатель меняет data-theme и тёмный фон.
const before = await page.evaluate(() => document.documentElement.dataset.theme || "light");
await page.locator(".themebtn").click();
await page.waitForTimeout(200);
const after = await page.evaluate(() => document.documentElement.dataset.theme);
if (after === before) fail(`theme toggle did not change theme (${before} → ${after})`);
console.log(`OK: theme toggles (${before} → ${after})`);

if (errors.length) fail(`console/page errors:\n${errors.join("\n")}`);

console.log("\nALL SMOKE CHECKS PASSED ✓");
await browser.close();
