import { chromium } from "playwright";
import crypto from "node:crypto";

// Same scheme as lib/auth.ts: base64(payload) + "." + hex(HMAC-SHA256(payload))
const secret = "placeholder"; // matches SUPABASE_SECRET_KEY in .env.local
const payload = JSON.stringify({ id: "dev", name: "Nate", role: "admin", exp: Date.now() + 864e5 });
const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
const token = Buffer.from(payload).toString("base64") + "." + sig;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "sw-session", value: token, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERR:", m.text().slice(0, 200)); });

await page.goto("http://localhost:3000/dev-preview", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/shot-list.png" });
console.log("list ok:", await page.locator("text=Tori Eisenberg").count());

// Open the thread
await page.locator("text=Tori Eisenberg").first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/shot-thread.png" });
console.log("thread ok:", await page.locator("text=Delivered!").count());

await browser.close();
