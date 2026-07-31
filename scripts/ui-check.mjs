// Browser smoke test for the messaging UI.
//
// Drives the real component in Chromium against the stubbed /dev-preview
// harness - no database, no network. Catches the things unit tests can't:
// rendering, wiring, and console errors. Exits non-zero on any failure.
//
//   npm run dev          (in one shell)
//   node scripts/ui-check.mjs
//
// Set SHOTS=1 to also write screenshots to /tmp.

import { chromium } from "playwright";
import crypto from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// Mirrors lib/auth.ts: base64(payload) + "." + hex(HMAC-SHA256(payload)).
// Signed with the same value .env.local uses for SUPABASE_SECRET_KEY.
function devCookie(secret = process.env.SUPABASE_SECRET_KEY || "placeholder") {
  const payload = JSON.stringify({ id: "dev", name: "Nate", role: "admin", exp: Date.now() + 864e5 });
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
    results.push({ name, ok: false, err: err.message });
    console.log(`  FAIL  ${name}\n        ${err.message.split("\n")[0]}`);
  }
};
const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "sw-session", value: devCookie(), domain: "localhost", path: "/" }]);
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));

console.log("\nMessaging UI\n");

await page.goto(`${BASE}/dev-preview`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(800);

await check("conversation list renders every thread", async () => {
  for (const name of ["Tori Eisenberg", "Molly Sims Stuber", "Bridgehampton Club"]) {
    must((await page.getByText(name, { exact: false }).count()) > 0, `missing thread: ${name}`);
  }
});

await check("an unknown number falls back to a formatted phone number", async () => {
  must((await page.getByText("(631) 555-0163").count()) > 0, "raw number not shown for unknown contact");
});

await check("a pinned thread is marked", async () => {
  must((await page.getByText("PINNED").count()) > 0, "no pinned marker");
});

await check("search filters the list", async () => {
  await page.getByPlaceholder("Search").fill("bridge");
  await page.waitForTimeout(300);
  must((await page.getByText("Bridgehampton Club").count()) > 0, "match disappeared");
  must((await page.getByText("Molly Sims Stuber").count()) === 0, "non-match still visible");
  await page.getByPlaceholder("Search").fill("");
  await page.waitForTimeout(300);
});

await check("opening a thread shows its messages", async () => {
  await page.getByText("Tori Eisenberg").first().click();
  await page.waitForTimeout(700);
  must((await page.getByText("Good morning!", { exact: false }).count()) > 0, "oldest message missing");
  must((await page.getByText("Perfect, thank you!", { exact: false }).count()) > 0, "newest message missing");
});

await check("a quoted reply does not duplicate the message body", async () => {
  // The reply quotes the "Delivered!" message. If the quote renders at full
  // size the thread reads as if it was sent twice.
  const full = await page.getByText("Delivered! Photo and item list here: sweetwaterscleaners.com/d/a8f3", { exact: true }).count();
  must(full === 1, `quoted parent rendered at full length ${full} times, expected 1`);
});

await check("a day separator is shown", async () => {
  must((await page.getByText(/Today \d/).count()) > 0, "no day/time separator");
});

await check("delivery status appears under the newest outbound message", async () => {
  must((await page.getByText(/Delivered ·/).count()) > 0, "no status line");
});

await check("tapping a bubble opens reply and tapback actions", async () => {
  // The conversation list is still in the DOM at phone width (hidden by CSS),
  // so its last-message preview also matches. Take the thread's copy.
  await page.getByText("Perfect, thank you!", { exact: false }).last().click();
  await page.waitForTimeout(400);
  must((await page.getByText("Reply", { exact: true }).count()) > 0, "no Reply action");
  must((await page.getByText("Copy", { exact: true }).count()) > 0, "no Copy action");
});

await check("choosing Reply shows the reply banner above the composer", async () => {
  await page.getByText("Reply", { exact: true }).first().click();
  await page.waitForTimeout(400);
  must((await page.getByText(/Replying to/).count()) > 0, "no reply banner");
});

await check("the reply banner can be dismissed", async () => {
  await page.getByLabel("Cancel reply").click();
  await page.waitForTimeout(300);
  must((await page.getByText(/Replying to/).count()) === 0, "banner stayed after cancel");
});

await check("the send button enables once there is text", async () => {
  const send = page.getByLabel("Send");
  must(await send.isDisabled(), "send was enabled with an empty draft");
  await page.getByPlaceholder(/Text from the office/).fill("On my way");
  await page.waitForTimeout(200);
  must(!(await send.isDisabled()), "send stayed disabled with a draft");
  await page.getByPlaceholder(/Text from the office/).fill("");
});

await check("the back arrow returns to the list", async () => {
  await page.getByLabel("Back").click();
  await page.waitForTimeout(500);
  must((await page.getByPlaceholder("Search").count()) > 0, "did not return to the list");
});

await check("the new-message screen offers a contact picker", async () => {
  await page.getByLabel("New message").click();
  await page.waitForTimeout(500);
  must((await page.getByText("To:").count()) > 0, "no To: field");
  must((await page.getByText("Tori Eisenberg").count()) > 0, "contact picker empty");
});

if (process.env.SHOTS) {
  await page.getByLabel("Back").click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/tmp/ui-list.png" });
  await page.getByText("Tori Eisenberg").first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: "/tmp/ui-thread.png" });
}

await check("no console errors during the whole run", async () => {
  const real = consoleErrors.filter((e) => !/favicon|manifest|Download the React/i.test(e));
  must(real.length === 0, `${real.length} console error(s):\n${real.slice(0, 3).join("\n")}`);
});

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
