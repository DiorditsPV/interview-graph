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

// 0. auth-identity (#36): доска за гейтом — логинимся owner'ом (дефолтные сид-креды).
await page.waitForSelector(".login__card", { timeout: 10000 });
await page.fill('.login__input[type="email"]', process.env.SMOKE_OWNER_EMAIL || "owner@interview.local");
await page.fill('.login__input[type="password"]', process.env.SMOKE_OWNER_PASSWORD || "interview-dev");
await page.click(".login__card button[type=submit]");
console.log("OK: logged in as owner");
// AuthGate проверяет сессию через /api/auth/me ДО логина → ожидаемый 401 в консоли.
// Сбрасываем накопленное, чтобы он не считался ошибкой; пост-логин запросы идут с cookie.
errors.length = 0;

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

// 9f. UX-полировка: HUD-прогресс+топик, чип переполнения тегов, свёртка панели тегов.
// (ДО compare/resume: нужен активный HUD текущего вопроса — после resume-reload его нет.)
await page.waitForSelector(".hud__progress", { timeout: 3000 });
const hudProg = await page.locator(".hud__progress").innerText();
if (!hudProg.includes("/")) fail(`HUD progress missing fraction: "${hudProg}"`);
if (hudProg.replace(/[^·]/g, "").length < 1) fail(`HUD progress missing topic separator: "${hudProg}"`);
console.log(`OK: HUD progress + topic (${hudProg})`);

const moreChips = await page.locator(".tagchip--more").count();
if (moreChips < 1) fail("no tag-overflow chip (+N) rendered on any card");
console.log(`OK: card tag overflow chip (+N) on ${moreChips} cards`);

const tagsBefore = await page.locator(".fp__tag").count();
if (tagsBefore < 1) fail("expected tag chips in filter panel");
await page.locator(".fp__collapse").click();
await page.waitForTimeout(150);
const tagsCollapsedCount = await page.locator(".fp__tag").count();
if (tagsCollapsedCount !== 0) fail(`tag panel did not collapse (still ${tagsCollapsedCount})`);
await page.locator(".fp__collapse").click(); // развернуть обратно
await page.waitForTimeout(150);
const tagsAgain = await page.locator(".fp__tag").count();
if (tagsAgain !== tagsBefore) fail(`tag panel did not restore (${tagsAgain} vs ${tagsBefore})`);
console.log(`OK: tag panel collapse toggle (${tagsBefore} ⇄ 0)`);

// 10. people-schema: старт сессии через пикер кандидата (ввод имени → создаётся карточка) +
//     дефолтный интервьюер преселектится и показывается в шапке активной сессии.
//     Затем оценка текущего через HUD → модалка-сравнения агрегирует.
// Дефолтный интервьюер засеян на бэкенде → селектор интервьюера присутствует.
const ivPick = page.locator(".iv-pick");
if ((await ivPick.count()) < 1) fail("interviewer picker (.iv-pick) missing at session start");
// Имя нового кандидата в специальный input (несколько input'ов: имя/позиция/грейд).
await page.locator(".session input[placeholder='Кандидат…']").fill("Cmp Bot");
await page.locator(".session input[placeholder^='Грейд']").fill("middle");
await page.locator(".session button", { hasText: "Начать сессию" }).click();
await page.waitForSelector(".session__active", { timeout: 3000 });
const activeHdr = await page.locator(".session__active").innerText();
if (!activeHdr.includes("Cmp Bot")) fail(`active session missing candidate: "${activeHdr}"`);
if (!activeHdr.includes("🎤")) fail(`active session missing interviewer marker: "${activeHdr}"`);
console.log(`OK: session start picks candidate + interviewer (${activeHdr.replace(/\s+/g, " ").slice(0, 50)})`);
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

// 11. Resume ПОСЛЕДНЕЙ: создать сессию+оценку через API → reload → выбрать в .loadsess.
// NB: после compare (шаг 10) активна live-сессия + открыт SSE-поток, а ссылка несёт ?session=<id>,
// поэтому reload авто-подключается к ней (фича live-session-sync) и держит соединение → networkidle
// не наступит. Используем "load" и затем выходим из авто-подключённой сессии («Выйти»), чтобы
// открылся выпадающий список .loadsess (он рендерится только вне активной сессии).
const sid = (await (await page.request.post(URL + "api/sessions", { data: { candidate: "SmokeResume" } })).json()).id;
await page.request.post(`${URL}api/sessions/${sid}/score`, { data: { nodeId: "sql-01", score: 5 } });
await page.reload({ waitUntil: "load" });
// reload авто-подключается к ?session=<id> (live-session-sync) → дождаться и выйти, чтобы
// показался выпадающий .loadsess (рендерится только вне активной сессии).
await page.waitForTimeout(500);
const leaveBtn = page.locator(".session button", { hasText: "Выйти" });
if (await leaveBtn.count()) {
  await leaveBtn.click();
  await page.waitForTimeout(200);
}
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

