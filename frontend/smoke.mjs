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

// --- Накопленные проверки фич. Порядок важен (объяснения у каждой):
//  локально-стейтовые (note/timer/search/unscored/progress) → compare (стартует свою сессию)
//  → resume ПОСЛЕДНЕЙ (делает page.reload(), стирающий всё накопленное состояние).

// 9. Заметка на ноду: ввод в drawer переживает закрытие/повторное открытие.
// Открываем/закрываем drawer текущего вопроса клавиатурой (Enter/Esc) — без клика по карточке.
await page.keyboard.press("Escape"); // закрыть открытый drawer (current сохраняется)
await page.waitForTimeout(150);
await page.keyboard.press("Enter"); // открыть drawer текущего вопроса
await page.waitForSelector(".drawer__note", { timeout: 3000 });
const noteText = "smoke-note-проверка";
await page.locator(".drawer__note").fill(noteText);
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
await page.keyboard.press("Enter"); // повторно открыть тот же вопрос
await page.waitForSelector(".drawer__note", { timeout: 3000 });
const restored = await page.locator(".drawer__note").inputValue();
if (restored !== noteText) fail(`note not retained across reopen: "${restored}"`);
console.log("OK: node note retained across reopen");

// 9b. Таймер: HUD показывает M:SS и инкрементируется (есть текущий вопрос с прошлых шагов).
await page.waitForSelector(".hud__timer", { timeout: 3000 });
const tmr1 = (await page.locator(".hud__timer").first().innerText()).trim();
if (!/\d+:\d{2}/.test(tmr1)) fail(`timer format wrong: "${tmr1}"`);
await page.waitForTimeout(1300);
const tmr2 = (await page.locator(".hud__timer").first().innerText()).trim();
if (tmr2 === tmr1) fail(`timer not ticking (${tmr1} == ${tmr2})`);
console.log(`OK: HUD timer ticks (${tmr1} → ${tmr2})`);

// 9c. Поиск по вопросам: запрос гасит несовпавшие ноды; очистка убирает гашение.
// (После клавиатурных проверок: фокус уходит в input — дальше body-клавиатура не нужна.)
const search = page.locator(".fp__search");
await search.fill("MergeTree");
await page.waitForTimeout(300);
const dimSearch = await page.locator(".qnode--dimmed").count();
if (dimSearch < 1) fail("search did not dim non-matching nodes");
await search.fill("");
await page.waitForTimeout(300);
const dimCleared = await page.locator(".qnode--dimmed").count();
if (dimCleared >= dimSearch) fail(`clearing search did not remove dim (${dimSearch} → ${dimCleared})`);
console.log(`OK: question search dims ${dimSearch}, clears to ${dimCleared}`);

// 9d. «Только неоценённые»: оценённая на шаге 4 нода (ROW_NUMBER) гаснет при включении тумблера.
// (dimUnscoredAfter — не dimAfter: тот уже объявлен в track-проверке выше.)
const unscoredBtn = page.locator(".fp__chip", { hasText: "Только неоценённые" });
await unscoredBtn.click();
await page.waitForTimeout(250);
const dimUnscored = await page.locator(".qnode--dimmed").count();
if (dimUnscored < 1) fail("unscored-only did not dim scored nodes");
await unscoredBtn.click();
await page.waitForTimeout(250);
const dimUnscoredAfter = await page.locator(".qnode--dimmed").count();
if (dimUnscoredAfter >= dimUnscored) fail(`toggling off did not clear dim (${dimUnscored} → ${dimUnscoredAfter})`);
console.log(`OK: «только неоценённые» dims ${dimUnscored}, clears to ${dimUnscoredAfter}`);

// 9e. Прогресс-бар в шапке: присутствует, подпись с дробью, заполнение > 0 (оценка со шага 4).
await page.waitForSelector(".progress", { timeout: 3000 });
const progLabel = await page.locator(".progress__label").innerText();
if (!progLabel.includes("/")) fail(`progress label has no fraction: "${progLabel}"`);
const fillW = await page.locator(".progress__fill").evaluate((el) => el.style.width);
const fillPct = parseFloat(fillW);
if (!(fillPct > 0)) fail(`progress fill not advanced after scoring: "${fillW}"`);
console.log(`OK: progress bar (${progLabel}, fill ${fillW})`);

// 10. Сравнение кандидатов: старт сессии (сессии ещё нет) → оценка текущего через HUD → модалка-агрегат.
await page.locator(".session input").fill("Cmp Bot");
await page.locator(".session button", { hasText: "Начать сессию" }).click();
await page.waitForSelector(".session__active", { timeout: 3000 });
await page.waitForSelector(".hud__score .scorebtn", { timeout: 3000 });
await page.locator(".hud__score .scorebtn").nth(2).click(); // 3/5 → персист в сессию
await page.waitForTimeout(400);
await page.locator(".cmpbtn").click();
await page.waitForSelector(".cmp-modal", { timeout: 3000 });
await page.locator(".cmp-modal__item input[type=checkbox]").first().check();
await page.locator(".cmp-modal__run").click();
await page.waitForSelector(".cmp-table", { timeout: 3000 });
const cmpText = await page.locator(".cmp-table").innerText();
if (!cmpText.includes("Cmp Bot")) fail(`compare table missing candidate: "${cmpText}"`);
console.log("OK: candidate compare table renders (Cmp Bot)");

// 11. Resume ПОСЛЕДНЕЙ: создать сессию+оценку через API → reload (стирает всё) → выбрать в .loadsess.
const sid = (await (await page.request.post(URL + "api/sessions", { data: { candidate: "SmokeResume" } })).json()).id;
await page.request.post(`${URL}api/sessions/${sid}/score`, { data: { nodeId: "sql-01", score: 5 } });
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".loadsess", { timeout: 5000 });
await page.locator(".loadsess").selectOption(String(sid));
await page.waitForSelector(".session__active", { timeout: 3000 });
const active = await page.locator(".session__active").innerText();
if (!active.includes("SmokeResume")) fail(`resume did not load session: ${active}`);
const scoredCount = await page.locator(".qnode--scored").count();
if (scoredCount < 1) fail("resume did not restore scores onto the board");
console.log(`OK: session resume restores scores (${scoredCount} scored)`);

// 12. Экспорт банка вопросов: кнопка отдаёт interview_bank_*.html (всегда активна, без reload).
const [dlBank] = await Promise.all([
  page.waitForEvent("download"),
  page.locator(".bankbtn").click(),
]);
const bankFn = dlBank.suggestedFilename();
if (!bankFn.includes("bank") || !bankFn.endsWith(".html")) fail(`bank export wrong file: ${bankFn}`);
console.log(`OK: question bank export (${bankFn})`);

if (errors.length) fail(`console/page errors:\n${errors.join("\n")}`);

console.log("\nALL SMOKE CHECKS PASSED ✓");
await browser.close();
