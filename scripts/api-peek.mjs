import { SignJWT } from "jose";
import { createHash } from "node:crypto";
const NS = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
function stableId(name) { const hash = createHash("sha1").update(Buffer.from(NS.replace(/-/g, ""), "hex")).update(name, "utf8").digest(); hash[6] = (hash[6] & 0x0f) | 0x50; hash[8] = (hash[8] & 0x3f) | 0x80; const h = hash.subarray(0, 16).toString("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; }
const cookie = `gw_session=${await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(stableId(`user:${process.argv[3] ?? "priya"}`)).setIssuedAt().setExpirationTime("1d").sign(new TextEncoder().encode("groundwork-dev-only-secret"))}`;
const res = await fetch("http://localhost:3000" + process.argv[2], { headers: { cookie } });
const j = await res.json();
const d = j.data ?? j;
const $ = (c) => "$" + (c / 100).toLocaleString();
if (d.summary) { console.log("totals", JSON.stringify(d.summary.totals)); console.log("balances", JSON.stringify(d.summary.balances)); for (const c of d.summary.contracts) console.log(" ", c.tier, c.payee.padEnd(18), "sum", $(c.contractSumCents), "billed", $(c.billedCents), "paid", $(c.paidCents), "moving", $(c.inMotionCents), "held", $(c.retainageHeldCents)); }
if (d.flow) { console.log("nodes", d.flow.nodes.map((n) => n.label).join(" | ")); for (const e of d.flow.events) console.log(" ev", e.tier, e.reference, $(e.amountCents), e.links.map((l) => `${l.source.slice(0, 6)}>${l.target.slice(0, 8)}:${l.kind}:${$(l.cents)}`).join(", ")); }
if (d.timeline) console.log("timeline", d.timeline.length, d.timeline.slice(-4).map((t) => `${t.lane}/${t.title}/${t.party}/${t.amountCents}`).join(" ; "));
if (d.series) for (const pt of d.series) console.log(" pt", pt.memo.slice(0, 34).padEnd(34), Object.entries(pt.balances).map(([k, v]) => `${k}:${v / 100}`).join(" "));
if (d.clocks) for (const c of d.clocks) console.log(" clock", c.tier, c.party, $(c.cents), c.status, c.payByAt, c.elapsed?.toFixed(3), c.citations.map((x) => x.cite).join("+"));
