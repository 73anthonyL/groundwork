/**
 * Demo checkpoints, built by running the real actions in order so every row has a real history:
 *   fresh     parties, project, three subcontracts with PDFs, schedules of values
 *   compiled  Ironline rules approved (v1); Pacific extracted and waiting on review; Summit not compiled
 *   paid1     all three approved; Pay App #1 approved for each; Owner Payment #1 ($200,000) recorded,
 *             waivers signed, payments settled on the simulated rail
 *   intake    paid1 + Pay App #2 approved for Ironline and Pacific, Summit's #2 submitted with its 5% error
 *   paid2     intake + Summit corrected and approved; Owner Payment #2 ($125,000, partial) recorded,
 *             three releases awaiting waivers with live 7-day clocks
 *   closeout  paid2 settled, then everything after the rules: an approved change order and a pending
 *             one, a backcharge, a supplier one hop down, Owner Payment #3 ($175,000) with the
 *             backcharge set off and the supplier's share planned, Ironline's release waiting on its
 *             supplier's waiver, and half of Ironline's retainage certified and waiting on the owner
 * Runs inside the app process so the embedded PGlite database is never opened by two processes at once.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { getDb, schema, type Db } from "@/db/client";
import { ID, SEED, TEXAS, seedBaseline, truncateAll } from "@/db/seed";
import type { ExtractedRuleSet } from "@/domain/rules/schema";
import { ruleSetFromSpec, type ContractSpec } from "@/domain/rules/from-spec";
import { stableId } from "@/lib/ids";
import { dollars } from "@/lib/money";
import { acknowledgeAnomaly, approveRuleSet, createRuleSet, resolveField } from "@/server/actions/rules";
import { reviewPayApp, submitPayApp } from "@/server/actions/pay-apps";
import { recordOwnerPayment } from "@/server/actions/owner-payment";
import { settleSimulated, signWaiver } from "@/server/actions/payments";
import { now } from "@/server/clock";
import { certifyRetention, decideChangeOrder, proposeChangeOrder, recordBackcharge } from "@/server/actions/adjustments";
import { addLowerTierParty } from "@/server/actions/lower-tier";
import type { Actor } from "@/server/events";

export const CHECKPOINTS = ["fresh", "compiled", "paid1", "intake", "paid2", "closeout"] as const;
export type Checkpoint = (typeof CHECKPOINTS)[number];

const GC: Actor = { userId: ID.user.priya, label: "Priya Natarajan" };
const ELENA: Actor = { userId: ID.user.elena, label: "Elena Castro" };
const SUB: Record<"ironline" | "pacific" | "summit", Actor & { signer: string; title: string }> = {
  ironline: { userId: ID.user.rosa, label: "Rosa Delgado", signer: "Rosa Delgado", title: "Office Manager" },
  pacific: { userId: ID.user.tom, label: "Tom Nakamura", signer: "Tom Nakamura", title: "President" },
  summit: { userId: ID.user.jamal, label: "Jamal Reed", signer: "Jamal Reed", title: "Controller" },
};

function spec(slug: string): ContractSpec {
  return JSON.parse(readFileSync(path.resolve("seed/specs", `${slug}.json`), "utf8")) as ContractSpec;
}

async function pageTexts(db: Db, contractId: string): Promise<string[]> {
  const c = await db.query.contracts.findFirst({ where: eq(schema.contracts.id, contractId), with: { document: true } });
  if (!c?.document?.pageTexts) throw new Error(`contract ${contractId} has no document; run render:contracts`);
  return c.document.pageTexts;
}

async function extract(db: Db, key: "ironline" | "pacific" | "summit", slug: string, actor: Actor) {
  const contractId = ID.contract[key];
  const extracted = ruleSetFromSpec(spec(slug), await pageTexts(db, contractId));
  return createRuleSet({
    contractId,
    extracted,
    pageTexts: await pageTexts(db, contractId),
    model: "seed:spec",
    promptVersion: "seed-1",
    extractionMs: 0,
    actor,
    id: stableId(`ruleset:${key}:1`),
  });
}

async function applyCompiled(db: Db) {
  await extract(db, "ironline", "ironline-steel", ELENA);
  await approveRuleSet({ ruleSetId: stableId("ruleset:ironline:1"), actor: GC });
  await extract(db, "pacific", "pacific-electric", ELENA);
}

async function applyApproveRest() {
  // Pacific: the subjective release trigger becomes an operational one, chosen by the controller.
  const pacific = stableId("ruleset:pacific:1");
  await resolveField({
    ruleSetId: pacific,
    path: "retainage.release_condition",
    decision: "override",
    value: "Substantial Completion of the Subcontract Work as certified by the Architect, and Contractor's receipt of the corresponding retention from Owner",
    note: "'To Contractor's satisfaction' is not a date the engine can act on. Using Architect-certified Substantial Completion.",
    actor: GC,
  });
  await acknowledgeAnomaly({ ruleSetId: pacific, index: 0, note: "Resolved by override on retainage.release_condition.", actor: GC });
  await approveRuleSet({ ruleSetId: pacific, actor: GC });
}

async function applySummitCompiled(db: Db) {
  await extract(db, "summit", "summit-drywall", GC);
  const summit = stableId("ruleset:summit:1");
  await resolveField({
    ruleSetId: summit,
    path: "timing.type",
    decision: "accept",
    note: "Pay-if-paid is void in California (Clarke v. Safeco). Engine applies pay-when-paid with the 7-day §7108.5 clock.",
    actor: GC,
  });
  await acknowledgeAnomaly({ ruleSetId: summit, index: 0, note: "Acknowledged; unenforceable in CA.", actor: GC });
  await approveRuleSet({ ruleSetId: summit, actor: GC });
}

const sov = (key: keyof typeof ID.contract, n: number) => stableId(`sov:${ID.contract[key]}:${n}`);

async function applyPaid1(db: Db) {
  await applyApproveRest();
  await applySummitCompiled(db);
  const apps = [
    { key: "ironline" as const, lines: [[1, 20_000], [2, 30_000], [3, 50_000]], retainage: 10_000 },
    { key: "pacific" as const, lines: [[1, 15_000], [2, 45_000]], retainage: 3_000 },
    { key: "summit" as const, lines: [[1, 10_000], [2, 30_000]], retainage: 4_000 },
  ];
  for (const a of apps) {
    const id = stableId(`payapp:${a.key}:1`);
    await submitPayApp({
      id,
      contractId: ID.contract[a.key],
      number: 1,
      periodThrough: "2026-09-30",
      lines: a.lines.map(([n, d]) => ({ sovLineId: sov(a.key, n), thisPeriodCents: dollars(d), storedCents: 0 })),
      retainageBilledCents: dollars(a.retainage),
      previouslyBilledCents: 0,
      actor: SUB[a.key],
    });
    await reviewPayApp({ payAppId: id, decision: "approve", actor: GC });
  }
  const receivedAt = new Date("2026-10-14T17:05:00Z");
  await recordOwnerPayment({
    id: stableId("owner-payment:1"),
    projectId: ID.project.bayview,
    amountCents: dollars(200_000),
    receivedAt,
    periodThrough: "2026-09-30",
    reference: "ACH BVH-0147",
    actor: GC,
  });
  // Subs sign, payments go out on the simulated rail, bank settles, unconditional releases come back signed.
  const releases = await db.query.releases.findMany({ where: eq(schema.releases.eventId, stableId("owner-payment:1")), with: { waivers: true, contract: true } });
  for (const r of releases) {
    const key = (Object.keys(ID.contract) as (keyof typeof ID.contract)[]).find((k) => ID.contract[k] === r.contractId)!;
    const cond = r.waivers.find((w) => w.form === "cp_8132")!;
    await signWaiver({ waiverId: cond.id, signerName: SUB[key].signer, signerTitle: SUB[key].title, actor: SUB[key] });
    const payment = await db.query.payments.findFirst({ where: eq(schema.payments.releaseId, r.id) });
    await settleSimulated(payment!.id);
    const uncond = await db.query.lienWaivers.findFirst({ where: eq(schema.lienWaivers.releaseId, r.id), orderBy: (w, { desc }) => [desc(w.createdAt)] });
    if (uncond?.form === "up_8134") await signWaiver({ waiverId: uncond.id, signerName: SUB[key].signer, signerTitle: SUB[key].title, actor: SUB[key] });
  }
}

async function applyIntake() {
  const apps = [
    { key: "ironline" as const, lines: [[3, 60_000], [4, 40_000]], retainage: 10_000, prev: 100_000, approve: true },
    { key: "pacific" as const, lines: [[2, 45_000], [3, 55_000]], retainage: 5_000, prev: 60_000, approve: true },
    // Summit bills retainage at 5% instead of its contract's 10%: net overstated by $2,500.
    { key: "summit" as const, lines: [[2, 40_000], [3, 10_000]], retainage: 2_500, prev: 40_000, approve: false },
  ];
  for (const a of apps) {
    const id = stableId(`payapp:${a.key}:2`);
    await submitPayApp({
      id,
      contractId: ID.contract[a.key],
      number: 2,
      periodThrough: "2026-10-31",
      lines: a.lines.map(([n, d]) => ({ sovLineId: sov(a.key, n), thisPeriodCents: dollars(d), storedCents: 0 })),
      retainageBilledCents: dollars(a.retainage),
      previouslyBilledCents: dollars(a.prev),
      actor: SUB[a.key],
    });
    if (a.approve) await reviewPayApp({ payAppId: id, decision: "approve", actor: GC });
  }
}

async function applyPaid2() {
  await reviewPayApp({ payAppId: stableId("payapp:summit:2"), decision: "approve", applyCorrection: true, note: "Corrected retainage to the 10% in Rule R-3.", actor: GC });
  await recordOwnerPayment({
    id: stableId("owner-payment:2"),
    projectId: ID.project.bayview,
    amountCents: dollars(125_000),
    receivedAt: now(),
    periodThrough: "2026-10-31",
    reference: "ACH BVH-0162",
    actor: GC,
  });
}

export const CLOSEOUT = { rebarContract: stableId("contract:bay-rebar"), ownerPayment3: stableId("owner-payment:3") };

async function settleEvent(db: Db, eventId: string) {
  const releases = await db.query.releases.findMany({ where: eq(schema.releases.eventId, eventId), with: { waivers: true } });
  for (const r of releases) {
    const key = (Object.keys(ID.contract) as (keyof typeof ID.contract)[]).find((k) => ID.contract[k] === r.contractId);
    if (!key) continue;
    const cond = r.waivers.find((w) => w.status === "sent" && w.form.startsWith("c"));
    if (cond) await signWaiver({ waiverId: cond.id, signerName: SUB[key].signer, signerTitle: SUB[key].title, actor: SUB[key] });
    const payment = await db.query.payments.findFirst({ where: eq(schema.payments.releaseId, r.id) });
    if (payment?.status === "released") await settleSimulated(payment.id);
    const uncond = await db.query.lienWaivers.findFirst({ where: eq(schema.lienWaivers.releaseId, r.id), orderBy: (w, { desc }) => [desc(w.createdAt)] });
    if (uncond?.status === "sent" && uncond.form.startsWith("u")) await signWaiver({ waiverId: uncond.id, signerName: SUB[key].signer, signerTitle: SUB[key].title, actor: SUB[key] });
  }
}

/**
 * The Texas subcontract, compiled by the model ahead of time and replayed from its cached extraction.
 * It is left in review: the reviewer sees what Texas law does to a contract written for another state.
 */
