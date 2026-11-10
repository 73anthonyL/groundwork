import Link from "next/link";
import type { Metadata } from "next";
import { STATES, coverage } from "@/domain/statutes";
import { StateGrid } from "@/components/viz/state-grid";
import { Wordmark } from "@/components/wordmark";

export const metadata: Metadata = { title: "Statute library", description: "Private-works payment law for all 50 states and DC, as Groundwork applies it." };

const PIF: Record<string, string> = { void: "Void", limited: "Limited", enforceable: "Enforceable", unsettled: "Unsettled" };

/** Public reference: the law the engine applies, state by state, with sources. */
export default function StatutesPage() {
  const c = coverage();
  const figures = [
    { n: c.jurisdictions, label: "jurisdictions researched" },
    { n: c.promptPay, label: "set a deadline to pay subcontractors" },
    { n: c.retainageCap, label: "cap or prohibit retainage on private work" },
    { n: c.payIfPaidVoid + c.payIfPaidLimited, label: "void or limit pay-if-paid" },
    { n: c.statutoryWaiverForms, label: "prescribe a statutory lien waiver form" },
  ];
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <nav className="flex items-center gap-5 text-sm text-muted-foreground">
            <Link href="/api/v1/statutes" className="hover:text-foreground">
              JSON
            </Link>
            <Link href="/sign-in" className="hover:text-foreground">
              Open the app
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <div className="type-label text-muted-foreground">Statute library</div>
        <h1 className="mt-2 max-w-3xl text-4xl font-semibold leading-tight">The contract says one thing. The state may say another.</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Groundwork reads the governing-law clause, then applies that state&rsquo;s private-works payment law in code. Every rule below carries its citation and how it was confirmed. Where the research could not confirm a rule, the engine uses the contract&rsquo;s own terms and says so.
        </p>
        <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border shadow-card sm:grid-cols-5">
          {figures.map((f) => (
            <div key={f.label} className="bg-card p-4">
              <dd className="type-numeral text-4xl">{f.n}</dd>
              <dt className="mt-2 text-xs text-muted-foreground">{f.label}</dt>
            </div>
          ))}
        </dl>

        <section className="mt-10" aria-label="Map">
          <StateGrid states={STATES} />
        </section>

        <section className="mt-12" aria-labelledby="table-heading">
          <h2 id="table-heading" className="text-xl font-semibold">
            All jurisdictions
          </h2>
          <div className="mt-4 overflow-x-auto rounded-xl bg-card shadow-card">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">State</th>
                  <th className="px-4 py-2.5 font-medium">Pay the sub within</th>
                  <th className="px-4 py-2.5 font-medium">Retainage cap</th>
                  <th className="px-4 py-2.5 font-medium">Pass retainage within</th>
                  <th className="px-4 py-2.5 font-medium">Pay-if-paid</th>
                  <th className="px-4 py-2.5 font-medium">Waiver form</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {STATES.map((s) => (
                  <tr key={s.state} className="align-top hover:bg-muted/40">
                    <td className="px-4 py-2.5 font-medium">
                      {s.name} <span className="font-mono text-xs text-muted-foreground">{s.state}</span>
                    </td>
                    <Cell value={s.promptPay.days === null ? null : `${s.promptPay.days} days${s.promptPay.contractCanOverride === false ? " · fixed" : ""}`} cite={s.promptPay.cite} url={s.promptPay.url} />
                    <Cell value={s.retainageCap.bps === null ? null : s.retainageCap.bps === 0 ? "Prohibited" : `${s.retainageCap.bps / 100}%`} cite={s.retainageCap.cite} url={s.retainageCap.url} />
                    <Cell value={s.retainageRelease.days === null ? null : `${s.retainageRelease.days} days`} cite={s.retainageRelease.cite} url={s.retainageRelease.url} />
                    <Cell value={PIF[s.payIfPaid.status]} cite={s.payIfPaid.cite} url={s.payIfPaid.url} />
                    <Cell value={s.lienWaiver.statutoryFormRequired ? "Statutory" : null} cite={s.lienWaiver.statutoryFormRequired ? s.lienWaiver.cite : ""} url={s.lienWaiver.url} dash="Any form" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 max-w-3xl text-xs text-muted-foreground">
            Researched November 2026 from state codes and court opinions, with secondary sources where the official text could not be read. This is a reference for how the software behaves, not legal advice. Conditions the engine does not evaluate (project type, bonding, residential exclusions) are listed in each state&rsquo;s notes and shown to the reviewer when a contract is compiled.
          </p>
        </section>
      </main>
    </div>
  );
}

function Cell({ value, cite, url, dash = "None" }: { value: string | null; cite: string; url: string; dash?: string }) {
  return (
    <td className="px-4 py-2.5">
      {value === null ? <span className="text-muted-foreground">{dash}</span> : <span className="num">{value}</span>}
      {cite && value !== null && (
        <div className="max-w-[16rem] truncate text-xs text-muted-foreground">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline" title={cite}>
              {cite}
            </a>
          ) : (
            cite
          )}
        </div>
      )}
    </td>
  );
}
