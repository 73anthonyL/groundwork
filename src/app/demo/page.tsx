import Link from "next/link";
import { redirect } from "next/navigation";
import { homeFor, isSampleWorkspace, requireAuth } from "@/server/auth";
import { AppShell } from "@/components/app-shell";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Panel, Section } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CHECKPOINTS } from "@/server/demo/reset";
import { now } from "@/server/clock";
import { hasApiKey } from "@/lib/ai/client";
import { railName } from "@/server/rails";
import { dbDriver } from "@/db/client";
import { demoOutbox } from "@/server/scoped";
import { formatCents } from "@/lib/money";
import { resetAction, settleAllAction } from "./actions";

export const metadata = { title: "Sample workspace" };

const POINTS: Record<(typeof CHECKPOINTS)[number], { name: string; what: string }> = {
  fresh: { name: "Start", what: "Two projects, their companies and three subcontracts with PDFs and schedules of values. No contract has been read yet." },
  compiled: { name: "Contracts read", what: "Ironline's payment rules are approved. Pacific's are read and waiting on review. Summit's has not been read: read it yourself." },
  paid1: { name: "First owner payment", what: "All three subcontracts approved. Pay app 1 approved and paid from owner payment 1 ($200,000). Waivers signed, payments paid." },
  intake: { name: "Second pay apps in", what: "Pay app 2 approved for Ironline and Pacific. Summit's is submitted with retainage at 5% where the contract says 10%." },
  paid2: { name: "Second owner payment", what: "Summit corrected and approved. Owner payment 2 ($125,000, partial) recorded. Three payments wait on waivers with deadlines running." },
  closeout: { name: "Closeout", what: "A change order, a backcharge and a rebar supplier one level down. Owner payment 3 ($175,000) sets off the backcharge; Ironline waits on its supplier's waiver; half its retainage is certified." },
};

/** Controls for the sample workspace: rebuild its data at a known point, settle its test payments, open lower-tier waiver links. */
export default async function SampleWorkspacePage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const session = await requireAuth();
  if (!isSampleWorkspace(session.org)) redirect(homeFor(session.org.kind));
  const { msg } = await searchParams;
  const outbox = await demoOutbox();
  const home = homeFor(session.org.kind);
  return (
    <AppShell session={session}>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: home }, { label: "Sample workspace" }]}
        title="Sample workspace"
        description="Sample data anyone can change. Reset it here."
      />
      <PageBody>
        {msg && (
          <p role="status" className="rounded-md border bg-card px-3 py-2">
            {msg}
          </p>
        )}

        <Section title="Reset to a point" description="A reset replaces the sample data for everyone.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Point</TableHead>
                <TableHead>What the workspace holds</TableHead>
                <TableHead>
                  <span className="sr-only">Reset</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CHECKPOINTS.map((c) => (
                <TableRow key={c} className="align-top">
                  <TableCell className="font-medium whitespace-nowrap">{POINTS[c].name}</TableCell>
                  <TableCell muted className="min-w-64">
                    {POINTS[c].what}
                  </TableCell>
                  <TableCell className="text-right">
                    <form action={resetAction}>
                      <input type="hidden" name="to" value={c} />
                      <Button type="submit" variant="secondary" size="sm" aria-label={`Reset to ${POINTS[c].name}`}>
                        Reset
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <Panel
          title="Test payments"
          description="Marks every sent sample payment as paid."
          actions={
            <form action={settleAllAction}>
              <Button type="submit" variant="secondary" size="sm">
                Mark sent payments as paid
              </Button>
            </form>
          }
          padded={false}
        />

        <Section title="Waiver links for lower-tier parties" description="Signing links for parties without an account.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>To</TableHead>
                <TableHead>Asked to</TableHead>
                <TableHead>From</TableHead>
                <TableHead numeric>Amount</TableHead>
                <TableHead>
                  <span className="sr-only">Link</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outbox.length === 0 && <TableEmpty colSpan={5}>No waivers are waiting on a lower-tier signature.</TableEmpty>}
              {outbox.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.to}</TableCell>
                  <TableCell>{m.form.startsWith("c") ? "Sign to release payment" : "Confirm receipt"}</TableCell>
                  <TableCell>{m.from}</TableCell>
                  <TableCell numeric>{formatCents(m.cents)}</TableCell>
                  <TableCell className="text-right">
                    <Link href={m.href} className="rounded-sm text-link underline-offset-4 hover:underline">
                      Open link
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <Section title="Environment">
          <dl className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Clock", `${now().toISOString().slice(0, 16).replace("T", " ")} UTC${process.env.DEMO_NOW ? " (fixed)" : ""}`],
              ["Database", dbDriver() === "neon" ? "Neon Postgres" : "Embedded PGlite"],
              ["Payment rail", railName()],
              ["Claude API key", hasApiKey() ? "Configured" : "Missing; saved readings are used"],
            ].map(([k, v]) => (
              <div key={k} className="border-b px-4 py-3 last:border-b-0 sm:border-r lg:border-b-0 lg:last:border-r-0">
                <dt className="type-caption text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 font-medium break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <p className="type-meta text-muted-foreground">
          To see the workspace as someone else,{" "}
          <Link href="/sample" className="rounded-sm underline underline-offset-4 hover:text-foreground">
            choose another person
          </Link>
          . The subcontractor pages are built for a phone.
        </p>
      </PageBody>
    </AppShell>
  );
}
