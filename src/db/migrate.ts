/** Apply committed SQL migrations in ./drizzle to the configured database. */
import { getDb, dbDriver } from "./client";

async function main() {
  if (dbDriver() === "neon") {
    const { Pool } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await migrate(drizzle({ client: pool }), { migrationsFolder: "./drizzle" });
    await pool.end();
    console.log("migrated: neon");
  } else {
    await getDb(); // PGlite migrates on connect
    console.log("migrated: pglite (./.data/pglite)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
