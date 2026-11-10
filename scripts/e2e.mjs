// Dev tool: click through the new forms in a real (headless) browser against the running dev server.
//   start Chrome with --remote-debugging-port=9333, run `pnpm dev`, then: node scripts/e2e.mjs
// Resets the demo to the closeout checkpoint first. Exits non-zero on the first failed expectation.
import { SignJWT } from "jose";
import { createHash } from "node:crypto";

const base = process.env.GROUNDWORK_URL ?? "http://localhost:3000";
const stableId = (name) => {
  const hash = createHash("sha1").update(Buffer.from("7c9e6679742540de944be07fc1f90ae7", "hex")).update(name, "utf8").digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};
const jwt = (user) => new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(stableId(`user:${user}`)).setIssuedAt().setExpirationTime("1d").sign(new TextEncoder().encode(process.env.SESSION_SECRET ?? "groundwork-dev-only-secret"));

const tab = await (await fetch("http://localhost:9333/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg.result ?? msg.error);
  if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((r) => { pending.set(++seq, r); ws.send(JSON.stringify({ id: seq, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;
const as = async (user) => {
  await send("Network.clearBrowserCookies");
  if (user) await send("Network.setCookie", { name: "gw_session", value: await jwt(user), url: base, httpOnly: true });
};
const go = async (path) => {
  await send("Page.navigate", { url: base + path });
  await sleep(1800);
};
const text = () => js("document.body.innerText");
const url = () => js("location.pathname + location.search");
let failed = 0;
const expect = async (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `  ${detail}`}`);
  if (!ok) failed++;
};
/** Fill inputs by selector and submit the form that contains the first one (optionally via a named button). */
const submit = async (fields, button) => {
  const r = await js(`(() => {
    const fields = ${JSON.stringify(fields)};
    let form = null;
    for (const [sel, value] of Object.entries(fields)) {
      const el = document.querySelector(sel);
      if (!el) return "missing " + sel;
      form ??= el.closest("form");
      if (el.type === "checkbox") el.checked = Boolean(value);
      else {
        const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    const btn = ${JSON.stringify(button ?? null)} ? form.querySelector(${JSON.stringify(button ?? "")}) : form.querySelector('button[type="submit"]');
    if (!btn) return "no submit button";
    form.requestSubmit(btn);
    return "submitted";
  })()`);
  await sleep(2500);
  return r;
};

await send("Runtime.enable");
await send("Page.enable");
await send("Page.bringToFront");
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

const reset = await fetch(`${base}/api/demo/reset?to=closeout`, { method: "POST" });
await expect("reset to closeout", reset.ok, String(reset.status));
const P = stableId("project:bayview-clinic-ti");
const C = (k) => stableId(`contract:${k}`);

// 1. Controller records a backcharge against Pacific.
await as("priya");
await go(`/gc/contracts/${C("pacific")}`);
let r = await submit({ "#bc-reason": "Patch fire caulk at panel EP-2", "#bc-amount": "900.00" });
await expect("record a backcharge", r === "submitted" && (await text()).includes("Backcharge recorded"), r);
await expect("backcharge is listed", (await text()).includes("Patch fire caulk at panel EP-2"));

// 2. Controller approves Pacific's pending change order.
r = await submit({ 'input[name="changeOrderId"]': await js(`document.querySelector('input[name="changeOrderId"]')?.value ?? ""`) }, 'button[value="approve"]');
await expect("approve a change order", r === "submitted" && (await text()).includes("Change order approved"), r);
await expect("contract sum moved to $306,400", (await text()).includes("$306,400"));

// 3. A sub requests a change order and adds a supplier.
await as("jamal");
await go(`/sub/contracts/${C("summit")}`);
r = await submit({ "#co-title": "Added soffit at lobby", "#co-amount": "3,200" });
await expect("sub requests a change order", r === "submitted" && (await text()).includes("Change order request sent"), r);
r = await submit({ "#lt-name": "East Bay Gypsum", "#lt-scope": "Board and mud", "#lt-sum": "25,000" });
await expect("sub adds a supplier", r === "submitted" && (await text()).includes("East Bay Gypsum"), r);
await go(`/sub/pay-apps/new?contract=${C("summit")}`);
await expect("pay application form offers the supplier", (await text()).includes("Owed to your suppliers") && (await text()).includes("East Bay Gypsum"));

// 4. The supplier signs from its link; the sub's release goes out.
await as("priya");
await go("/demo");
const link = await js(`[...document.querySelectorAll('a[href^="/w/"]')].map((a) => a.getAttribute("href"))[0] ?? ""`);
await expect("demo outbox lists a signing link", link.startsWith("/w/"));
await as(null);
await go(link);
await expect("supplier sees its payment with no account", (await text()).includes("$12,000.00") && (await text()).includes("Bay Rebar Supply"));
r = await submit({ "#signerName": "Luis Ortega", "#signerTitle": "Credit Manager", 'input[name="attest"]': true });
await expect("supplier signs", r === "submitted" && (await text()).includes("Signed"), r);
await as("priya");
await go(`/gc/projects/${P}`);
await expect("the sub's release is on its way once its supplier signed", (await text()).includes("Payment sent"));

// 5. Owner releases retention: the certified half of Ironline's retainage is paid out, and the flow plays.
await js(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("Record owner payment"))?.click()`);
await sleep(500);
r = await submit({ "#amount": "12,500.00", "#retention": "12,500.00", "#reference": "ACH BVH-0201" });
await sleep(1500);
await expect("record owner retention", r === "submitted" && (await url()).includes("event="), `${r} ${await url()}`);
await expect("board shows the retention release", (await text()).includes("Retention release") && (await text()).includes("$12,500.00"));
await expect("the landing animation is on the board", (await text()).includes("just landed"));

// 6. Pages that only read.
for (const [who, path, needle] of [["priya", `/gc/projects/${P}/live`, "Where the money went"], ["priya", "/lab", "Money flow"], ["dana", "/owner", "where your money went"], ["rosa", "/sub", "Your money on"], [null, "/statutes", "All jurisdictions"], [null, "/", "The contract already says"]]) {
  await as(who);
  await go(path);
  await expect(`${who ?? "anyone"} ${path}`, (await text()).includes(needle));
}

if (errors.length) console.log(`page exceptions:\n- ${[...new Set(errors)].join("\n- ")}`);
await fetch(`http://localhost:9333/json/close/${tab.id}`);
ws.close();
console.log(failed || errors.length ? `\n${failed} failed, ${errors.length} page exceptions` : "\nall passed");
process.exit(failed || errors.length ? 1 : 0);
