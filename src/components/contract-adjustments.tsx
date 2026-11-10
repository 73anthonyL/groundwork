import { formatBps, formatCents, formatCentsCompact } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill, RELEASE } from "@/components/status-pill";
import type { getContractAdjustments } from "@/server/scoped";

type Data = NonNullable<Awaited<ReturnType<typeof getContractAdjustments>>>;
type Action = (formData: FormData) => Promise<void>;

export type AdjustmentActions = {
  proposeChangeOrder?: Action;
  decideChangeOrder?: Action;
  recordBackcharge?: Action;
  voidBackcharge?: Action;
  certifyRetention?: Action;
  addLowerTier?: Action;
};

const CO_TONE: Record<string, string> = { proposed: "bg-hold-soft text-hold", approved: "bg-settled-soft text-settled", rejected: "bg-muted text-muted-foreground" };

function Card({ id, title, aside, children }: { id: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-md border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {aside && <div className="num text-sm text-muted-foreground">{aside}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/**
 * Everything that changes a contract after its rules are approved. `role` decides which forms show:
 * the payer decides change orders, records backcharges and certifies retention; the payee requests
 * change orders and manages its own lower tier.
 */
export function ContractAdjustments({ data, role, actions }: { data: Data; role: "payer" | "payee"; actions: AdjustmentActions }) {
  const { contract, changeOrders, backcharge, retention, lowerTier, rules } = data;
  const approvedCo = changeOrders.filter((c) => c.status === "approved").reduce((s, c) => s + c.amountCents, 0);
  const canSetOff = rules?.offsets.backcharge_setoff === true;
  const hidden = <input type="hidden" name="contractId" value={contract.id} />;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card
        id="co-heading"
        title="Change orders"
        aside={
          <>
            original {formatCentsCompact(contract.contractSumCents - approvedCo)} · now <span className="font-medium text-foreground">{formatCentsCompact(contract.contractSumCents)}</span>
          </>
        }
      >
        {changeOrders.length === 0 ? (
          <Empty>No change orders. An approved one moves the contract sum and the schedule of values together.</Empty>
        ) : (
          <ul className="divide-y">
            {changeOrders.map((c) => (
              <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      CO-{c.number} · {c.title}
                    </div>
                    {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
                    {c.decisionNote && <div className="mt-0.5 text-xs text-muted-foreground">Note: {c.decisionNote}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`num text-sm font-semibold ${c.amountCents < 0 ? "text-hold" : ""}`}>
                      {c.amountCents < 0 ? "−" : "+"}
                      {formatCents(Math.abs(c.amountCents))}
                    </div>
                    <span className={`mt-1 inline-block rounded-sm px-1.5 py-0.5 text-[11px] font-medium ${CO_TONE[c.status]}`}>{c.status}</span>
                  </div>
                </div>
                {c.status === "proposed" && actions.decideChangeOrder && (
                  <form action={actions.decideChangeOrder} className="mt-2 flex flex-wrap items-center gap-2">
                    {hidden}
                    <input type="hidden" name="changeOrderId" value={c.id} />
                    <Input name="note" placeholder="Note (optional)" className="h-8 max-w-56 text-sm" aria-label={`Note for change order ${c.number}`} />
                    <Button type="submit" name="decision" value="approve" size="sm" variant="money">
                      Approve
                    </Button>
                    <Button type="submit" name="decision" value="reject" size="sm" variant="outline">
                      Reject
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {actions.proposeChangeOrder && (
          <details className="mt-4 border-t pt-3">
            <summary className="cursor-pointer text-sm font-medium">{role === "payee" ? "Request a change order" : "Add a change order"}</summary>
            <form action={actions.proposeChangeOrder} className="mt-3 grid gap-3">
              {hidden}
              <div className="grid gap-1.5">
                <Label htmlFor="co-title">Title</Label>
                <Input id="co-title" name="title" required placeholder="Added roof screen framing" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="co-amount">Amount</Label>
                  <Input id="co-amount" name="amount" inputMode="decimal" required placeholder="20,000.00" className="num" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="co-direction">Type</Label>
                  <select id="co-direction" name="direction" className="h-9 rounded-md border bg-background px-2 text-sm">
                    <option value="add">Adds scope</option>
                    <option value="deduct">Deducts from a line</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="co-line">Line reduced (deductive only)</Label>
                <select id="co-line" name="sovLineId" className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="">Not a deduction</option>
                  {contract.sovLines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.lineNo}. {l.description} · {formatCentsCompact(l.scheduledValueCents)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="co-desc">Description (optional)</Label>
                <Input id="co-desc" name="description" />
              </div>
              <div>
                <Button type="submit" size="sm" variant="outline">
                  {role === "payee" ? "Send request" : "Record change order"}
                </Button>
              </div>
            </form>
          </details>
        )}
      </Card>

      <Card
        id="retention-heading"
        title="Retainage"
        aside={
          <>
            held <span className="font-medium text-hold">{formatCentsCompact(retention.heldCents)}</span>
            {retention.earmarkedCents > 0 ? ` · ${formatCentsCompact(retention.earmarkedCents)} certified, waiting on the owner` : ""}
          </>
        }
      >
        <dl className="text-sm">
          <dt className="text-xs text-muted-foreground">Release condition in the approved rules</dt>
          <dd className="mt-0.5">{rules?.retainage.release_condition ?? "Not stated in the contract."}</dd>
          {rules?.retainage.reduction_trigger && (
            <>
              <dt className="mt-2 text-xs text-muted-foreground">Reduction</dt>
              <dd className="mt-0.5">{rules.retainage.reduction_trigger}</dd>
            </>
          )}
        </dl>
        {retention.certifications.length > 0 && (
          <ul className="mt-3 divide-y border-t">
            {retention.certifications.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <div>
                    {formatBps(c.releaseBps)} certified{c.isFinal ? " · final" : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">{c.note}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="num font-medium">{formatCents(c.amountCents)}</div>
                  <div className="text-[11px] text-muted-foreground">{retention.pendingIds.includes(c.id) ? "waiting on owner retention" : "released"}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {actions.certifyRetention && retention.certifiableCents > 0 && (
          <details className="mt-4 border-t pt-3">
            <summary className="cursor-pointer text-sm font-medium">Certify the release condition</summary>
            <form action={actions.certifyRetention} className="mt-3 grid gap-3">
              {hidden}
              <div className="grid grid-cols-[120px_1fr] gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="ret-pct">Share to release</Label>
                  <Input id="ret-pct" name="percent" defaultValue="100" inputMode="decimal" className="num" required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ret-note">How the condition was met</Label>
                  <Input id="ret-note" name="note" required placeholder="Architect certified Substantial Completion on Dec 12" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isFinal" className="h-4 w-4" /> This is the final retention release (uses the final-payment waiver)
              </label>
              <p className="text-xs text-muted-foreground">
                Percent of the {formatCents(retention.certifiableCents)} not yet certified. The engine pays it out when the owner&rsquo;s retention is recorded.
              </p>
              <div>
                <Button type="submit" size="sm" variant="outline">
                  Certify
                </Button>
              </div>
            </form>
          </details>
        )}
      </Card>

      <Card
        id="backcharge-heading"
        title="Backcharges"
        aside={backcharge.chargedCents > 0 ? `charged ${formatCentsCompact(backcharge.chargedCents)} · recovered ${formatCentsCompact(backcharge.appliedCents)} · open ${formatCentsCompact(backcharge.outstandingCents)}` : undefined}
      >
        {backcharge.rows.length === 0 ? (
          <Empty>
            {canSetOff ? "None. A backcharge is set off against this subcontractor's next release and shown in its math." : "The approved rules do not give the contractor a right to backcharge or set off under this contract."}
          </Empty>
        ) : (
          <ul className="divide-y">
            {backcharge.rows.map((b) => (
              <li key={b.id} className="flex items-start justify-between gap-3 py-2 text-sm first:pt-0">
                <div className="min-w-0">
                  <div className={b.status === "void" ? "text-muted-foreground line-through" : ""}>{b.reason}</div>
                  <div className="text-xs text-muted-foreground">
                    {b.noticeDate ? `Notice given ${b.noticeDate}` : "No notice date recorded"}
                    {b.status === "void" ? " · withdrawn" : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="num font-medium text-hold">−{formatCents(b.amountCents)}</span>
                  {b.status === "open" && actions.voidBackcharge && (
                    <form action={actions.voidBackcharge}>
                      {hidden}
                      <input type="hidden" name="backchargeId" value={b.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Withdraw
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {actions.recordBackcharge && canSetOff && (
          <details className="mt-4 border-t pt-3">
            <summary className="cursor-pointer text-sm font-medium">Record a backcharge</summary>
            <form action={actions.recordBackcharge} className="mt-3 grid gap-3">
              {hidden}
              <div className="grid gap-1.5">
                <Label htmlFor="bc-reason">What it is for</Label>
                <Input id="bc-reason" name="reason" required placeholder="Cleanup of drywall debris, level 2" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="bc-amount">Amount</Label>
                  <Input id="bc-amount" name="amount" inputMode="decimal" required placeholder="1,500.00" className="num" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="bc-notice">Written notice given</Label>
                  <Input id="bc-notice" name="noticeDate" type="date" />
                </div>
              </div>
              <div>
                <Button type="submit" size="sm" variant="outline">
                  Record backcharge
                </Button>
              </div>
            </form>
          </details>
        )}
      </Card>

      <Card id="lower-heading" title="Lower tier" aside={rules?.waivers.lower_tier_required ? "waivers required before release" : undefined}>
        {lowerTier.length === 0 ? (
          <Empty>
            {role === "payee"
              ? "Add the suppliers and sub-subcontractors you pay on this job. When you are paid, Groundwork plans what you owe them and collects their waivers."
              : "No sub-subcontractors or suppliers have been declared on this subcontract."}
          </Empty>
        ) : (
          <ul className="divide-y">
            {lowerTier.map((c) => (
              <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{c.sub.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.lowerTierKind === "supplier" ? "Supplier" : "Sub-subcontractor"} · {c.trade}
                    </div>
                  </div>
                  <div className="num shrink-0 text-right text-xs text-muted-foreground">
                    <div className="text-sm font-medium text-foreground">{formatCentsCompact(c.contractSumCents)}</div>
                    paid {formatCentsCompact(c.paidCents)} · owed {formatCentsCompact(c.owedCents)}
                  </div>
                </div>
                {c.releases.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {c.releases.map((r) => {
                      const open = r.waivers.some((w) => w.status === "sent");
                      return (
                        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-muted/50 px-2 py-1.5 text-xs">
                          <span className="num font-medium">{formatCents(r.releaseCents)}</span>
                          <span className="flex items-center gap-2">
                            <StatusPill status={r.status} map={RELEASE} />
                            {open && <span className="text-muted-foreground">waiver sent to them</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        {actions.addLowerTier && (
          <details className="mt-4 border-t pt-3">
            <summary className="cursor-pointer text-sm font-medium">Add a supplier or sub-subcontractor</summary>
            <form action={actions.addLowerTier} className="mt-3 grid gap-3">
              {hidden}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="lt-name">Name</Label>
                  <Input id="lt-name" name="name" required placeholder="Bay Rebar Supply" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="lt-kind">Type</Label>
                  <select id="lt-kind" name="kind" className="h-9 rounded-md border bg-background px-2 text-sm">
                    <option value="supplier">Supplier</option>
                    <option value="subcontractor">Sub-subcontractor</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="lt-scope">What they provide</Label>
                <Input id="lt-scope" name="scope" placeholder="Reinforcing steel" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="lt-sum">Agreement amount</Label>
                  <Input id="lt-sum" name="sum" inputMode="decimal" required placeholder="60,000.00" className="num" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="lt-days">Pay within (days)</Label>
                  <Input id="lt-days" name="days" inputMode="numeric" placeholder="statute" className="num" />
                </div>
              </div>
              <div>
                <Button type="submit" size="sm" variant="outline">
                  Add to this job
                </Button>
              </div>
            </form>
          </details>
        )}
      </Card>
    </div>
  );
}
