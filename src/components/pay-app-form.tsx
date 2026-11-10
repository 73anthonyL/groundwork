"use client";

/**
 * PayAppForm: bill one period against the schedule of values.
 *
 * One row per line: enter this period's work (and stored materials where the contract allows them);
 * total to date, percent and balance are computed as you type. The summary under the table carries
 * the whole arithmetic and the retainage field, and a floating bar keeps the net due and the submit
 * button in view. Nothing is disabled up front: submitting with a mistake lists what to fix, marks
 * each field and focuses the first one. The server action re-checks everything.
 */
import { useActionState, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "cn";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableFoot, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { submitPayAppAction, type SubmitState } from "@/app/sub/pay-apps/new/actions";

type Line = { id: string; lineNo: number; description: string; scheduledValueCents: number; previouslyCents: number };

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const plain = (c: number) => (c / 100).toFixed(2);
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "0%");

/** "$1,250.50" → 125050; "" → 0; NaN when it is not a non-negative amount. */
function cents(raw: string | undefined): number {
  const s = (raw ?? "").replace(/[$,\s]/g, "");
  if (s === "") return 0;
  if (!/^\d*\.?\d{0,2}$/.test(s) || s === ".") return NaN;
  return Math.round(Number(s) * 100);
}

const cell = "md:h-9 md:px-3 md:py-1";
/** On a phone a row is a small grid, not a table row: the cells that stay become plain blocks. */
const shown = "max-md:block max-md:h-auto max-md:p-0";
const head = "md:px-3";
const amountInput = "type-mono h-9 text-right md:h-7 md:px-2";

