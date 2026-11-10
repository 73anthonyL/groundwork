import Link from "next/link";
import { FileText, PenLine, Receipt } from "lucide-react";
import { requireAuth } from "@/server/auth";
import { listReleasesForOrg } from "@/server/scoped";
import { listBillableContracts } from "@/server/read/sub";
import { now } from "@/server/clock";
import { formatCents, formatCentsCompact } from "@/lib/money";
import { releaseLabel } from "@/lib/release-label";
import { PageBody, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Checklist } from "@/components/ui/checklist";
import { Panel, Section } from "@/components/ui/panel";
import { Stat, StatGroup } from "@/components/ui/stat";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableLink, TableRow } from "@/components/ui/table";
import { StatusPill } from "@/components/status-pill";
import { SUB_CONTRACT } from "./_shared/status";
import { PaymentsTable } from "./_shared/payments-table";
import { deadlineSource, isConditional, isOnItsWay, isPaid, isoDay, longDay, relativeDays, retainageHeld } from "./_shared/format";

export const metadata = { title: "Home" };

type Task = { id: string; icon: React.ReactNode; title: string; detail: React.ReactNode; href: string; action: string };

export default async function SubHome() {
  const { org, user } = await requireAuth("sub");
  const [contracts, releases] = await Promise.all([listBillableContracts(org), listReleasesForOrg(org)]);
  const at = now();
  const nowIso = at.toISOString();
  const firstName = user.name.split(" ")[0];

  // A subcontractor who has just accepted an invitation: nothing is approved, billed or paid yet.
  const started = contracts.some((c) => c.status === "active" || c.payApplications.length > 0) || releases.length > 0;
  if (!started) return <Welcome firstName={firstName} orgName={org.name} contracts={contracts} />;

  // ── To do ────────────────────────────────────────────────────────────────
  const tasks: Task[] = [];
  for (const r of releases) {
    for (const w of r.waivers.filter((w) => w.status === "sent")) {
      const conditional = isConditional(w.form);
      tasks.push({
        id: `waiver-${w.id}`,
        icon: <PenLine aria-hidden />,
        title: `${releaseLabel(r)} on ${r.contract.project.name}`,
        detail: conditional
          ? `Your payment is ready. It is sent once you sign the conditional waiver${r.payByAt ? `, and is due by ${longDay(r.payByAt)}` : ""}.`
          : `${formatCents(r.releaseCents)} has landed. Signing the unconditional waiver confirms you were paid and closes this payment.`,
        href: `/sub/waivers/${w.id}/sign`,
        action: conditional ? `Sign waiver to release ${formatCents(r.releaseCents)}` : `Confirm you received ${formatCents(r.releaseCents)}`,
      });
    }
  }
  for (const c of contracts) {
    for (const p of c.payApplications.filter((p) => p.status === "changes_requested")) {
      tasks.push({
        id: `fix-${p.id}`,
        icon: <FileText aria-hidden />,
        title: `Pay app #${p.number} on ${c.project.name} was sent back`,
        detail: p.reviewNote ? `${c.payer.name} wrote: “${p.reviewNote}”` : `${c.payer.name} asked for a correction before approving it.`,
        href: `/sub/contracts/${c.id}#pay-apps`,
        action: "See what to correct",
      });
    }
    if (c.billing.billable) {
      tasks.push({
        id: `bill-${c.id}`,
        icon: <Receipt aria-hidden />,
        title: `${c.trade} on ${c.project.name}`,
        detail: `Pay app #${c.billing.nextNumber}, for work through ${isoDay(c.billing.periodThrough)}. ${formatCents(c.billing.balanceCents)} of the contract is left to bill.`,
        href: `/sub/pay-apps/new?contract=${c.id}`,
        action: `Bill for ${c.billing.periodMonth}`,
      });
    }
  }

  // ── Where is my money ────────────────────────────────────────────────────
  const coming = releases.filter(isOnItsWay);
  const owed = coming.reduce((s, r) => s + r.releaseCents, 0);
  const paid = releases.filter((r) => isPaid(r.status)).reduce((s, r) => s + r.releaseCents, 0);
  const held = releases.reduce((s, r) => s + retainageHeld(r), 0);
  const unsigned = coming.filter((r) => r.waivers.some((w) => w.status === "sent" && isConditional(w.form)));
  const blocked = coming.filter((r) => r.status === "blocked");
  const next = coming.filter((r) => r.payByAt !== null).sort((a, b) => a.payByAt!.getTime() - b.payByAt!.getTime())[0];
  const inReview = contracts.flatMap((c) => c.payApplications.filter((p) => p.status === "submitted").map((p) => ({ p, c })));
  const approved = contracts.flatMap((c) => c.payApplications.filter((p) => p.status === "approved").map((p) => ({ p, c })));
  const billable = contracts.find((c) => c.billing.billable);

  let sentence: string;
  if (owed > 0) {
    const parts: string[] = [];
    if (unsigned.length) parts.push(`${unsigned.length === coming.length ? (coming.length === 1 ? "It is" : "All of it is") : `${formatCents(unsigned.reduce((s, r) => s + r.releaseCents, 0))} of it is`} waiting for your signature on a waiver.`);
    else if (blocked.length) parts.push(`${blocked.length === 1 ? "A payment is" : `${blocked.length} payments are`} on hold. Open ${blocked.length === 1 ? "it" : "them"} below to see why.`);
    else parts.push(coming.length === 1 ? "Your waiver is signed and the payment is being sent." : "Your waivers are signed and the payments are being sent.");
    if (next?.payByAt) {
      const late = next.payByAt.getTime() < at.getTime();
      const payer = contracts.find((c) => c.id === next.contractId)?.payer.name ?? "The contractor";
      parts.push(
        late
          ? `${payer} had to pay you by ${longDay(next.payByAt)}, ${relativeDays(next.payByAt, at)}. That deadline comes from ${deadlineSource(next.basis)}.`
          : `${coming.length > 1 ? "The first deadline: " : ""}${payer} must pay you by ${longDay(next.payByAt)}, ${relativeDays(next.payByAt, at)}. That deadline comes from ${deadlineSource(next.basis)}.`,
      );
    }
    sentence = parts.join(" ");
  } else if (approved.length) {
    const { p, c } = approved[0];
    sentence = `Nothing has been released yet. Pay app #${p.number} (${formatCents(p.netDueApprovedCents ?? p.netDueBilledCents)}) is approved and waiting for the owner to pay ${c.payer.name}. Your deadline starts the day that payment arrives.`;
  } else if (inReview.length) {
    const { p, c } = inReview[0];
    sentence = `Nothing has been released yet. Pay app #${p.number} (${formatCents(p.netDueBilledCents)}) is with ${c.payer.name} for review.`;
  } else if (billable) {
    sentence = `Nothing is on its way. Bill for ${billable.billing.periodMonth} to start your next payment.`;
  } else {
    sentence = "Nothing is on its way right now.";
  }

  return (
    <>
      <PageHeader title="Home" description={`${org.name}: what needs you, and where your money is.`} />
      <PageBody>
        <Section title="To do" actions={tasks.length > 0 ? <Badge tone="hold">{tasks.length} waiting on you</Badge> : undefined}>
          {tasks.length === 0 ? (
            <p className="rounded-lg border border-dashed border-input px-4 py-4 text-sm text-muted-foreground">
              Nothing needs you right now. {inReview.length ? `Pay app #${inReview[0].p.number} is with ${inReview[0].c.payer.name} for review.` : "A task appears here when a payment needs your signature or a new period can be billed."}
            </p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-lg border bg-card">
              {tasks.map((t, i) => (
                <li key={t.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <div className="flex min-w-0 gap-3">
                    <span className="mt-0.5 text-muted-foreground [&>svg]:size-4">{t.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm leading-5 font-medium">{t.title}</p>
                      <p className="type-meta mt-0.5 max-w-xl text-muted-foreground">{t.detail}</p>
                    </div>
                  </div>
                  <Link href={t.href} className={buttonVariants({ variant: i === 0 ? "primary" : "secondary", className: "shrink-0 max-sm:h-10 max-sm:w-full" })}>
                    {t.action}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <section aria-labelledby="money-heading" className="grid gap-x-10 gap-y-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-end">
          <div className="min-w-0">
            <h2 id="money-heading" className="type-meta text-muted-foreground">
              On its way to you
            </h2>
            <p className={`num type-figure mt-1 ${owed > 0 ? "text-money" : ""}`}>{formatCents(owed)}</p>
            <p className="mt-1 max-w-xl text-sm leading-5 text-muted-foreground">{sentence}</p>
          </div>
          <StatGroup>
            <Stat label="Paid to date" value={formatCentsCompact(paid)} />
            <Stat label="Held as retainage" value={formatCentsCompact(held)} hint={held > 0 ? "Released when your contract says so" : undefined} />
          </StatGroup>
        </section>

        <Section
          title="Recent payments"
          actions={
            releases.length > 5 ? (
              <Link href="/sub/payments" className={buttonVariants({ variant: "tertiary", size: "sm" })}>
                All {releases.length} payments
              </Link>
            ) : undefined
          }
        >
          <PaymentsTable releases={releases.slice(0, 5)} nowIso={nowIso} empty="No payments yet. One appears here when the owner pays the contractor for a pay app you submitted." />
        </Section>

        <Section title="Contracts">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract</TableHead>
                <TableHead className="max-md:hidden">Contractor</TableHead>
                <TableHead className="max-sm:hidden">Payment rules</TableHead>
                <TableHead numeric className="max-md:hidden">
                  Billed
                </TableHead>
                <TableHead numeric>Contract sum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <TableLink href={`/sub/contracts/${c.id}`}>{c.trade}</TableLink>
                    <div className="type-meta text-muted-foreground">{c.project.name}</div>
                    <div className="mt-1 sm:hidden">
                      <StatusPill status={c.status} map={SUB_CONTRACT} />
                    </div>
                  </TableCell>
                  <TableCell muted className="max-md:hidden">
                    {c.payer.name}
                  </TableCell>
                  <TableCell className="max-sm:hidden">
                    <StatusPill status={c.status} map={SUB_CONTRACT} />
                  </TableCell>
                  <TableCell numeric className="max-md:hidden">
                    {formatCents(c.billing.billedCents)}
                  </TableCell>
                  <TableCell numeric className="max-sm:align-top">
                    {formatCents(c.contractSumCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      </PageBody>
    </>
  );
}

/** The first screen for a subcontractor with nothing yet: what will appear here and what happens first. */
function Welcome({ firstName, orgName, contracts }: { firstName: string; orgName: string; contracts: Awaited<ReturnType<typeof listBillableContracts>> }) {
  const waiting = contracts[0];
  const contractor = waiting?.payer.name ?? "your contractor";
  return (
    <>
      <PageHeader width="form" title={`Welcome, ${firstName}`} description={`${orgName} is set up on Groundwork. Nothing needs you yet.`} />
      <PageBody width="form">
        <Panel
          title="What will appear here"
          footer={
            <p className="type-meta text-muted-foreground">
              Someone else handles billing?{" "}
              <Link href="/sub/company" className="text-link underline-offset-4 hover:underline">
                Invite a teammate
              </Link>
              .
            </p>
          }
        >
          <p className="text-sm leading-5 text-muted-foreground">
            This is where you bill for each period, sign a lien waiver when a payment is ready, and see exactly where your money is and the date it is legally due.
          </p>
          <Checklist
            className="mt-4"
            steps={[
              { title: "Accept your invitation", state: "done" },
              {
                title: waiting ? `${contractor} approves the payment rules for ${waiting.trade}` : `${contractor} adds your subcontract and approves its payment rules`,
                state: "current",
                description: waiting
                  ? `${contractor} is checking the payment terms Groundwork read from your subcontract on ${waiting.project.name}. Your contract appears here as soon as they approve. There is nothing for you to do until then.`
                  : "Your contract appears here once the contractor has uploaded it and approved its payment terms. There is nothing for you to do until then.",
              },
              { title: "Bill for your first period against the schedule of values", state: "todo" },
              { title: "Sign a conditional waiver when your payment is ready", state: "todo" },
              { title: "Get paid by the deadline your contract and state law set", state: "todo" },
            ]}
          />
        </Panel>
      </PageBody>
    </>
  );
}
