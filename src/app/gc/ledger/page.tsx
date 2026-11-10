import { requireAuth } from "@/server/auth";
import { getLedger } from "@/server/scoped";
import { formatCents, formatCentsCompact } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ACCOUNT: Record<string, string> = {
  owner_receipts: "Owner receipts",
  gc_cash: "GC cash from owner",
  sub_payable: "Owed to subs",
  retainage_held: "Retainage held",
  sub_paid: "Paid to subs",
  backcharge_recovered: "Backcharges recovered",
  lower_tier_payable: "Lower tier: owed by subs",
  lower_tier_paid: "Lower tier: paid by subs",
};

export default async function LedgerPage() {
  const { org } = await requireAuth("gc");
  const { entries, balances } = await getLedger(org);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Ledger</h1>
          <p className="mt-1 text-sm text-muted-foreground">Append-only. Every row was written by the deterministic engine inside the same transaction as the event that caused it. Balances are sums; nothing is stored that could drift.</p>
        </div>
        <span className="rounded-sm bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">deterministic · replayable</span>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-5">
        {Object.entries(ACCOUNT).map(([k, label]) => (
          <div key={k} className="bg-card p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="num mt-1 text-lg font-semibold">{formatCentsCompact(balances[k] ?? 0)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 overflow-hidden rounded-xl bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Memo</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Correlation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{e.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</TableCell>
                <TableCell>{ACCOUNT[e.account] ?? e.account}</TableCell>
                <TableCell>{e.memo}</TableCell>
                <TableCell className={`num text-right ${e.deltaCents < 0 ? "text-muted-foreground" : ""}`}>{e.deltaCents < 0 ? `−${formatCents(-e.deltaCents)}` : formatCents(e.deltaCents)}</TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">{e.correlationId.slice(0, 8)}</TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No entries yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
