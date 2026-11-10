import Link from "next/link";
import { requireAuth } from "@/server/auth";
import { AppShell } from "@/components/app-shell";
import { GC_NAV } from "@/components/gc-nav";
import { Button } from "@/components/ui/button";
import { CHECKPOINTS } from "@/server/demo/reset";
import { now } from "@/server/clock";
import { hasApiKey } from "@/lib/ai/client";
import { railName } from "@/server/rails";
import { dbDriver } from "@/db/client";
import { resetAction, settleAllAction } from "./actions";
import { demoOutbox } from "@/server/scoped";
import { formatCents } from "@/lib/money";

const DESCRIPTIONS: Record<(typeof CHECKPOINTS)[number], string> = {
  fresh: "Parties, project, three subcontracts with PDFs, schedules of values. Nothing compiled.",
  compiled: "Ironline approved. Pacific extracted and waiting on review (subjective release trigger). Summit not compiled: compile it live.",
  paid1: "All three approved. Pay App #1 approved and funded by Owner Payment #1 ($200,000). Waivers signed, payments settled.",
  intake: "paid1 + Pay App #2 approved for Ironline and Pacific. Summit's #2 submitted with retainage at 5% instead of 10%.",
  paid2: "intake + Summit corrected and approved. Owner Payment #2 ($125,000, partial) recorded. Three releases await waivers with live clocks.",
  closeout: "paid2 settled, then a change order, a backcharge and a rebar supplier one hop down. Owner Payment #3 ($175,000) sets off the backcharge and plans the supplier's share; Ironline's release waits on its supplier's waiver; half of Ironline's retainage is certified and waits for the owner.",
};

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const session = await requireAuth("gc");
  const { msg } = await searchParams;
  const outbox = await demoOutbox();
  return (
    <AppShell session={session} nav={GC_NAV}>
      <h1 className="text-3xl font-semibold">Demo panel</h1>
      <p className="mt-1 text-sm text-muted-foreground">Every checkpoint is rebuilt by running the real actions in order, so every row has a real history.</p>
      {msg && (
        <p role="status" className="mt-3 rounded-xl bg-card shadow-card px-3 py-2 text-sm">
          {decodeURIComponent(msg)}
        </p>
      )}
      <dl className="mt-6 grid gap-px overflow-hidden rounded-md border bg-border text-sm sm:grid-cols-4">
        {[
          ["Clock", `${now().toISOString()}${process.env.DEMO_NOW ? " (frozen by DEMO_NOW)" : ""}`],
          ["Database", dbDriver() === "neon" ? "Neon Postgres" : "Embedded PGlite"],
          ["Payment rail", railName()],
          ["Claude API key", hasApiKey() ? "configured" : "missing → cached extractions"],
        ].map(([k, v]) => (
          <div key={k} className="bg-card p-3">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 break-all font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <section className="mt-8" aria-labelledby="checkpoints">
        <h2 id="checkpoints" className="text-lg font-semibold">
          Reset to a checkpoint
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {CHECKPOINTS.map((c) => (
            <li key={c} className="flex items-start justify-between gap-3 rounded-xl bg-card shadow-card p-4">
              <div>
                <div className="font-mono text-sm font-semibold">{c}</div>
                <div className="mt-1 text-sm text-muted-foreground">{DESCRIPTIONS[c]}</div>
              </div>
              <form action={resetAction}>
                <input type="hidden" name="to" value={c} />
                <Button type="submit" variant="outline" size="sm">
                  Reset
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-8" aria-labelledby="ops">
        <h2 id="ops" className="text-lg font-semibold">
          Bank
        </h2>
        <form action={settleAllAction} className="mt-3 flex items-center gap-3 rounded-xl bg-card shadow-card p-4">
          <Button type="submit" variant="outline" size="sm">
            Settle every released payment
          </Button>
          <span className="text-sm text-muted-foreground">Posts a synthetic bill.paid webhook for each payment on the simulated rail.</span>
        </form>
      </section>
      <section className="mt-8" aria-labelledby="outbox">
        <h2 id="outbox" className="text-lg font-semibold">
          Outbox
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Suppliers and sub-subcontractors have no account. Groundwork would email each one a signing link; this demo lists those messages here instead. The party that pays them never sees the link.
        </p>
        {outbox.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed bg-transparent p-4 text-sm text-muted-foreground">No waivers are waiting on a lower-tier signature.</p>
        ) : (
          <ul className="mt-3 divide-y rounded-xl bg-card shadow-card">
            {outbox.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  To <span className="font-medium">{m.to}</span> · {m.form.startsWith("c") ? "sign to release" : "confirm receipt of"} <span className="num font-medium">{formatCents(m.cents)}</span> from {m.from}
                </span>
                <Link href={m.href} className="font-medium text-link hover:underline">
                  Open their link
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-8" aria-labelledby="personas">
        <h2 id="personas" className="text-lg font-semibold">
          Switch persona
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign out, then pick a seat on the <Link href="/sign-in" className="underline underline-offset-2">sign-in page</Link>. Open the sub portal on a phone for the second screen.
        </p>
      </section>
    </AppShell>
  );
}
