import { chromium } from "playwright";
const URL = process.env.SMOKE_URL || "http://localhost:8000/";
const OUT = process.env.OUT || "/tmp/interview.png";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector(".qnode", { timeout: 10000 });
if (process.env.DARK) {
  await page.evaluate(() => {
    if ((document.documentElement.dataset.theme || "light") !== "dark") {
      document.querySelector(".iconbtn")?.click();
    }
  });
  await page.waitForTimeout(300);
}
if (process.env.CLICK) {
  await page.locator(".qnode__title", { hasText: "ROW_NUMBER" }).first().click();
  await page.locator(".hud__score .scorebtn").nth(3).click();
}
await page.waitForTimeout(700);
const clip = process.env.CLIP
  ? { x: 100, y: 55, width: 720, height: 920 }
  : undefined;
await page.screenshot({ path: OUT, fullPage: false, clip });
console.log("saved", OUT);
await browser.close();