// 13. Шпаргалка горячих клавиш: «?» открывает оверлей, Esc закрывает.
// (После bank: фокус на кнопке, не в input — «?» доходит до обработчика.)
await page.keyboard.press("?");
await page.waitForSelector(".help-modal", { timeout: 3000 });
const helpText = await page.locator(".help-modal").innerText();
if (!helpText.includes("неоценённому")) fail(`help overlay missing shortcuts: "${helpText}"`);
await page.keyboard.press("Escape");
await page.waitForSelector(".help-modal", { state: "detached", timeout: 3000 });
console.log("OK: shortcuts help overlay (? opens, Esc closes)");

// 14. Загрузка вопросов: открыть модалку, загрузить НЕвалидный .md → показана ошибка (файл не пишется).
await page.locator(".uploadbtn").click();
await page.waitForSelector(".upload-modal", { timeout: 3000 });
const badMd = "---\nid: smoke-bad-01\nblock: NOPE\ntopic: x\n---\n## Вопрос\nq\n";
await page.setInputFiles(".upload-modal input[type=file]", {
  name: "smoke-bad.md",
  mimeType: "text/markdown",
  buffer: Buffer.from(badMd),
});
await page.waitForSelector(".upload-result__err", { timeout: 3000 });
const upErr = await page.locator(".upload-result__err").innerText();
if (!upErr.toLowerCase().includes("ошибк")) fail(`upload error not shown: "${upErr}"`);
console.log("OK: upload rejects invalid file with error");
await page.keyboard.press("Escape");
await page.waitForSelector(".upload-modal", { state: "detached", timeout: 3000 });

// 15. Сайдбар-агенда: тоггл показывает список вопросов; клик по пункту делает ноду текущей (HUD).
await page.locator(".tb__toggle", { hasText: "Агенда" }).click();
await page.waitForSelector(".interview", { timeout: 3000 });
const ivCount = await page.locator(".interview .ivbtn").count();
if (ivCount < 5) fail(`agenda has too few items: ${ivCount}`);
await page.locator(".interview .ivbtn").first().click();
await page.waitForSelector(".hud", { timeout: 3000 });
const agHud = await page.locator(".hud__title").innerText();
if (!agHud || agHud.length < 2) fail(`agenda click did not set current question: "${agHud}"`);
console.log(`OK: agenda sidebar (${ivCount} items, click → HUD "${agHud.slice(0, 30)}")`);

// 16. Экран «Все вопросы» (bank-browser): открыть, список всего банка, поиск, раскрытие, закрытие.
await page.locator(".session .iconbtn", { hasText: "Все вопросы" }).click();
await page.waitForSelector(".bankbrowser", { timeout: 5000 });
const bankRows = await page.locator(".bankrow").count();
if (bankRows < nodeCount) fail(`bank shows fewer rows (${bankRows}) than canvas nodes (${nodeCount})`);
console.log(`OK: bank screen lists ${bankRows} questions`);
await page.locator(".bankbrowser__search").fill("ROW_NUMBER");
await page.waitForTimeout(250);
const bankFiltered = await page.locator(".bankrow").count();
if (bankFiltered < 1 || bankFiltered >= bankRows) fail(`bank search did not narrow rows (${bankRows} → ${bankFiltered})`);
console.log(`OK: bank search narrows ${bankRows} → ${bankFiltered}`);
await page.locator(".bankrow__head").first().click();
await page.waitForSelector(".bankrow--open .bankrow__body", { timeout: 3000 });
const bodyLen = (await page.locator(".bankrow--open .bankrow__body").first().innerText()).length;
if (bodyLen < 30) fail(`expanded bank row body too short (${bodyLen})`);
console.log("OK: bank row expands with question/answer/criteria");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
if ((await page.locator(".bankbrowser").count()) !== 0) fail("bank screen did not close on Esc");
console.log("OK: bank screen closes on Esc");

// 17. topbar-redeclutter: разгруженная шапка — ровно два ряда, панель отображения внутри шапки.
const topRows = await page.locator(".topbar > .topbar__row").count();
if (topRows !== 2) fail(`expected 2 topbar rows, got ${topRows}`);
if ((await page.locator(".topbar .toolbar").count()) !== 1) fail("display toolbar must stay inside topbar");
console.log(`OK: decluttered topbar (${topRows} rows, toolbar nested)`);

