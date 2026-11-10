import Link from "next/link";
import { requireAuth } from "@/server/auth";
import { listContracts, listProjects, listReleasesForOrg } from "@/server/scoped";
import { projectFlow } from "@/server/read/project";
import { formatCents, formatCentsCompact } from "@/lib/money";
import { now } from "@/server/clock";
import { releaseLabel } from "@/lib/release-label";
import { StatusPill, RELEASE } from "@/components/status-pill";
import { Countdown } from "@/components/countdown";
import { buttonVariants } from "@/components/ui/button";
import { MoneyFlow } from "@/components/viz/money-flow";
import { PageHero } from "@/components/page-hero";
import { PenLine, Receipt } from "lucide-react";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default async function SubHome() {
  const { org, user } = await requireAuth("sub");
  const [contracts, releases] = await Promise.all([listContracts(org), listReleasesForOrg(org)]);
  const nowIso = now().toISOString();
  const flows = (await Promise.all((await listProjects(org)).map(async (p) => ({ project: p, flow: await projectFlow(org, p.id) })))).filter((f) => f.flow && f.flow.events.length > 0);
  const done = (s: string) => s === "paid" || s === "settled";
  const coming = releases.filter((r) => !done(r.status) && r.releaseCents > 0);
  const owed = coming.reduce((s, r) => s + r.releaseCents, 0);
  const paid = releases.filter((r) => done(r.status)).reduce((s, r) => s + r.releaseCents, 0);
  const held = releases.reduce((s, r) => s + r.retainageWithheldCents - ((r.basis as { retentionReleasedCents?: number }).retentionReleasedCents ?? 0), 0);
  const toSign = releases.filter((r) => r.waivers.some((w) => w.status === "sent")).length;
  const firstWaiver = releases.flatMap((r) => r.waivers).find((w) => w.status === "sent");
  const billable = contracts.find((c) => c.status === "active");
  const gcName = contracts[0]?.payer?.name ?? null;
  const nextDue = coming.map((r) => r.payByAt).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime())[0];

  return (
    <div>
      <PageHero
        width="narrow"
        title="Where's my money"
        lede={`You are ${user.name} at ${org.name}, a subcontractor${gcName ? ` working for ${gcName}` : ""}. You bill for your work, sign a lien waiver when a payment is ready, and watch it arrive.`}
        figure={{
          label: "Coming to you",
          value: formatCentsCompact(owed),
          note:
            owed === 0
              ? "Nothing is on its way right now. Bill for this period to start the next payment."
              : toSign > 0
                ? `${toSign} payment${toSign === 1 ? " is" : "s are"} waiting for your signature.${nextDue ? ` By law the first is due to you ${day(nextDue)}.` : ""}`
                : `Signed and on its way${nextDue ? `, due to you by ${day(nextDue)}` : ""}.`,
        }}
        stats={[
          { label: "Paid to date", value: formatCentsCompact(paid) },
          { label: "Held as retainage", value: formatCentsCompact(held) },
        ]}
        actions={
          <>
            {firstWaiver && (
              <Link href={`/sub/waivers/${firstWaiver.id}/sign`} className={buttonVariants({ variant: "signal", size: "lg" })}>
                <PenLine aria-hidden />
                Sign a waiver to get paid
              </Link>
            )}
            {billable && (
              <Link href={`/sub/pay-apps/new?contract=${billable.id}`} className={buttonVariants({ variant: firstWaiver ? "stage" : "signal", size: "lg" })}>
                <Receipt aria-hidden />
                Bill for this period
              </Link>
            )}
          </>
        }
      />

      <section aria-labelledby="payments-heading">
        <h2 id="payments-heading" className="text-lg font-semibold">
          Payments
        </h2>
        {releases.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No payments yet. Submit a pay application and it appears here once the owner pays.</p>
        ) : (
          <ul className="mt-3 divide-y overflow-hidden rounded-xl bg-card shadow-card">
            {releases.map((r) => {
              const waiver = r.waivers.find((w) => w.status === "sent");
              return (
                <li key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/sub/contracts/${r.contractId}#release-${r.id}`} className="num text-lg font-semibold text-link hover:underline">
                        {formatCents(r.releaseCents)}
                      </Link>
                      <div className="text-[13px] text-muted-foreground">
                        {r.contract.project.name}, {releaseLabel(r, { lower: true })}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusPill status={r.status} map={RELEASE} />
                      <Countdown deadline={r.payByAt?.toISOString() ?? null} amountCents={r.releaseCents} settled={done(r.status)} nowIso={nowIso} label="Due" />
                    </div>
                  </div>
                  {waiver && (
                    <Link href={`/sub/waivers/${waiver.id}/sign`} className={buttonVariants({ variant: "money", size: "lg", className: "mt-3 w-full" })}>
                      {waiver.form.startsWith("u") ? "Confirm you were paid" : `Sign the waiver to release ${formatCents(r.releaseCents)}`}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {flows.map(({ project, flow }) => (
        <section key={project.id} className="mt-10" aria-label={`Your money on ${project.name}`}>
          <h2 className="text-lg font-semibold">Your money on {project.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">What has landed, what is on its way, what is held, and what you owe your own suppliers.</p>
          <div className="relative left-1/2 mt-3 w-[min(60rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl bg-card p-4 shadow-card">
            <MoneyFlow flow={flow!} height={260} />
          </div>
        </section>
      ))}

      <section className="mt-10" aria-labelledby="contracts-heading">
        <h2 id="contracts-heading" className="text-lg font-semibold">
          Contracts
        </h2>
        <ul className="mt-3 divide-y overflow-hidden rounded-xl bg-card shadow-card">
          {contracts.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <Link href={`/sub/contracts/${c.id}`} className="font-medium text-link hover:underline">
                  {c.trade}
                </Link>
                <div className="num text-[13px] text-muted-foreground">
                  {c.project.name}, {formatCentsCompact(c.contractSumCents)}
                </div>
              </div>
              {c.status === "active" ? (
                <Link href={`/sub/pay-apps/new?contract=${c.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Bill for this period
                </Link>
              ) : (
                <span className="text-[13px] text-muted-foreground">Waiting on the contractor to approve payment rules</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
