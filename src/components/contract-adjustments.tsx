/**
 * ContractAdjustments: everything that changes a subcontract after its payment rules are approved.
 * Change orders, retainage and its release, backcharges, and the lower tier, each as a table with
 * its form underneath.
 *
 *   <ContractAdjustments data={await getContractAdjustments(org, id)} role="payer" actions={{ … }} />
 *
 * `role` decides the wording and `actions` decides which forms show: the payer decides change
 * orders, records backcharges and certifies retainage; the payee requests change orders and manages
 * its own lower tier. A form only appears when its action is passed.
 */
import { formatBps, formatCents } from "@/lib/money";
import { buttonVariants } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Field, FormActions } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Section } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableEmpty, TableFoot, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill, RELEASE } from "@/components/status-pill";
import { SubmitButton } from "@/components/compile-review";
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

const CO_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  proposed: { label: "Waiting for a decision", tone: "hold" },
  approved: { label: "Approved", tone: "settled" },
  rejected: { label: "Rejected", tone: "neutral" },
};

const signed = (cents: number) => `${cents < 0 ? "−" : "+"}${formatCents(Math.abs(cents))}`;

/** A form that stays folded under its table until asked for. */
function FoldedForm({ label, action, submit, children }: { label: string; action: Action; submit: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className={buttonVariants({ variant: "secondary", size: "sm", className: "cursor-pointer list-none [&::-webkit-details-marker]:hidden" })}>{label}</summary>
      <form action={action} className="mt-3 flex max-w-[640px] flex-col gap-4 rounded-lg border bg-card p-4">
        {children}
        <FormActions>
          <SubmitButton variant="secondary">{submit}</SubmitButton>
        </FormActions>
      </form>
    </details>
  );
}

