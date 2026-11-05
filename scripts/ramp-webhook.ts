/**
 * Register and verify the Ramp webhook for a deployed Groundwork.
 *   pnpm ramp:webhook https://<your-app>.vercel.app
 * Needs RAMP_CLIENT_ID/SECRET and the same DATABASE_URL as the deployment (the app stores Ramp's
 * verification challenge in webhook_inbox; this script reads it back and completes verification).
 * Prints the webhook secret once: set it as RAMP_WEBHOOK_SECRET on Vercel.
 */
import { and, eq, gte, like } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { RampRail } from "@/server/rails/ramp";

const appUrl = process.argv[2];
if (!appUrl) throw new Error("usage: pnpm ramp:webhook https://<app-host>");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must point at the deployment's database");

const startedAt = new Date();
const ramp = new RampRail();
const hook = await ramp.call<{ id: string; secret: string; status?: string }>("/developer/v1/webhooks", {
  method: "POST",
  body: JSON.stringify({ endpoint_url: `${appUrl.replace(/\/$/, "")}/api/webhooks/ramp`, event_types: ["bills.paid"] }),
});
console.log(`registered webhook ${hook.id}\nRAMP_WEBHOOK_SECRET=${hook.secret}`);

const db = await getDb();
for (let i = 0; i < 30; i++) {
  const row = await db.query.webhookInbox.findFirst({
    where: and(eq(schema.webhookInbox.rail, "ramp"), like(schema.webhookInbox.externalEventId, "verification:%"), gte(schema.webhookInbox.receivedAt, startedAt)),
    orderBy: (t, { desc }) => desc(t.receivedAt),
  });
  if (row) {
    const challenge = row.externalEventId.slice("verification:".length);
    await ramp.call(`/developer/v1/webhooks/${hook.id}/verify`, { method: "POST", body: JSON.stringify({ challenge }) });
    console.log("verified");
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 2000));
}
throw new Error("no verification challenge arrived within 60s; is the app deployed at that URL?");
