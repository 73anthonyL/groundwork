import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` needs only the schema. `drizzle-kit push/studio` need a URL.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://unused:unused@localhost:5432/unused",
  },
  strict: true,
  verbose: true,
});
