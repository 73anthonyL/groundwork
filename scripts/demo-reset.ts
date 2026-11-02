/**
 * Reset the database to a named demo checkpoint.
 *   pnpm demo:reset --to=fresh|compiled|intake|paid1|paid2
 *
 * If the app is running (GROUNDWORK_URL, default http://localhost:3000) the reset goes through
 * POST /api/demo/reset so the app's own database connection does the work. The embedded PGlite
 * database must never be opened by two processes at once. Otherwise the reset runs in-process.
 */
const to = (process.argv.find((a) => a.startsWith("--to=")) ?? "--to=fresh").slice(5);
const base = process.env.GROUNDWORK_URL ?? "http://localhost:3000";

async function viaHttp(): Promise<boolean> {
  try {
    const res = await fetch(`${base}/api/demo/reset?to=${encodeURIComponent(to)}`, {
      method: "POST",
      headers: process.env.DEMO_RESET_TOKEN ? { "x-demo-token": process.env.DEMO_RESET_TOKEN } : {},
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const body = (await res.json()) as { checkpoint: string; ms: number };
    console.log(`reset via ${base} → ${body.checkpoint} in ${body.ms} ms`);
    return true;
  } catch (e) {
    if ((e as Error).name === "TypeError" || /ECONNREFUSED|fetch failed/.test(String(e))) return false;
    throw e;
  }
}

async function main() {
  if (await viaHttp()) return process.exit(0);
  const { resetTo, CHECKPOINTS } = await import("../src/server/demo/reset");
  if (!CHECKPOINTS.includes(to as (typeof CHECKPOINTS)[number])) throw new Error(`unknown checkpoint "${to}"`);
  const r = await resetTo(to as (typeof CHECKPOINTS)[number]);
  console.log(`reset in-process → ${r.checkpoint} in ${r.ms} ms`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
