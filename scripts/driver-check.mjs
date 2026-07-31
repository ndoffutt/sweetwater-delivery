// Browser smoke test for the driver flow.
//
// This is the screen where proof photos get lost, so it's the one that most
// needs eyes on it. Runs against the stubbed /dev-preview/driver harness - no
// database, no network. Exits non-zero on any failure.
//
//   npm run dev
//   node scripts/driver-check.mjs
//
// SHOTS=1 also writes screenshots to /tmp.

import { chromium } from "playwright";
import crypto from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

function devCookie(secret = process.env.SUPABASE_SECRET_KEY || "placeholder") {
  const payload = JSON.stringify({ id: "dev", name: "Nate", role: "driver", exp: Date.now() + 864e5 });
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(payload).toString("base64") + "." + sig;
}

const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`  FAIL  ${name}\n        ${err.message.split("\n")[0]}`);
  }
};
const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({
  viewport: { width: 414, height: 896 },
  deviceScaleFactor: 2,
  permissions: ["geolocation"],
  geolocation: { latitude: 40.94, longitude: -72.3 },
});
await ctx.addCookies([{ name: "sw-session", value: devCookie(), domain: "localhost", path: "/" }]);
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));

console.log("\nDriver flow\n");

await page.goto(`${BASE}/dev-preview/driver`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500); // map init

if (process.env.SHOTS) await page.screenshot({ path: "/tmp/driver-stop.png" });

await check("the driver screen renders the current stop", async () => {
  must((await page.getByText("Tori Eisenberg").count()) > 0, "current stop not shown");
});

await check("progress reflects the finished stop", async () => {
  // Exactly one of three fixture stops is completed. Assert the real numbers:
  // a loose match here hid the fact that later checks mutate this state.
  const header = await page.locator("body").innerText();
  must(/2 stops left/.test(header), `expected "2 stops left", got: ${header.slice(0, 60)}`);
  must(/1\/3/.test(header), "expected 1/3 completed");
});

// The request that started all of this: know what the stop is for BEFORE
// arriving, not after parking.
await check("the stop says what it is for before arriving", async () => {
  const body = await page.locator("body").innerText();
  must(
    /Drop-off AND pick-up|Drop-off only|Pick-up only/.test(body),
    "no drop-off/pick-up label on the pending card"
  );
});

await check("Navigate and Slide to arrive are both offered", async () => {
  must((await page.getByText("Navigate", { exact: false }).count()) > 0, "no Navigate button");
  must((await page.getByText(/Slide to arrive/i).count()) > 0, "no arrive control");
});

// Navigate must never be gated behind an upload: a driver in a dead zone still
// has to be able to leave.
await check("Navigate is always tappable", async () => {
  const nav = page.getByText("Navigate", { exact: false }).first();
  must(await nav.isEnabled(), "Navigate was disabled");
});

await check("a completed stop can be reopened and corrected", async () => {
  await page.getByRole("button", { name: /stops left|Route complete/i }).first().click();
  await page.waitForTimeout(700);
  await page.getByText("Bob Novak").first().click();
  await page.waitForTimeout(900);

  const body = await page.locator("body").innerText();
  must(/Completed/.test(body), "no completed summary on the finished stop");
  must(/drop-off/i.test(body), "summary doesn't say what was recorded");
  must((await page.getByText(/Fix this stop/i).count()) > 0, "no way to reopen a finished stop");
  // The driver has to trust that correcting a stop is safe to do.
  must(/won't be texted again/i.test(body), "no reassurance the customer isn't re-texted");
});

await check("reopening restores the working controls", async () => {
  await page.getByText(/Fix this stop/i).first().click();
  await page.waitForTimeout(1200);
  const body = await page.locator("body").innerText();
  must(/Complete Stop/i.test(body), "controls did not come back after reopening");
});

await check("no console errors during the whole run", async () => {
  const real = consoleErrors.filter(
    (e) => !/favicon|manifest|Download the React|WebGL|mapbox|Failed to load resource/i.test(e)
  );
  must(real.length === 0, `${real.length} console error(s):\n${real.slice(0, 3).join("\n")}`);
});

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
