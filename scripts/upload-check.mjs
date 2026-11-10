// Dev tool: drives the "Add a subcontract" form in headless Chrome with a real PDF, waits for the
// contract to be read, and saves screenshots of the form and the result.
//   node scripts/upload-check.mjs <projectId> <pdf path> <out dir> [sub name]
// Needs Chrome started with --remote-debugging-port=9333 and the dev server on :3000.
// Reading the contract calls the Claude API when a key is configured.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { SignJWT } from "jose";

const [projectId, pdf, outDir, subName = "Harbor Painting"] = process.argv.slice(2);
const origin = "http://localhost:3000";
const tab = await (await fetch(`http://localhost:9333/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg.result ?? msg.error);
};
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;
const shot = async (name) => {
  const h = await js("document.documentElement.scrollHeight");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: Math.min(h, 6000), deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  writeFileSync(`${outDir}/${name}.png`, Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
};

await send("Runtime.enable");
await send("Page.enable");
await send("DOM.enable");
await send("Page.bringToFront");
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.addScriptToEvaluateOnNewDocument", { source: `try{localStorage.removeItem("gw-theme");localStorage.removeItem("gw-type")}catch(e){}` });

const hash = createHash("sha1").update(Buffer.from("7c9e6679742540de944be07fc1f90ae7", "hex")).update("user:priya", "utf8").digest();
hash[6] = (hash[6] & 0x0f) | 0x50; hash[8] = (hash[8] & 0x3f) | 0x80;
const h = hash.subarray(0, 16).toString("hex");
const sub = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
const jwt = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt().setExpirationTime("1d").sign(new TextEncoder().encode(process.env.SESSION_SECRET ?? "groundwork-dev-only-secret"));
await send("Network.setCookie", { name: "gw_session", value: jwt, url: origin, httpOnly: true });

await send("Page.navigate", { url: `${origin}/gc/projects/${projectId}/subcontracts/new` });
await sleep(2500);
const { root } = await send("DOM.getDocument");
const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: "#file" });
await send("DOM.setFileInputFiles", { nodeId, files: [resolve(pdf)] });
const fill = (sel, v) => js(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;set.call(e,${JSON.stringify(v)});e.dispatchEvent(new Event("input",{bubbles:true}));})()`);
await fill("#subName", subName);
await fill("#trade", "Painting");
await fill("#sum", "150,000.00");
await fill("#contactName", "Lena Ortiz");
await sleep(400);
await shot("upload-1-form");
await js(`document.querySelector('main form button[type="submit"]').click()`);

// Wait for the redirect to the contract page, then for the reading to finish (or fail).
let state = "waiting";
for (let i = 0; i < 150; i++) {
  await sleep(2000);
  const url = await js("location.pathname + location.search");
  if (url.startsWith("/sign-in")) { state = "signed out"; break; }
  if (!url.startsWith("/gc/contracts/")) {
    const err = await js(`document.querySelector('[role="alert"]')?.textContent ?? ""`);
    if (err) { state = `form error: ${err}`; break; }
    continue;
  }
  if (i === 3 || state === "waiting") { state = "reading"; await shot("upload-2-reading"); }
  const text = await js("document.body.innerText");
  if (/Version \d/.test(text) && !/Reading the contract/.test(text)) { state = "read"; break; }
  const err = await js(`document.querySelector('[role="alert"]')?.textContent ?? ""`);
  if (err) { state = `read error: ${err.slice(0, 200)}`; break; }
}
await shot("upload-3-result");
console.log(state, await js("location.pathname"));
await fetch(`http://localhost:9333/json/close/${tab.id}`);
ws.close();
