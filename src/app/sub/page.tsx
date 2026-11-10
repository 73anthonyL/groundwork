import Link from "next/link";
import { requireAuth } from "@/server/auth";
import { listContracts, listReleasesForOrg } from "@/server/scoped";
import { formatCents, formatCentsCompact } from "@/lib/money";
import { now } from "@/server/clock";
import { releaseLabel } from "@/lib/release-label";
import { StatusPill, RELEASE } from "@/components/status-pill";
import { Countdown } from "@/components/countdown";
import { buttonVariants } from "@/components/ui/button";

export default async function SubHome() {
  const { org } = await requireAuth("sub");
  const [contracts, releases] = await Promise.all([listContracts(org), listReleasesForOrg(org)]);
  const nowIso = now().toISOString();
  const owed = releases.filter((r) => !["paid", "settled", "blocked"].includes(r.status)).reduce((s, r) => s + r.releaseCents, 0);
  const paid = releases.filter((r) => ["paid", "settled"].includes(r.status)).reduce((s, r) => s + r.releaseCents, 0);
  const held = releases.reduce((s, r) => s + r.retainageWithheldCents, 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Where&rsquo;s my money</h1>
      <p className="mt-1 text-sm text-muted-foreground">{org.name} · every payment, where it is right now.</p>

      <dl className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-md border bg-border">
        {[
          ["Coming to you", owed, "text-money"],
          ["Paid to date", paid, "text-settled"],
          ["Held as retainage", held, "text-hold"],
        ].map(([label, cents, tone]) => (
          <div key={label as string} className="bg-card p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className={`num mt-1 text-base font-semibold ${tone}`}>{formatCentsCompact(cents as number)}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-6" aria-labelledby="payments-heading">
        <h2 id="payments-heading" className="text-lg font-semibold">
          Payments
        </h2>
        {releases.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing in motion yet. When the owner pays, your share shows up here with a clock.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {releases.map((r) => {
              const waiver = r.waivers.find((w) => w.status === "sent");
              return (
                <li key={r.id} className="rounded-md border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground">
                        {r.contract.project.name} · {releaseLabel(r, { lower: true })}
                      </div>
                      <Link href={`/sub/contracts/${r.contractId}`} className="num text-xl font-semibold hover:underline">
                        {formatCents(r.releaseCents)}
                      </Link>
                    </div>
                    <StatusPill status={r.status} map={RELEASE} />
                  </div>
                  <div className="mt-2">
                    <Countdown deadline={r.payByAt?.toISOString() ?? null} amountCents={r.releaseCents} settled={["paid", "settled"].includes(r.status)} nowIso={nowIso} label="Due by law" />
                  </div>
                  {waiver && (
                    <div className="mt-3">
                      <Link
                        href={`/sub/waivers/${waiver.id}/sign`}
                        className={buttonVariants({ variant: "money", className: "w-full" })}
                      >
                        {waiver.form.startsWith("u") ? "Sign unconditional release" : `Sign waiver to release ${formatCents(r.releaseCents)}`}
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="contracts-heading">
        <h2 id="contracts-heading" className="text-lg font-semibold">
          Contracts
        </h2>
        <ul className="mt-3 space-y-3">
          {contracts.map((c) => (
            <li key={c.id} className="rounded-md border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">{c.project.name}</div>
                  <Link href={`/sub/contracts/${c.id}`} className="font-medium hover:underline">
                    {c.trade}
                  </Link>
                </div>
                <div className="num text-right font-medium">{formatCentsCompact(c.contractSumCents)}</div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <StatusPill status={c.status} />
                <Link href={`/sub/pay-apps/new?contract=${c.id}`} className="text-sm underline underline-offset-2">
                  Submit pay app
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
