import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
await p.goto("http://localhost:8000", { waitUntil: "domcontentloaded" });
await p.waitForSelector(".login__card");
await p.fill('.login__input[type="email"]', "owner@interview.local");
await p.fill('.login__input[type="password"]', "interview-dev");
await p.click(".login__card button[type=submit]");
await p.waitForSelector(".qnode");
await p.locator(".qnode__title", { hasText: "Shuffle в Spark" }).first().click();
await p.keyboard.press("Escape");
await p.waitForSelector(".hud");
await p.waitForTimeout(400);
for (const sel of [".react-flow__panel.bottom", ".hud", ".hud__title"]) {
  const el = p.locator(sel).first();
  console.log(sel, JSON.stringify(await el.boundingBox()));
}
console.log("hud parent width:", await p.locator(".hud").evaluate(e => [e.parentElement.className, e.parentElement.getBoundingClientRect().width]));
console.log("hud computed:", await p.locator(".hud").evaluate(e => { const s=getComputedStyle(e); return {maxW:s.maxWidth, w:s.width, scroll:e.scrollWidth}; }));
console.log("children:", await p.locator(".hud").evaluate(e => [...e.children].map(c => [c.className, Math.round(c.getBoundingClientRect().width)])));
console.log("panel computed:", await p.locator(".hud").evaluate(e => { const s=getComputedStyle(e.parentElement); return {maxW:s.maxWidth, w:s.width, pos:s.position}; }));
console.log("title styles:", await p.locator(".hud__title").evaluate(e => { const s=getComputedStyle(e); return [s.flex, s.minWidth, s.maxWidth, e.scrollWidth, e.clientWidth]; }));
await b.close();
