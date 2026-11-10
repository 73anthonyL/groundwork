// Smoke test: reset to a checkpoint, then fetch every page as each persona and report status + error markers.
import { SignJWT } from "jose";
import { createHash } from "node:crypto";
const base = "http://localhost:3000";
const NS = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
function stableId(name) {
  const hash = createHash("sha1").update(Buffer.from(NS.replace(/-/g, ""), "hex")).update(name, "utf8").digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
const cookie = async (user) => `gw_session=${await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(stableId(`user:${user}`)).setIssuedAt().setExpirationTime("1d").sign(new TextEncoder().encode("groundwork-dev-only-secret"))}`;
const to = process.argv[2] ?? "closeout";
const r = await fetch(`${base}/api/demo/reset?to=${to}`, { method: "POST" });
console.log("reset", r.status, await r.text());
const get = async (who, path) => {
  const res = await fetch(base + path, { headers: { cookie: await cookie(who) }, redirect: "manual" });
  const text = await res.text();
  const bad = /Application error|Unhandled Runtime Error|digest":|__next_error__/.test(text);
  console.log(String(res.status).padEnd(4), who.padEnd(6), path, bad ? "  <-- ERROR MARKER" : "", res.status >= 300 && res.status < 400 ? `-> ${res.headers.get("location")}` : "");
  return text;
};
const P = stableId("project:bayview-clinic-ti");
const C = (k) => stableId(`contract:${k}`);
const extra = process.argv.slice(3);
const board = await get("priya", `/gc/projects/${P}`);
for (const k of ["ironline", "pacific", "summit"]) await get("priya", `/gc/contracts/${C(k)}`);
const rel = [...new Set([...board.matchAll(/\/gc\/releases\/([0-9a-f-]{36})/g)].map((m) => m[1]))];
for (const id of rel.slice(0, 4)) await get("priya", `/gc/releases/${id}`);
const apps = [...new Set([...board.matchAll(/\/gc\/pay-apps\/([0-9a-f-]{36})/g)].map((m) => m[1]))];
for (const id of apps.slice(0, 2)) await get("priya", `/gc/pay-apps/${id}`);
for (const p of ["/gc", "/gc/ledger", "/demo", ...extra]) await get("priya", p);
const sub = await get("rosa", `/sub/contracts/${C("ironline")}`);
await get("rosa", "/sub");
await get("rosa", `/sub/pay-apps/new?contract=${C("ironline")}`);
const tok = [...new Set([...sub.matchAll(/\/w\/([\w-]{20,})/g)].map((m) => m[1]))];
console.log("sign links on sub page:", tok.length);
for (const t of tok.slice(0, 1)) await get("nobody", `/w/${t}`);
await get("dana", "/owner");