// 18. question-management: добавить вопрос через форму шапки → доска растёт (бэкенд пишет в БД).
const qBeforeAdd = await page.locator(".qnode").count();
await page.locator(".addbtn").click();
await page.waitForSelector(".addform", { timeout: 3000 });
await page.locator(".addform input[placeholder^='например']").fill("smoke-add-topic"); // поле «Тема» (обязательное)
await page.locator(".addform textarea").first().fill("Smoke вопрос-добавление?");
await page.locator(".addform__btns button", { hasText: "Создать" }).click();
await page.waitForTimeout(700);
const qAfterAdd = await page.locator(".qnode").count();
if (qAfterAdd <= qBeforeAdd) fail(`add-question did not grow board (${qBeforeAdd}→${qAfterAdd})`);
console.log(`OK: add question grows board (${qBeforeAdd}→${qAfterAdd})`);

// 19. question-management: открыть вопрос → drawer; правка (открыть/Отмена) неразрушающа.
await page.locator(".qnode__title", { hasText: "ROW_NUMBER" }).first().click();
await page.waitForSelector(".drawer__edit", { timeout: 3000 });
await page.locator(".drawer__edit").click();
await page.waitForSelector(".drawer__editform", { timeout: 3000 });
await page.locator(".drawer__editform textarea").first().fill("ЧЕРНОВИК — НЕ СОХРАНЯЕМ");
await page.locator(".drawer__editbtns button", { hasText: "Отмена" }).click();
await page.waitForTimeout(200);
if ((await page.locator(".drawer__editform").count()) !== 0) fail("edit form still open after cancel");
console.log("OK: edit mode opens + cancel is non-destructive");

// hide-local: «Скрыть» гасит карточку; тумблер «Скрытые» помечает её (.qnode--hidden).
const dimBeforeHide = await page.locator(".qnode--dimmed").count();
await page.locator(".drawer__hide").click();
await page.waitForTimeout(250);
const dimAfterHide = await page.locator(".qnode--dimmed").count();
if (dimAfterHide <= dimBeforeHide) fail(`hide did not dim node (${dimBeforeHide}→${dimAfterHide})`);
await page.locator(".tb__toggle", { hasText: "Скрытые" }).click();
await page.waitForTimeout(250);
const hiddenMark = await page.locator(".qnode--hidden").count();
if (hiddenMark < 1) fail("no .qnode--hidden marker after show-hidden");
await page.locator(".tb__toggle", { hasText: "Скрытые" }).click(); // спрятать обратно
await page.locator(".drawer__hide").click(); // вернуть карточку на доску
await page.waitForTimeout(150);
console.log(`OK: hide dims (${dimBeforeHide}→${dimAfterHide}), show-hidden marks (${hiddenMark})`);

// 20. question-management: удаление — confirm всплывает; dismiss НЕ меняет банк.
let confirmFired = false;
page.on("dialog", (d) => { confirmFired = true; d.dismiss(); });
const qBeforeDel = await page.locator(".qnode").count();
await page.locator(".drawer__delete").click();
await page.waitForTimeout(250);
if (!confirmFired) fail("delete did not raise a confirm dialog");
if ((await page.locator(".qnode").count()) !== qBeforeDel) fail("dismissed delete changed bank");
console.log(`OK: delete confirms + dismiss non-destructive (${qBeforeDel} nodes)`);

// 21. draft-autosave: оценка без активной сессии переживает перезагрузку (ПОСЛЕДНЕЙ — делает reload).
// Снимаем возможный ?session из URL (resume-шаг мог его выставить), чтобы сессии точно не было.
await page.evaluate(() => {
  const u = new URL(location.href); u.searchParams.delete("session"); history.replaceState(null, "", u.toString());
});
await page.keyboard.press("Escape"); // закрыть drawer
await page.locator(".qnode__title", { hasText: "ROW_NUMBER" }).first().click();
await page.waitForSelector(".drawer__scoring .scorebtn", { timeout: 3000 });
await page.locator(".drawer__scoring .scorebtn").nth(4).click(); // 5/5
await page.waitForTimeout(200);
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector(".qnode", { timeout: 10000 });
await page.waitForTimeout(400);
const restoredScored = await page.locator(".qnode--scored").count();
if (restoredScored < 1) fail("draft autosave did not restore scores after reload");
console.log(`OK: draft autosave restores ${restoredScored} scored node(s) after reload`);

if (errors.length) fail(`console/page errors:\n${errors.join("\n")}`);

console.log("\nALL SMOKE CHECKS PASSED ✓");
await browser.close();