async function applyTexasCompiled(db: Db) {
  const file = path.resolve(TEXAS.contract.cache);
  if (!existsSync(file)) return;
  const cached = JSON.parse(readFileSync(file, "utf8")) as { extracted: ExtractedRuleSet; model: string; promptVersion: string; ms: number };
  await createRuleSet({ contractId: TEXAS.contract.id, extracted: cached.extracted, pageTexts: await pageTexts(db, TEXAS.contract.id), model: `${cached.model} (cached)`, promptVersion: cached.promptVersion, extractionMs: cached.ms, actor: ELENA, id: stableId("ruleset:lonestar:1") });
}

async function applyCloseout(db: Db) {
  await settleEvent(db, stableId("owner-payment:2"));
  // Change orders: one approved (raises Ironline's sum to $420,000), one waiting on the controller.
  const co = await proposeChangeOrder({ id: stableId("co:ironline:1"), contractId: ID.contract.ironline, title: "Added roof screen framing", description: "Owner-directed screen wall at mechanical yard, ASI-07.", amountCents: dollars(20_000), actor: SUB.ironline });
  await decideChangeOrder({ changeOrderId: co.id, decision: "approve", note: "Per ASI-07; owner change order OCO-3 executed.", actor: GC });
  await proposeChangeOrder({ id: stableId("co:pacific:1"), contractId: ID.contract.pacific, title: "Relocate panel EP-2 per RFI-41", description: "Two added 20A circuits and 40 ft of conduit.", amountCents: dollars(6_400), actor: SUB.pacific });
  // A backcharge against Summit, on the notice its subcontract requires.
  await recordBackcharge({ id: stableId("backcharge:summit:1"), contractId: ID.contract.summit, amountCents: dollars(1_500), reason: "Cleanup of drywall debris on level 2 after five business days' written notice", noticeDate: "2026-10-20", actor: GC });
  // One hop down: Ironline's rebar supplier, declared on Ironline's third application.
  await addLowerTierParty({ id: CLOSEOUT.rebarContract, parentContractId: ID.contract.ironline, name: "Bay Rebar Supply", kind: "supplier", scope: "Reinforcing steel and embeds", sumCents: dollars(60_000), actor: SUB.ironline });
  const coLine = await db.query.sovLines.findFirst({ where: eq(schema.sovLines.id, (await db.query.changeOrders.findFirst({ where: eq(schema.changeOrders.id, co.id) }))!.sovLineId!) });
  const app = await submitPayApp({
    id: stableId("payapp:ironline:3"),
    contractId: ID.contract.ironline,
    number: 3,
    periodThrough: "2026-11-30",
    lines: [
      { sovLineId: coLine!.id, thisPeriodCents: dollars(20_000), storedCents: 0 },
      { sovLineId: sov("ironline", 5), thisPeriodCents: dollars(30_000), storedCents: 0 },
    ],
    retainageBilledCents: dollars(5_000),
    previouslyBilledCents: dollars(200_000),
    lowerTier: [{ contractId: CLOSEOUT.rebarContract, amountCents: dollars(12_000) }],
    actor: SUB.ironline,
  });
  await reviewPayApp({ payAppId: app.id, decision: "approve", actor: GC });
  // Owner Payment #3 funds everything outstanding: the rest of Pay App #2 and Ironline's #3.
  await recordOwnerPayment({ id: CLOSEOUT.ownerPayment3, projectId: ID.project.bayview, amountCents: dollars(175_000), receivedAt: now(), periodThrough: "2026-11-30", reference: "ACH BVH-0188", actor: GC });
  // Ironline signs its own waiver for #3; the release now waits on Bay Rebar's signature.
  const iron3 = await db.query.releases.findFirst({ where: and(eq(schema.releases.eventId, CLOSEOUT.ownerPayment3), eq(schema.releases.payApplicationId, app.id)), with: { waivers: true } });
  await signWaiver({ waiverId: iron3!.waivers[0].id, signerName: SUB.ironline.signer, signerTitle: SUB.ironline.title, actor: SUB.ironline });
  // Substantial Completion: half of Ironline's retainage is certified and waits for the owner's retention.
  await certifyRetention({ id: stableId("cert:ironline:1"), contractId: ID.contract.ironline, releaseBps: 5_000, note: "Architect certified Substantial Completion of the steel scope.", actor: GC });
}

export async function resetTo(checkpoint: Checkpoint): Promise<{ checkpoint: Checkpoint; ms: number }> {
  const db = await getDb();
  const t0 = Date.now();
  await truncateAll(db);
  await seedBaseline(db);
  const order = CHECKPOINTS.indexOf(checkpoint);
  if (order >= 1) await applyCompiled(db);
  if (order >= 2) await applyPaid1(db);
  if (order >= 3) await applyIntake();
  if (order >= 4) await applyPaid2();
  if (order >= 5) await applyCloseout(db);
  if (order >= 1) await applyTexasCompiled(db);
  return { checkpoint, ms: Date.now() - t0 };
}

export { SEED };
