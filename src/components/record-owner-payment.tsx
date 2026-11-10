"use client";

import { useActionState, useRef, useState } from "react";
import { motion } from "motion/react";
import { spring } from "@/lib/motion";
import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordOwnerPaymentAction, type RecordState } from "@/app/gc/projects/[id]/actions";

export function RecordOwnerPayment({
  projectId,
  defaults,
  onStage = false,
  emphasis = false,
}: {
  projectId: string;
  defaults: { amount: string; reference: string; periodThrough: string };
  /** The trigger sits on the dark page header. */
  onStage?: boolean;
  /** This is the next thing to do on the page, so the trigger is the loud button. */
  emphasis?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    // Hand focus back to the button that opened the form.
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const [state, action, pending] = useActionState<RecordState, FormData>(recordOwnerPaymentAction, {});
  return (
    <div>
      {!open ? (
        <Button ref={trigger} id="record-owner-payment" onClick={() => setOpen(true)} variant={onStage ? (emphasis ? "signal" : "stage") : "money"} size={onStage ? "lg" : "default"}>
          <Landmark aria-hidden />
          Record owner payment
        </Button>
      ) : (
        <motion.form
          action={action}
          initial={{ opacity: 0, scale: 0.97, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={spring.snappy}
          style={{ transformOrigin: "top left" }}
          className="w-full max-w-md rounded-xl bg-card p-5 text-foreground shadow-float [--ring:var(--link)]"
          aria-label="Record owner payment"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="amount">Amount received</Label>
              <Input id="amount" name="amount" inputMode="decimal" defaultValue={defaults.amount} className="num" required autoFocus />
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
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
            </div>
          </div>
        </motion.form>
      )}
    </div>
  );
}
