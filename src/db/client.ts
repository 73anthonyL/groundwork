/**
 * Database client.
 *
 * - DATABASE_URL set  → Neon serverless Postgres over WebSocket (production on Vercel).
 * - DATABASE_URL empty → embedded PGlite (WASM Postgres) at ./.data/pglite, or in memory for tests.
 *
 * Both return the same Drizzle API, so application code never branches on the driver.
 */
import * as schema from "./schema";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

type Holder = { db?: Db; ready?: Promise<Db>; driver?: "neon" | "pglite" };
const holder: Holder = ((globalThis as unknown as { __groundworkDb?: Holder }).__groundworkDb ??= {});

export function dbDriver(): "neon" | "pglite" {
  return process.env.DATABASE_URL ? "neon" : "pglite";
}

async function create(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    // WebSocket driver: supports interactive transactions (neon-http does not).
    const { Pool } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    holder.driver = "neon";
    return drizzle({ client: pool, schema, casing: "snake_case" }) as unknown as Db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const inMemory = process.env.PGLITE_MEMORY === "1" || process.env.NODE_ENV === "test";
  let client: InstanceType<typeof PGlite>;
  if (inMemory) {
    client = new PGlite();
  } else {
    const dir = process.env.PGLITE_DIR ?? "./.data/pglite";
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true }); // PGlite creates the leaf dir only
    client = new PGlite(dir);
  }
  await client.waitReady;
  const db = drizzle({ client, schema, casing: "snake_case" });
  // Embedded DB migrates itself on first connect; idempotent and fast.
  await migrate(db, { migrationsFolder: "./drizzle" });
  holder.driver = "pglite";
  return db as unknown as Db;
}

/** Lazily create the singleton (survives HMR via globalThis). */
export function getDb(): Promise<Db> {
  if (holder.db) return Promise.resolve(holder.db);
  holder.ready ??= create().then((db) => (holder.db = db));
  return holder.ready;
}

/** Tests: drop the singleton so each file gets a fresh in-memory database. */
export async function resetDbForTests() {
  holder.db = undefined;
  holder.ready = undefined;
}

export { schema };
