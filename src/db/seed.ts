/**
 * Baseline seed: parties, the Bayview Clinic TI project, three subcontracts and their schedules of values.
 * Ids are deterministic (uuid v5) so demo URLs survive resets. Idempotent: re-running inserts nothing new.
 * Later demo checkpoints (compiled, intake, paid1, paid2) layer on top via scripts/demo-reset.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "./client";
import { sha256Hex, stableId } from "@/lib/ids";
import { dollars } from "@/lib/money";
import { extractPageTexts } from "@/lib/pdf/text";

export const ID = {
  org: {
    bayview: stableId("org:bayview-health"),
    meridian: stableId("org:meridian-builders"),
    ironline: stableId("org:ironline-steel"),
    pacific: stableId("org:pacific-electric"),
    summit: stableId("org:summit-drywall"),
  },
  user: {
    dana: stableId("user:dana"),
    priya: stableId("user:priya"),
    marcus: stableId("user:marcus"),
    elena: stableId("user:elena"),
    rosa: stableId("user:rosa"),
    tom: stableId("user:tom"),
    jamal: stableId("user:jamal"),
  },
  project: { bayview: stableId("project:bayview-clinic-ti") },
  contract: {
    ironline: stableId("contract:ironline"),
    pacific: stableId("contract:pacific"),
    summit: stableId("contract:summit"),
  },
} as const;

export const SEED = {
  organizations: [
    { id: ID.org.bayview, kind: "owner", name: "Bayview Health", slug: "bayview-health", city: "Oakland, CA" },
    {
      id: ID.org.meridian,
      kind: "gc",
      name: "Meridian Builders",
      slug: "meridian-builders",
      licenseNo: "CSLB 1083421",
      city: "Oakland, CA",
    },
    {
      id: ID.org.ironline,
      kind: "sub",
      name: "Ironline Steel",
      slug: "ironline-steel",
      licenseNo: "CSLB 994817",
      city: "Richmond, CA",
    },
    {
      id: ID.org.pacific,
      kind: "sub",
      name: "Pacific Electric",
      slug: "pacific-electric",
      licenseNo: "CSLB 1012276",
      city: "San Leandro, CA",
    },
    {
      id: ID.org.summit,
      kind: "sub",
      name: "Summit Drywall",
      slug: "summit-drywall",
      licenseNo: "CSLB 1057730",
      city: "Hayward, CA",
    },
  ],
  users: [
    { id: ID.user.dana, orgId: ID.org.bayview, name: "Dana Whitfield", email: "dana@bayviewhealth.example", title: "Director of Facilities", role: "admin" },
    { id: ID.user.priya, orgId: ID.org.meridian, name: "Priya Natarajan", email: "priya@meridianbuilders.example", title: "Controller", role: "admin" },
    { id: ID.user.marcus, orgId: ID.org.meridian, name: "Marcus Oyelaran", email: "marcus@meridianbuilders.example", title: "Project Manager", role: "pm" },
    { id: ID.user.elena, orgId: ID.org.meridian, name: "Elena Castro", email: "elena@meridianbuilders.example", title: "AP Specialist", role: "ap" },
    { id: ID.user.rosa, orgId: ID.org.ironline, name: "Rosa Delgado", email: "rosa@ironlinesteel.example", title: "Office Manager", role: "admin" },
    { id: ID.user.tom, orgId: ID.org.pacific, name: "Tom Nakamura", email: "tom@pacificelectric.example", title: "Owner", role: "admin" },
    { id: ID.user.jamal, orgId: ID.org.summit, name: "Jamal Reed", email: "jamal@summitdrywall.example", title: "Controller", role: "admin" },
  ],
  project: {
    id: ID.project.bayview,
    gcOrgId: ID.org.meridian,
    ownerOrgId: ID.org.bayview,
    name: "Bayview Clinic TI",
    address: "1400 Embarcadero West, Oakland, CA 94607",
    state: "CA",
    // Prime contract and all three subcontracts were entered into in late 2025, before the
    // Civ. Code §8811 5% retention cap took effect for contracts dated on/after 2026-01-01.
    contractDate: "2025-09-22",
    retentionCapBps: null,
    primeContractSumCents: dollars(4_200_000),
  },
  contracts: [
    {
      id: ID.contract.ironline,
      subOrgId: ID.org.ironline,
      title: "Subcontract — Structural & Miscellaneous Steel",
      trade: "Structural & Misc. Steel",
      contractSumCents: dollars(400_000),
      executedOn: "2025-11-18",
      file: "ironline-steel.pdf",
      sov: [
        ["Mobilization & submittals", 20_000],
        ["Shop drawings & engineering", 30_000],
        ["Structural steel — furnish", 150_000],
        ["Structural steel — erect", 120_000],
        ["Miscellaneous metals & stairs", 60_000],
        ["Closeout & punch list", 20_000],
      ],
    },
    {
      id: ID.contract.pacific,
      subOrgId: ID.org.pacific,
      title: "Subcontract — Electrical",
      trade: "Electrical",
      contractSumCents: dollars(300_000),
      executedOn: "2025-12-02",
      file: "pacific-electric.pdf",
      sov: [
        ["Mobilization & temporary power", 15_000],
        ["Rough-in conduit & boxes", 90_000],
        ["Feeders & panelboards", 70_000],
        ["Wire & devices", 60_000],
        ["Lighting fixtures", 45_000],
        ["Fire alarm & low voltage", 20_000],
      ],
    },
    {
      id: ID.contract.summit,
      subOrgId: ID.org.summit,
      title: "Subcontract — Drywall & Metal Framing",
      trade: "Drywall & Framing",
      contractSumCents: dollars(200_000),
      executedOn: "2025-12-09",
      file: "summit-drywall.pdf",
      sov: [
        ["Mobilization", 10_000],
        ["Metal stud framing", 70_000],
        ["Gypsum board — hang", 60_000],
        ["Tape, finish & level 4", 45_000],
        ["Closeout & punch list", 15_000],
      ],
    },
  ],
} as const;

export async function seedBaseline(db: Db) {
  await db.insert(schema.organizations).values([...SEED.organizations]).onConflictDoNothing();
  await db.insert(schema.users).values([...SEED.users]).onConflictDoNothing();
  await db.insert(schema.projects).values(SEED.project).onConflictDoNothing();
  for (const c of SEED.contracts) {
    await db
      .insert(schema.contracts)
      .values({
        id: c.id,
        projectId: SEED.project.id,
        gcOrgId: ID.org.meridian,
        subOrgId: c.subOrgId,
        title: c.title,
        trade: c.trade,
        contractSumCents: c.contractSumCents,
        executedOn: c.executedOn,
        status: "draft",
      })
      .onConflictDoNothing();
    await db
      .insert(schema.sovLines)
      .values(
        c.sov.map(([description, value], i) => ({
          id: stableId(`sov:${c.id}:${i + 1}`),
          contractId: c.id,
          lineNo: i + 1,
          description,
          scheduledValueCents: dollars(value),
        })),
      )
      .onConflictDoNothing();
  }
  await attachSeedDocuments(db);
}

/** Attach the rendered seed PDFs (seed/contracts/*.pdf) to contracts that have no document yet. */
export async function attachSeedDocuments(db: Db) {
  for (const c of SEED.contracts) {
    const file = path.resolve("seed/contracts", c.file);
    if (!existsSync(file)) continue;
    const [row] = await db.select({ documentId: schema.contracts.documentId }).from(schema.contracts).where(eq(schema.contracts.id, c.id));
    if (!row || row.documentId) continue;
    const bytes = readFileSync(file);
    const { pageCount, pages } = await extractPageTexts(new Uint8Array(bytes));
    const documentId = stableId(`document:${c.id}:${sha256Hex(bytes)}`);
    await db
      .insert(schema.documents)
      .values({
        id: documentId,
        orgId: ID.org.meridian,
        kind: "subcontract",
        filename: c.file,
        mime: "application/pdf",
        sha256: sha256Hex(bytes),
        bytesB64: bytes.toString("base64"),
        byteLength: bytes.length,
        pageCount,
        pageTexts: pages,
      })
      .onConflictDoNothing();
    await db.update(schema.contracts).set({ documentId }).where(eq(schema.contracts.id, c.id));
  }
}

/** Wipe every table (demo reset). Order does not matter with CASCADE. */
export async function truncateAll(db: Db) {
  const tables = [
    "webhook_inbox",
    "ledger_entries",
    "events",
    "payments",
    "lien_waivers",
    "releases",
    "retention_certifications",
    "backcharges",
    "change_orders",
    "owner_payment_events",
    "pay_application_lines",
    "pay_applications",
    "sov_lines",
    "rule_sets",
    "contracts",
    "documents",
    "projects",
    "users",
    "organizations",
  ];
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`));
}

if (process.argv[1]?.endsWith("seed.ts")) {
  getDb()
    .then(async (db) => {
      await seedBaseline(db);
      const n = await db.select({ id: schema.contracts.id }).from(schema.contracts);
      console.log(`seeded baseline: ${n.length} contracts`);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