export function ContractAdjustments({ data, role, actions }: { data: Data; role: "payer" | "payee"; actions: AdjustmentActions }) {
  const { contract, changeOrders, backcharge, retention, lowerTier, rules } = data;
  const approvedCo = changeOrders.filter((c) => c.status === "approved").reduce((s, c) => s + c.amountCents, 0);
  const canSetOff = rules?.offsets.backcharge_setoff === true;
  const hidden = <input type="hidden" name="contractId" value={contract.id} />;
  const decide = actions.decideChangeOrder;
  const withdraw = actions.voidBackcharge;

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Change orders"
        description={
          <>
            Original sum <span className="num">{formatCents(contract.contractSumCents - approvedCo)}</span>, now <span className="num font-medium text-foreground">{formatCents(contract.contractSumCents)}</span>. An approved change order moves the subcontract sum and the schedule of values together.
          </>
        }
      >
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Number</TableHead>
              <TableHead>Change</TableHead>
              <TableHead numeric>Amount</TableHead>
              <TableHead>Status</TableHead>
              {decide && (
                <TableHead>
                  <span className="sr-only">Decision</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {changeOrders.length === 0 && <TableEmpty colSpan={decide ? 5 : 4}>No change orders yet.</TableEmpty>}
            {changeOrders.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="type-mono text-muted-foreground">CO-{c.number}</TableCell>
                <TableCell>
                  <div className="font-medium">{c.title}</div>
                  {c.description && <div className="type-meta text-muted-foreground">{c.description}</div>}
                  {c.decisionNote && <div className="type-meta text-muted-foreground">Note: {c.decisionNote}</div>}
                </TableCell>
                <TableCell numeric>{signed(c.amountCents)}</TableCell>
                <TableCell>
                  <Badge tone={CO_STATUS[c.status]?.tone ?? "neutral"}>{CO_STATUS[c.status]?.label ?? c.status}</Badge>
                </TableCell>
                {decide && (
                  <TableCell className="w-px">
                    {c.status === "proposed" && (
                      <form action={decide} className="flex items-center justify-end gap-2">
                        {hidden}
                        <input type="hidden" name="changeOrderId" value={c.id} />
                        <Input name="note" placeholder="Note, if any" className="h-7 w-40 text-[13px]!" aria-label={`Note for change order ${c.number}`} />
                        <SubmitButton name="decision" value="approve" size="sm" variant="secondary">
                          Approve
                        </SubmitButton>
                        <SubmitButton name="decision" value="reject" size="sm" variant="tertiary">
                          Reject
                        </SubmitButton>
                      </form>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {actions.proposeChangeOrder && (
          <FoldedForm label={role === "payee" ? "Request a change order" : "Add a change order"} action={actions.proposeChangeOrder} submit={role === "payee" ? "Send request" : "Record change order"}>
            {hidden}
            <Field label="Title">
              <Input name="title" required placeholder="Added roof screen framing" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount" help="In dollars.">
                <Input name="amount" inputMode="decimal" required placeholder="20,000.00" className="type-mono" />
              </Field>
              <Field label="Type">
                <Select name="direction" defaultValue="add">
                  <option value="add">Adds scope</option>
                  <option value="deduct">Deducts from a line</option>
                </Select>
              </Field>
            </div>
            <Field label="Line reduced" help="Only for a deduction.">
              <Select name="sovLineId" defaultValue="">
                <option value="">Not a deduction</option>
                {contract.sovLines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.lineNo}. {l.description}, {formatCents(l.scheduledValueCents)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Description" optional>
              <Input name="description" />
            </Field>
          </FoldedForm>
        )}
      </Section>

      <Section
        title="Retainage"
        description={
          <>
            <span className="num font-medium text-foreground">{formatCents(retention.heldCents)}</span> held
            {retention.earmarkedCents > 0 ? (
              <>
                , of which <span className="num">{formatCents(retention.earmarkedCents)}</span> is certified and waiting on the owner
              </>
            ) : null}
            .
          </>
        }
      >
        <dl className="grid gap-x-8 gap-y-3 rounded-lg border bg-card p-4 sm:grid-cols-2">
          <div>
            <dt className="type-meta text-muted-foreground">Released when (from the approved rules)</dt>
            <dd className="mt-0.5">{rules?.retainage.release_condition ?? "Not stated in the contract."}</dd>
          </div>
          {rules?.retainage.reduction_trigger && (
            <div>
              <dt className="type-meta text-muted-foreground">Reduced when</dt>
              <dd className="mt-0.5">{rules.retainage.reduction_trigger}</dd>
            </div>
          )}
        </dl>
        {retention.certifications.length > 0 && (
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow>
                <TableHead>Certified</TableHead>
                <TableHead>How the condition was met</TableHead>
                <TableHead numeric>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {retention.certifications.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap">
                    <span className="num">{formatBps(c.releaseBps)}</span>
                    {c.isFinal ? ", final" : ""}
                  </TableCell>
                  <TableCell muted>{c.note}</TableCell>
                  <TableCell numeric>{formatCents(c.amountCents)}</TableCell>
                  <TableCell>{retention.pendingIds.includes(c.id) ? <Badge tone="hold">Waiting on the owner</Badge> : <Badge tone="settled">Released</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {actions.certifyRetention && retention.certifiableCents > 0 && (
          <FoldedForm label="Certify the release condition" action={actions.certifyRetention} submit="Certify">
            {hidden}
            <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
              <Field label="Share to release" help="Percent.">
                <Input name="percent" defaultValue="100" inputMode="decimal" className="type-mono" required />
              </Field>
              <Field label="How the condition was met">
                <Input name="note" required placeholder="Architect certified substantial completion on Dec 12" />
              </Field>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isFinal" className="size-4" /> This is the final release of retainage (uses the final-payment waiver)
            </label>
            <p className="type-meta text-muted-foreground">
              A percent of the <span className="num">{formatCents(retention.certifiableCents)}</span> not yet certified. It is paid out when the owner&rsquo;s retainage payment is recorded.
            </p>
          </FoldedForm>
        )}
      </Section>

      <Section
        title="Backcharges"
        description={canSetOff ? "A backcharge comes off this subcontractor's next payment and shows in its arithmetic." : "The approved payment rules do not give the contractor a right to backcharge or set off on this subcontract."}
      >
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow>
              <TableHead>What it is for</TableHead>
              <TableHead>Written notice</TableHead>
              <TableHead numeric>Amount</TableHead>
              <TableHead>Status</TableHead>
              {withdraw && (
                <TableHead>
                  <span className="sr-only">Withdraw</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {backcharge.rows.length === 0 && <TableEmpty colSpan={withdraw ? 5 : 4}>No backcharges yet.</TableEmpty>}
            {backcharge.rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell className={b.status === "void" ? "text-muted-foreground line-through" : undefined}>{b.reason}</TableCell>
                <TableCell muted className="whitespace-nowrap">
                  {b.noticeDate ? `Given ${b.noticeDate}` : "No date recorded"}
                </TableCell>
                <TableCell numeric>−{formatCents(b.amountCents)}</TableCell>
                <TableCell>{b.status === "void" ? <Badge>Withdrawn</Badge> : <Badge tone="hold">Charged</Badge>}</TableCell>
                {withdraw && (
                  <TableCell className="w-px text-right">
                    {b.status === "open" && (
                      <form action={withdraw}>
                        {hidden}
                        <input type="hidden" name="backchargeId" value={b.id} />
                        <SubmitButton size="sm" variant="secondary">
                          Withdraw
                        </SubmitButton>
                      </form>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
          {backcharge.chargedCents > 0 && (
            <TableFoot>
              <TableRow>
                <TableCell colSpan={2}>
                  Charged <span className="num">{formatCents(backcharge.chargedCents)}</span>, recovered <span className="num">{formatCents(backcharge.appliedCents)}</span>
                </TableCell>
                <TableCell numeric>−{formatCents(backcharge.outstandingCents)}</TableCell>
                <TableCell colSpan={withdraw ? 2 : 1}>still open</TableCell>
              </TableRow>
            </TableFoot>
          )}
        </Table>
        {actions.recordBackcharge && canSetOff && (
          <FoldedForm label="Record a backcharge" action={actions.recordBackcharge} submit="Record backcharge">
            {hidden}
            <Field label="What it is for">
              <Input name="reason" required placeholder="Cleanup of drywall debris, level 2" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount" help="In dollars.">
                <Input name="amount" inputMode="decimal" required placeholder="1,500.00" className="type-mono" />
              </Field>
              <Field label="Written notice given" optional>
                <Input name="noticeDate" type="date" />
              </Field>
            </div>
          </FoldedForm>
        )}
      </Section>

      <Section
        title="Lower tier"
        description={
          (role === "payee" ? "The suppliers and sub-subcontractors you pay on this job. When you are paid, Groundwork works out what you owe them and collects their waivers." : "Suppliers and sub-subcontractors this subcontractor pays on the job.") +
          (rules?.waivers.lower_tier_required ? " Their waivers are required before payment goes out." : "")
        }
      >
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Provides</TableHead>
              <TableHead numeric>Agreement</TableHead>
              <TableHead numeric>Paid</TableHead>
              <TableHead numeric>Owed</TableHead>
              <TableHead>Payments</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lowerTier.length === 0 && <TableEmpty colSpan={6}>{role === "payee" ? "No suppliers or sub-subcontractors yet." : "None declared on this subcontract yet."}</TableEmpty>}
            {lowerTier.map((c) => (
              <TableRow key={c.id} className="align-top">
                <TableCell className="font-medium">{c.sub.name}</TableCell>
                <TableCell muted>
                  {c.lowerTierKind === "supplier" ? "Supplier" : "Sub-subcontractor"}, {c.trade}
                </TableCell>
                <TableCell numeric>{formatCents(c.contractSumCents)}</TableCell>
                <TableCell numeric>{formatCents(c.paidCents)}</TableCell>
                <TableCell numeric>{formatCents(c.owedCents)}</TableCell>
                <TableCell>
                  {c.releases.length === 0 ? (
                    <span className="type-meta text-muted-foreground">None yet</span>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {c.releases.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center gap-2">
                          <span className="type-mono">{formatCents(r.releaseCents)}</span>
                          <StatusPill status={r.status} map={RELEASE} />
                          {/* The signing link is the claimant's alone; the party paying them only learns that it was sent. */}
                          {r.waivers.some((w) => w.status === "sent") && <span className="type-meta text-muted-foreground">waiver sent to them</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {actions.addLowerTier && (
          <FoldedForm label="Add a supplier or sub-subcontractor" action={actions.addLowerTier} submit="Add to this job">
            {hidden}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <Input name="name" required placeholder="Bay Rebar Supply" />
              </Field>
              <Field label="Type">
                <Select name="kind" defaultValue="supplier">
                  <option value="supplier">Supplier</option>
                  <option value="subcontractor">Sub-subcontractor</option>
                </Select>
              </Field>
            </div>
            <Field label="What they provide" optional>
              <Input name="scope" placeholder="Reinforcing steel" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Agreement amount" help="In dollars.">
                <Input name="sum" inputMode="decimal" required placeholder="60,000.00" className="type-mono" />
              </Field>
              <Field label="Pay within" help="Days. Leave empty to use the state's deadline." optional>
                <Input name="days" inputMode="numeric" className="type-mono" />
              </Field>
            </div>
          </FoldedForm>
        )}
      </Section>
    </div>
  );
}