export function PayAppForm({
  contractId,
  nextNumber,
  periodThrough,
  lines,
  contractSumCents,
  previouslyBilledCents,
  retainageBps,
  storedMaterialsAllowed = false,
  payerName,
  cancelHref,
  prefill,
  lowerTier = [],
}: {
  contractId: string;
  nextNumber: number;
  periodThrough: string;
  lines: Line[];
  contractSumCents: number;
  previouslyBilledCents: number;
  retainageBps: number | null;
  /** True when the approved payment rules let the subcontractor bill for materials stored but not installed. */
  storedMaterialsAllowed?: boolean;
  payerName: string;
  cancelHref: string;
  /** Sample-data shortcut: starting values keyed by line id. */
  prefill?: { lines: Record<string, number>; retainage: number };
  /** Suppliers and sub-subcontractors on this contract, to declare what is owed to each. */
  lowerTier?: { id: string; name: string; remainingCents: number }[];
}) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitPayAppAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [number, setNumber] = useState(String(nextNumber));
  const [through, setThrough] = useState(periodThrough);
  const [work, setWork] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, prefill?.lines[l.id] ? plain(prefill.lines[l.id]) : ""])));
  const [stored, setStored] = useState<Record<string, string>>({});
  const [owed, setOwed] = useState<Record<string, string>>({});
  /** Null follows the contract rate; a string is what the person typed instead. */
  const [retainage, setRetainage] = useState<string | null>(prefill ? plain(prefill.retainage) : null);
  const [isFinal, setIsFinal] = useState(false);
  const [tried, setTried] = useState(false);

  const calc = useMemo(() => {
    const rows = lines.map((l) => {
      const w = cents(work[l.id]);
      const s = storedMaterialsAllowed ? cents(stored[l.id]) : 0;
      const bad = Number.isNaN(w) || Number.isNaN(s);
      const period = bad ? 0 : w + s;
      const toDate = l.previouslyCents + period;
      const over = toDate - l.scheduledValueCents;
      const error = Number.isNaN(w) ? "Enter an amount, like 1250.00." : Number.isNaN(s) ? "Stored materials must be an amount, like 1250.00." : over > 0 ? `Over the scheduled value by ${usd(over)}.` : null;
      return { ...l, w: Number.isNaN(w) ? 0 : w, s: Number.isNaN(s) ? 0 : s, toDate, balance: l.scheduledValueCents - toDate, error, workBad: Number.isNaN(w) || (over > 0 && w > 0), storedBad: Number.isNaN(s) || (over > 0 && s > 0) };
    });
    const workTotal = rows.reduce((x, r) => x + r.w, 0);
    const storedTotal = rows.reduce((x, r) => x + r.s, 0);
    const gross = workTotal + storedTotal;
    const expected = isFinal ? 0 : retainageBps !== null ? Math.round((gross * retainageBps) / 10_000) : null;
    const typed = retainage === null ? (expected ?? 0) : cents(retainage);
    const retainageError = Number.isNaN(typed) ? "Enter an amount, like 1250.00." : typed > gross ? "Retainage cannot be more than what is billed this period." : null;
    const held = Number.isNaN(typed) ? 0 : typed;
    const net = gross - held;
    const lower = lowerTier.map((p) => {
      const c = cents(owed[p.id]);
      return { ...p, c: Number.isNaN(c) ? 0 : c, error: Number.isNaN(c) ? "Enter an amount, like 1250.00." : null };
    });
    const lowerTotal = lower.reduce((x, p) => x + p.c, 0);
    const toDate = previouslyBilledCents + gross;
    return { rows, workTotal, storedTotal, gross, expected, held, retainageError, net, lower, lowerTotal, toDate, balance: contractSumCents - toDate };
  }, [lines, work, stored, owed, retainage, isFinal, retainageBps, storedMaterialsAllowed, lowerTier, previouslyBilledCents, contractSumCents]);

  const numberError = /^\d+$/.test(number) && Number(number) >= 1 ? null : "Enter the pay app number.";
  const throughError = /^\d{4}-\d{2}-\d{2}$/.test(through) ? null : "Choose the last day of the period you are billing.";
  const lowerOver = calc.lowerTotal > calc.net ? `What you owe your lower tier (${usd(calc.lowerTotal)}) cannot be more than the net due (${usd(calc.net)}).` : null;
  const problems: string[] = [
    ...(numberError ? [numberError] : []),
    ...(throughError ? [throughError] : []),
    ...calc.rows.filter((r) => r.error).map((r) => `Line ${r.lineNo}, ${r.description}: ${r.error}`),
    ...(calc.gross === 0 && !calc.rows.some((r) => r.error) ? ["Enter what you are billing this period on at least one line."] : []),
    ...(calc.retainageError ? [`Retainage: ${calc.retainageError}`] : []),
    ...calc.lower.filter((p) => p.error).map((p) => `Owed to ${p.name}: ${p.error}`),
    ...(lowerOver ? [lowerOver] : []),
  ];
  const offRate = calc.expected !== null && !calc.retainageError && calc.held !== calc.expected;
  const rateWords = retainageBps !== null ? `${retainageBps / 100}%` : null;
  const show = tried && problems.length > 0;
  const submitLabel = `Submit pay app #${/^\d+$/.test(number) ? number : nextNumber} for ${usd(calc.net)}`;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (problems.length === 0) return;
    e.preventDefault();
    setTried(true);
    // After this render, move to the first field marked invalid.
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
  }

  const submit = (className?: string) => (
    <Button type="submit" loading={pending} className={className}>
      {submitLabel}
    </Button>
  );

  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="contractId" value={contractId} />
      <input type="hidden" name="previouslyBilled" value={plain(previouslyBilledCents)} />

      {(show || state.error) && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm leading-5">
          <p className="font-medium text-destructive">{state.error && !show ? "This pay app was not submitted" : `Fix ${problems.length === 1 ? "this" : `these ${problems.length} things`} before submitting`}</p>
          <ul className="mt-1 list-disc pl-5">{show ? problems.map((p) => <li key={p}>{p}</li>) : <li>{state.error}</li>}</ul>
        </div>
      )}

      <div className="grid max-w-md grid-cols-2 gap-4">
        <Field label="Pay app number" error={tried && numberError}>
          <Input name="number" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} className="type-mono" />
        </Field>
        <Field label="Work through" error={tried && throughError}>
          <Input name="periodThrough" type="date" value={through} onChange={(e) => setThrough(e.target.value)} />
        </Field>
      </div>

      <section aria-labelledby="sov-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="sov-heading" className="type-section">
            Schedule of values
          </h2>
          <p className="type-meta mt-0.5 text-muted-foreground">
            Enter what you completed this period on each line{storedMaterialsAllowed ? ", and any materials stored on site but not yet installed" : ""}. Leave a line blank if you are not billing it.
          </p>
        </div>
        <Table>
          <TableHeader className="max-md:hidden">
            <TableRow>
              <TableHead className={head}>Line</TableHead>
              <TableHead numeric className={head}>
                Scheduled value
              </TableHead>
              <TableHead numeric className={head}>
                Previously billed
              </TableHead>
              <TableHead numeric className={cn(head, "w-36")}>
                This period
              </TableHead>
              {storedMaterialsAllowed && (
                <TableHead numeric className={cn(head, "w-36")}>
                  Stored materials
                </TableHead>
              )}
              <TableHead numeric className={cn(head, "max-xl:hidden")}>
                Total to date
              </TableHead>
              <TableHead numeric className={cn(head, "max-xl:hidden")}>
                %
              </TableHead>
              <TableHead numeric className={head}>
                Balance
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calc.rows.map((r) => (
              <TableRow key={r.id} className="max-md:grid max-md:grid-cols-2 max-md:gap-x-3 max-md:gap-y-2 max-md:px-4 max-md:py-3">
                <TableCell className={cn(cell, shown, "max-md:col-span-2")}>
                  <span className="font-medium md:font-normal">
                    <span className="type-mono text-muted-foreground">{r.lineNo}</span> {r.description}
                  </span>
                  <span className="type-meta num block text-muted-foreground md:hidden">
                    {usd(r.scheduledValueCents)} scheduled, {usd(r.previouslyCents)} billed before, {usd(r.balance)} left
                  </span>
                  {r.error && (
                    <span id={`err_${r.id}`} className="type-meta block text-destructive">
                      {r.error}
                    </span>
                  )}
                </TableCell>
                <TableCell numeric className={cn(cell, "max-md:hidden")}>
                  {usd(r.scheduledValueCents)}
                </TableCell>
                <TableCell numeric className={cn(cell, "text-muted-foreground max-md:hidden")}>
                  {usd(r.previouslyCents)}
                </TableCell>
                <TableCell className={cn(cell, shown, !storedMaterialsAllowed && "max-md:col-span-2")}>
                  <label className="type-caption mb-1 block text-muted-foreground md:hidden" htmlFor={`this_${r.id}`}>
                    This period
                  </label>
                  <Input
                    id={`this_${r.id}`}
                    name={`this_${r.id}`}
                    aria-label={`This period, line ${r.lineNo}, ${r.description}`}
                    aria-invalid={r.workBad || undefined}
                    aria-describedby={r.error ? `err_${r.id}` : undefined}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    value={work[r.id] ?? ""}
                    onChange={(e) => setWork((v) => ({ ...v, [r.id]: e.target.value }))}
                    className={amountInput}
                  />
                </TableCell>
                {storedMaterialsAllowed ? (
                  <TableCell className={cn(cell, shown)}>
                    <label className="type-caption mb-1 block text-muted-foreground md:hidden" htmlFor={`stored_${r.id}`}>
                      Stored materials
                    </label>
                    <Input
                      id={`stored_${r.id}`}
                      name={`stored_${r.id}`}
                      aria-label={`Stored materials, line ${r.lineNo}, ${r.description}`}
                      aria-invalid={r.storedBad || undefined}
                      aria-describedby={r.error ? `err_${r.id}` : undefined}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                      value={stored[r.id] ?? ""}
                      onChange={(e) => setStored((v) => ({ ...v, [r.id]: e.target.value }))}
                      className={amountInput}
                    />
                  </TableCell>
                ) : (
                  <td className="hidden">
                    <input type="hidden" name={`stored_${r.id}`} value="" />
                  </td>
                )}
                <TableCell numeric className={cn(cell, "max-xl:hidden")}>
                  {usd(r.toDate)}
                </TableCell>
                <TableCell numeric className={cn(cell, "text-muted-foreground max-xl:hidden")}>
                  {pct(r.toDate, r.scheduledValueCents)}
                </TableCell>
                <TableCell numeric className={cn(cell, "max-md:hidden", r.balance < 0 && "text-destructive")}>
                  {usd(r.balance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFoot className="max-md:hidden">
            <TableRow>
              <TableCell className={cell}>Total</TableCell>
              <TableCell numeric className={cell}>
                {usd(lines.reduce((s, l) => s + l.scheduledValueCents, 0))}
              </TableCell>
              <TableCell numeric className={cell}>
                {usd(lines.reduce((s, l) => s + l.previouslyCents, 0))}
              </TableCell>
              <TableCell numeric className={cn(cell, "md:pr-5")}>
                {usd(calc.workTotal)}
              </TableCell>
              {storedMaterialsAllowed && (
                <TableCell numeric className={cn(cell, "md:pr-5")}>
                  {usd(calc.storedTotal)}
                </TableCell>
              )}
              <TableCell numeric className={cn(cell, "max-xl:hidden")}>
                {usd(calc.rows.reduce((s, r) => s + r.toDate, 0))}
              </TableCell>
              <TableCell numeric className={cn(cell, "max-xl:hidden")}>
                {pct(calc.rows.reduce((s, r) => s + r.toDate, 0), lines.reduce((s, l) => s + l.scheduledValueCents, 0))}
              </TableCell>
              <TableCell numeric className={cell}>
                {usd(calc.rows.reduce((s, r) => s + r.balance, 0))}
              </TableCell>
            </TableRow>
          </TableFoot>
        </Table>
      </section>

      <div className="grid gap-6 md:grid-cols-2 md:items-start">
        <div className="flex flex-col gap-6">
          {lowerTier.length > 0 && (
            <Panel
              title="Owed to your lower tier"
              description="What you owe each supplier or sub-subcontractor out of this pay app."
              padded={false}
              footer={<p className="type-meta text-muted-foreground">They are paid from your payment and sign by link. No account needed.</p>}
            >
              <fieldset>
                <legend className="sr-only">Owed to your suppliers and sub-subcontractors out of this pay app</legend>
                <ul className="divide-y">
                  {calc.lower.map((p) => (
                    <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-3 px-4 py-2.5">
                      <label htmlFor={`lower_${p.id}`} className="min-w-0">
                        <span className="block truncate text-sm leading-5 font-medium">{p.name}</span>
                        <span className="type-meta num block text-muted-foreground">{usd(p.remainingCents)} left on their agreement</span>
                        {p.error && <span className="type-meta block text-destructive">{p.error}</span>}
                      </label>
                      <Input
                        id={`lower_${p.id}`}
                        name={`lower_${p.id}`}
                        aria-invalid={Boolean(p.error) || (lowerOver !== null && p.c > 0) || undefined}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00"
                        value={owed[p.id] ?? ""}
                        onChange={(e) => setOwed((v) => ({ ...v, [p.id]: e.target.value }))}
                        className="type-mono text-right"
                      />
                    </li>
                  ))}
                </ul>
                {lowerOver && <p className="type-meta border-t px-4 py-2 text-destructive">{lowerOver}</p>}
              </fieldset>
            </Panel>
          )}
          <label className="flex items-start gap-2.5 text-sm leading-5">
            <input type="checkbox" name="isFinal" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
            <span>
              This is the final pay app on this contract
              <span className="type-meta block text-muted-foreground">No retainage is withheld from a final pay app.</span>
            </span>
          </label>
        </div>

        <Panel title="This pay app" padded={false}>
          <dl className="num divide-y text-sm leading-5">
            <div className="grid gap-1.5 px-4 py-3">
              <Row label="Contract sum" value={usd(contractSumCents)} />
              <Row label="Previously billed" value={usd(previouslyBilledCents)} />
              <Row label="Work this period" value={usd(calc.workTotal)} />
              {storedMaterialsAllowed && <Row label="Stored materials this period" value={usd(calc.storedTotal)} />}
              <Row label={`Total billed to date (${pct(calc.toDate, contractSumCents)})`} value={usd(calc.toDate)} />
              <Row label="Balance to finish" value={usd(calc.balance)} tone={calc.balance < 0 ? "bad" : undefined} />
            </div>
            <div className="grid gap-2 px-4 py-3">
              <Row label="Billed this period" value={usd(calc.gross)} strong />
              <div className="flex items-start justify-between gap-4">
                <dt className="min-w-0 pt-2">
                  <label htmlFor="retainage" className="text-muted-foreground">
                    Retainage withheld{rateWords && !isFinal ? ` (${rateWords})` : ""}
                  </label>
                </dt>
                <dd className="w-36 shrink-0">
                  <Input
                    id="retainage"
                    name="retainage"
                    aria-invalid={Boolean(calc.retainageError) || undefined}
                    aria-describedby="retainage-note"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    value={retainage ?? (calc.expected !== null ? plain(calc.expected) : "")}
                    onChange={(e) => setRetainage(e.target.value)}
                    className="type-mono text-right"
                  />
                </dd>
              </div>
              <p id="retainage-note" className={cn("type-meta", calc.retainageError ? "text-destructive" : offRate ? "text-hold" : "text-muted-foreground")}>
                {calc.retainageError ??
                  (offRate ? (
                    <>
                      {isFinal ? "A final pay app carries no retainage" : `Your contract holds ${rateWords}, which is ${usd(calc.expected!)}`}. {payerName} will see the difference when reviewing.{" "}
                      <button type="button" onClick={() => setRetainage(null)} className="cursor-pointer font-medium text-link underline-offset-4 hover:underline">
                        Use {usd(calc.expected!)}
                      </button>
                    </>
                  ) : calc.expected !== null ? (
                    isFinal ? "Nothing is withheld from a final pay app." : `Worked out from your contract's ${rateWords} rate. It is held until the contract releases it.`
                  ) : (
                    "Your approved payment rules state no retainage rate. Enter what is withheld, or leave it blank."
                  ))}
              </p>
            </div>
            <div className="px-4 py-3">
              <Row label="Net due this period" value={usd(calc.net)} strong large />
            </div>
          </dl>
        </Panel>
      </div>

      <div className="sticky bottom-2 z-20 flex flex-col gap-3 rounded-lg border bg-card px-4 py-3 shadow-float sm:bottom-4 sm:flex-row sm:items-center sm:justify-between">
        <dl className="num flex items-baseline justify-between gap-x-6 text-sm leading-5 sm:justify-start">
          <div className="flex gap-2 max-lg:hidden">
            <dt className="text-muted-foreground">Billed</dt>
            <dd>{usd(calc.gross)}</dd>
          </div>
          <div className="flex gap-2 max-lg:hidden">
            <dt className="text-muted-foreground">Retainage</dt>
            <dd>{usd(calc.held)}</dd>
          </div>
          <div className="flex flex-1 items-baseline justify-between gap-2 sm:flex-none sm:justify-start">
            <dt className="text-muted-foreground">Net due</dt>
            <dd className="text-base font-semibold">{usd(calc.net)}</dd>
          </div>
        </dl>
        <div className="flex items-center gap-2 max-sm:flex-col max-sm:items-stretch">
          <Link href={cancelHref} className={buttonVariants({ variant: "secondary", className: "max-sm:hidden" })}>
            Cancel
          </Link>
          {submit("max-sm:h-10")}
        </div>
      </div>
    </form>
  );
}

function Row({ label, value, strong, large, tone }: { label: string; value: string; strong?: boolean; large?: boolean; tone?: "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "font-medium" : "text-muted-foreground"}>{label}</dt>
      <dd className={cn(strong && "font-semibold", large && "text-base", tone === "bad" && "text-destructive")}>{value}</dd>
    </div>
  );
}
