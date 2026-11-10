import { requireAuth } from "@/server/auth";
import { getLedger } from "@/server/scoped";
import { formatCents } from "@/lib/money";
import { PageBody, PageHeader } from "@/components/page-header";
import { Section } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Ledger entries" };

const ACCOUNT: Record<string, { label: string; what: string }> = {
  owner_receipts: { label: "Received from owners", what: "Every owner payment recorded." },
  gc_cash: { label: "Your cash from owners", what: "What is left with you after paying out and holding retainage." },
  sub_payable: { label: "Owed to subcontractors", what: "Split out of an owner payment and not yet paid." },
  retainage_held: { label: "Retainage held", what: "Withheld from subcontractors until its release condition is met." },
  sub_paid: { label: "Paid to subcontractors", what: "Confirmed by the bank." },
  backcharge_recovered: { label: "Backcharges recovered", what: "Set off against payments." },
  lower_tier_payable: { label: "Lower tier: owed by subcontractors", what: "What your subcontractors owe their own suppliers." },
  lower_tier_paid: { label: "Lower tier: paid by subcontractors", what: "What they have paid them." },
};

const money = (cents: number) => (cents < 0 ? `−${formatCents(-cents)}` : formatCents(cents));

/**
 * The append-only entries behind every balance in the product. Reached from Payments. Each row was
 * written in the same transaction as the event that caused it; a balance is the sum of its rows.
 */
export default async function LedgerPage() {
  const { org } = await requireAuth("gc");
  const { entries, balances, projects } = await getLedger(org);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "";
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Payments", href: "/gc/payments" }, { label: "Ledger entries" }]}
        title="Ledger entries"
        description="Every movement of money Groundwork has recorded, newest first. Entries are only ever added, never edited, and each balance is the sum of its entries."
      />
      <PageBody>
        <Section title="Balances">
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>What it holds</TableHead>
                <TableHead numeric>Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(ACCOUNT).map(([k, a]) => (
                <TableRow key={k}>
                  <TableCell className="font-medium whitespace-nowrap">{a.label}</TableCell>
                  <TableCell muted>{a.what}</TableCell>
                  <TableCell numeric>{money(balances[k] ?? 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
        <Section title="Entries" description={entries.length >= 200 ? "The 200 most recent." : undefined}>
          <Table density="compact" className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Subcontractor</TableHead>
                <TableHead>Memo</TableHead>
                <TableHead numeric>Amount</TableHead>
                <TableHead>Batch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && <TableEmpty colSpan={7}>No entries yet. The first ones are written when you record an owner payment.</TableEmpty>}
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell muted className="num whitespace-nowrap">
                    {e.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </TableCell>
                  <TableCell muted className="whitespace-nowrap">
                    {projectName(e.projectId)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{ACCOUNT[e.account]?.label ?? e.account}</TableCell>
                  <TableCell className="whitespace-nowrap">{e.subName ?? ""}</TableCell>
                  <TableCell muted>{e.memo}</TableCell>
                  <TableCell numeric className={e.deltaCents < 0 ? "text-muted-foreground" : undefined}>
                    {money(e.deltaCents)}
                  </TableCell>
                  <TableCell className="type-mono text-muted-foreground" title={`Entries written together share this id: ${e.correlationId}`}>
                    {e.correlationId.slice(0, 8)}
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
