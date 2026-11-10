"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitPayAppAction, type SubmitState } from "@/app/sub/pay-apps/new/actions";

type Line = { id: string; lineNo: number; description: string; scheduledValueCents: number; previouslyCents: number };

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function PayAppForm({
  contractId,
  nextNumber,
  periodThrough,
  lines,
  previouslyBilledCents,
  retainageBps,
  prefill,
  lowerTier = [],
}: {
  contractId: string;
  nextNumber: number;
  periodThrough: string;
  lines: Line[];
  previouslyBilledCents: number;
  retainageBps: number | null;
  /** Demo shortcut: seed values keyed by line id. */
  prefill?: { lines: Record<string, number>; retainage: number };
  /** Suppliers and sub-subcontractors on this contract, to declare what is owed to each. */
  lowerTier?: { id: string; name: string; remainingCents: number }[];
}) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitPayAppAction, {});
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, prefill?.lines[l.id] ? String(prefill.lines[l.id] / 100) : ""])),
  );
  const [retainage, setRetainage] = useState<string>(prefill ? String(prefill.retainage / 100) : "");
  const gross = useMemo(() => lines.reduce((s, l) => s + Math.round((Number(values[l.id] || 0) || 0) * 100), 0), [lines, values]);
  const expectedRetainage = retainageBps !== null ? Math.round((gross * retainageBps) / 10_000) : null;
  const retainageCents = Math.round((Number(retainage || 0) || 0) * 100);
  const suggestRetainage = () => setRetainage(expectedRetainage !== null ? String(expectedRetainage / 100) : "");

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="contractId" value={contractId} />
      <input type="hidden" name="previouslyBilled" value={previouslyBilledCents / 100} />
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="number">Application no.</Label>
          <Input id="number" name="number" type="number" defaultValue={nextNumber} min={1} className="num" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="periodThrough">Work through</Label>
          <Input id="periodThrough" name="periodThrough" type="date" defaultValue={periodThrough} />
        </div>
      </div>

      <div className="rounded-xl bg-card shadow-card">
        <div className="grid grid-cols-[1fr_auto] gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
          <span>Line · scheduled value · billed before</span>
          <span>This period</span>
        </div>
        <ul className="divide-y">
          {lines.map((l) => (
            <li key={l.id} className="grid grid-cols-[1fr_120px] items-center gap-2 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {l.lineNo}. {l.description}
                </div>
                <div className="num text-xs text-muted-foreground">
                  {usd(l.scheduledValueCents)} · {usd(l.previouslyCents)} before
                </div>
              </div>
              <Input
                aria-label={`This period for ${l.description}`}
                name={`this_${l.id}`}
                inputMode="decimal"
                value={values[l.id] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [l.id]: e.target.value }))}
                placeholder="0.00"
                className="num text-right"
              />
              <input type="hidden" name={`stored_${l.id}`} value="" />
            </li>
          ))}
        </ul>
      </div>

      <dl className="num grid gap-2 rounded-xl bg-card shadow-card p-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Gross this period</dt>
          <dd className="font-medium">{usd(gross)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">
            Retainage withheld
            {expectedRetainage !== null && (
              <button type="button" onClick={suggestRetainage} className="ml-2 text-xs text-link hover:underline">
                use contract rate ({retainageBps! / 100}%)
              </button>
            )}
          </dt>
          <dd>
            <Input aria-label="Retainage withheld" name="retainage" inputMode="decimal" value={retainage} onChange={(e) => setRetainage(e.target.value)} placeholder="0.00" className="num w-32 text-right" />
          </dd>
        </div>
        <div className="flex justify-between border-t pt-2">
          <dt className="text-muted-foreground">Net due</dt>
          <dd className="font-semibold">{usd(gross - retainageCents)}</dd>
        </div>
      </dl>

      {lowerTier.length > 0 && (
        <fieldset className="rounded-xl bg-card shadow-card">
          <legend className="sr-only">Lower tier</legend>
          <div className="border-b px-3 py-2 text-xs text-muted-foreground">Owed to your suppliers and sub-subcontractors out of this application</div>
          <ul className="divide-y">
            {lowerTier.map((p) => (
              <li key={p.id} className="grid grid-cols-[1fr_120px] items-center gap-2 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="num text-xs text-muted-foreground">{usd(p.remainingCents)} left on their agreement</div>
                </div>
                <Input aria-label={`Owed to ${p.name}`} name={`lower_${p.id}`} inputMode="decimal" placeholder="0.00" className="num text-right" />
              </li>
            ))}
          </ul>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">When you are paid, Groundwork plans their share and sends them a waiver to sign. No account needed on their side.</p>
        </fieldset>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isFinal" className="h-4 w-4" /> This is the final application
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} variant="money" className="h-11 w-full">
        {pending ? "Submitting…" : "Submit pay application"}
      </Button>
    </form>
  );
}
