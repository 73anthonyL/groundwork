// Dev tool: real-time screenshots through headless Chrome's DevTools protocol, so animations finish.
//   node scripts/shot.mjs <out.png> <url> [width=1440] [waitMs=4500] [fullPage=1]
// Prints console errors from the page. Needs Chrome started with --remote-debugging-port=9333.
// REDUCE=1 emulates prefers-reduced-motion.
// PERSONA=priya signs the tab in as that seeded user (dev secret) before loading the page.
const [out, url, width = "1440", wait = "4500", full = "1"] = process.argv.slice(2);
import { writeFileSync } from "node:fs";
const tab = await (await fetch(`http://localhost:9333/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg.result ?? msg.error);
  if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
};
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await send("Runtime.enable");
await send("Page.enable");
// A background tab gets no animation frames; make this one behave as the focused, visible tab.
await send("Page.bringToFront");
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: Number(width), height: 900, deviceScaleFactor: 1, mobile: false });
if (process.env.PERSONA) {
  const { SignJWT } = await import("jose");
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha1").update(Buffer.from("7c9e6679742540de944be07fc1f90ae7", "hex")).update(`user:${process.env.PERSONA}`, "utf8").digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString("hex");
  const sub = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  const jwt = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt().setExpirationTime("1d").sign(new TextEncoder().encode(process.env.SESSION_SECRET ?? "groundwork-dev-only-secret"));
  await send("Network.setCookie", { name: "gw_session", value: jwt, url: new URL(url).origin, httpOnly: true });
} else {
  await send("Network.clearBrowserCookies");
}
if (process.env.THEME || process.env.TYPE) {
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `try{${process.env.THEME ? `localStorage.setItem("gw-theme","${process.env.THEME}");` : ""}${process.env.TYPE ? `localStorage.setItem("gw-type","${process.env.TYPE}");` : ""}}catch(e){}` });
}
// REDUCE=1 renders the page as someone with "reduce motion" switched on sees it.
if (process.env.REDUCE) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await send("Page.navigate", { url });
await new Promise((r) => setTimeout(r, 1500));
// Scroll through the page so in-view animations start, then return to the top.
await send("Runtime.evaluate", { expression: `(async()=>{const h=document.documentElement.scrollHeight;for(let y=0;y<h;y+=500){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120))}window.scrollTo(0,0)})()`, awaitPromise: true });
await new Promise((r) => setTimeout(r, Number(wait)));
const { result } = await send("Runtime.evaluate", { expression: "document.documentElement.scrollHeight" });
if (full === "1") await send("Emulation.setDeviceMetricsOverride", { width: Number(width), height: Math.min(result.value, 9000), deviceScaleFactor: 1, mobile: false });
await new Promise((r) => setTimeout(r, 400));
// SCROLL_TO=<css selector> captures the viewport with that element at the top instead of the full page.
if (process.env.SCROLL_TO) {
  await send("Emulation.setDeviceMetricsOverride", { width: Number(width), height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Runtime.evaluate", { expression: `document.querySelector(${JSON.stringify(process.env.SCROLL_TO)})?.scrollIntoView({block:"start"})` });
  await new Promise((r) => setTimeout(r, 900));
}
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(out, result.value + "px tall", errors.length ? `\nconsole errors:\n- ${[...new Set(errors)].slice(0, 8).join("\n- ")}` : "· no console errors");
await fetch(`http://localhost:9333/json/close/${tab.id}`);
ws.close();
