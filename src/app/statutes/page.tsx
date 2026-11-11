import Link from "next/link";
import type { Metadata } from "next";
import { STATES, coverage } from "@/domain/statutes";
import { StateGrid } from "@/components/viz/state-grid";
import { Wordmark } from "@/components/wordmark";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "State payment law", description: "Private-works payment law for all 50 states and DC, as Groundwork applies it." };

const PIF: Record<string, string> = { void: "Void", limited: "Limited", enforceable: "Enforceable", unsettled: "Unsettled" };

/** Public reference: the law the engine applies, state by state, with sources. */
export default function StatutesPage() {
  const c = coverage();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <nav aria-label="Site" className="flex items-center gap-1 text-sm">
            <Link href="/api/v1/statutes" className={buttonVariants({ variant: "tertiary" })}>
              Data as JSON
            </Link>
            <Link href="/sign-in" className={buttonVariants({ variant: "secondary" })}>
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 pt-10 pb-16 text-sm leading-5 sm:px-6">
        <h1 className="type-title">State payment law, as Groundwork applies it</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Groundwork reads the governing-law clause, then applies that state&rsquo;s payment law for private projects by fixed rules. Of {c.jurisdictions} jurisdictions, {c.promptPay} set a deadline for paying subcontractors, {c.retainageCap} cap or forbid retainage, {c.payIfPaidVoid + c.payIfPaidLimited} void or limit pay-if-paid clauses, and {c.statutoryWaiverForms} prescribe the exact lien waiver form. Every rule below carries its source. Where a rule could not be confirmed, Groundwork uses the contract&rsquo;s own terms and says so.
        </p>

        <section className="mt-8" aria-label="Map">
          <StateGrid states={STATES} />
        </section>

        <section className="mt-10" aria-labelledby="table-heading">
          <h2 id="table-heading" className="type-section">
            All jurisdictions
          </h2>
          <div className="mt-3">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>State</TableHead>
                  <TableHead>Pay subcontractors within</TableHead>
                  <TableHead>Retainage cap</TableHead>
                  <TableHead>Release retainage within</TableHead>
                  <TableHead>Pay-if-paid</TableHead>
                  <TableHead>Waiver form</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {STATES.map((s) => (
                  <TableRow key={s.state} className="align-top">
                    <TableCell className="font-medium whitespace-nowrap">
                      {s.name} <span className="type-mono type-caption text-muted-foreground">{s.state}</span>
                    </TableCell>
                    <Cell value={s.promptPay.days === null ? null : `${s.promptPay.days} days${s.promptPay.contractCanOverride === false ? ", fixed" : ""}`} cite={s.promptPay.cite} url={s.promptPay.url} />
                    <Cell value={s.retainageCap.bps === null ? null : s.retainageCap.bps === 0 ? "Prohibited" : `${s.retainageCap.bps / 100}%`} cite={s.retainageCap.cite} url={s.retainageCap.url} />
                    <Cell value={s.retainageRelease.days === null ? null : `${s.retainageRelease.days} days`} cite={s.retainageRelease.cite} url={s.retainageRelease.url} />
                    <Cell value={PIF[s.payIfPaid.status]} cite={s.payIfPaid.cite} url={s.payIfPaid.url} />
                    <Cell value={s.lienWaiver.statutoryFormRequired ? "Statutory" : null} cite={s.lienWaiver.statutoryFormRequired ? s.lienWaiver.cite : ""} url={s.lienWaiver.url} dash="Any form" />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="type-caption mt-3 max-w-3xl text-muted-foreground">
            Researched November 2026 from state codes and court opinions, with secondary sources where the official text could not be read. This is a reference for how the software behaves, not legal advice. Conditions Groundwork does not evaluate (project type, bonding, residential exclusions) are listed in each state&rsquo;s notes and shown to the reviewer when a contract is read.
          </p>
        </section>
      </main>
    </div>
  );
}

function Cell({ value, cite, url, dash = "None" }: { value: string | null; cite: string; url: string; dash?: string }) {
  return (
    <TableCell>
      {value === null ? <span className="text-muted-foreground">{dash}</span> : <span className="num">{value}</span>}
      {cite && value !== null && (
        <div className="type-caption max-w-[16rem] truncate text-muted-foreground">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="rounded-sm underline-offset-4 hover:text-foreground hover:underline" title={cite}>
              {cite}
            </a>
          ) : (
            cite
          )}
        </div>
      )}
    </TableCell>
  );
}
