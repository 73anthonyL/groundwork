"use client";

import { useActionState, useState } from "react";
import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordOwnerPaymentAction, type RecordState } from "@/app/gc/projects/[id]/actions";

export function RecordOwnerPayment({
  projectId,
  defaults,
  onStage = false,
}: {
  projectId: string;
  defaults: { amount: string; reference: string; periodThrough: string };
  /** The trigger sits on the dark page header. */
  onStage?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<RecordState, FormData>(recordOwnerPaymentAction, {});
  return (
    <div>
      {!open ? (
        <Button onClick={() => setOpen(true)} variant={onStage ? "stage" : "money"} size={onStage ? "lg" : "default"}>
          <Landmark aria-hidden />
          Record owner payment
        </Button>
      ) : (
        <form action={action} className="w-full max-w-md rounded-xl bg-card p-5 text-foreground shadow-float" aria-label="Record owner payment">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="amount">Amount received</Label>
              <Input id="amount" name="amount" inputMode="decimal" defaultValue={defaults.amount} className="num" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="reference">Bank reference</Label>
                <Input id="reference" name="reference" defaultValue={defaults.reference} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="periodThrough">Pay period through</Label>
                <Input id="periodThrough" name="periodThrough" type="date" defaultValue={defaults.periodThrough} required />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="receivedAt">Received</Label>
              <Input id="receivedAt" name="receivedAt" type="datetime-local" />
              <p className="text-xs text-muted-foreground">Leave blank for now. The 7-day clock starts from this moment.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="retention">Of which, retention released by the owner</Label>
              <Input id="retention" name="retention" inputMode="decimal" placeholder="0.00" className="num" />
              <p className="text-xs text-muted-foreground">Starts the pass-through clock on retainage you have certified for release. The rest funds progress billing.</p>
            </div>
            {state.error && (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending} variant="money">
                {pending ? "Allocating…" : "Record and allocate"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
