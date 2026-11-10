"use client";

import { useActionState, useState } from "react";
import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { recordOwnerPaymentAction, type RecordState } from "@/app/gc/projects/[id]/actions";

/**
 * "Record owner payment": a button that opens the form in a dialog. The dialog traps focus, puts it
 * on the amount, closes on Escape and hands focus back to the button. Recording redirects to the
 * project, where the split is shown; an error stays in the dialog beside its field.
 *
 * Props: `projectId`; `defaults` (amount, reference, periodThrough; empty strings leave a field blank);
 * `emphasis` (this is the page's primary action); `deadlineDays` (the state's pay-subcontractors
 * deadline, to word the help text); `defaultOpen`. `onStage` is ignored; it is accepted so older pages compile.
 */
export function RecordOwnerPayment({
  projectId,
  defaults,
  emphasis = false,
  deadlineDays,
  defaultOpen = false,
}: {
  projectId: string;
  defaults: { amount: string; reference: string; periodThrough: string };
  /** @deprecated ignored */
  onStage?: boolean;
  emphasis?: boolean;
  deadlineDays?: number | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [state, action, pending] = useActionState<RecordState, FormData>(recordOwnerPaymentAction, {});
  const v = { ...defaults, receivedAt: "", retention: "", ...state.values };
  const err = (field: NonNullable<RecordState["field"]>) => (state.field === field ? state.error : undefined);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button id="record-owner-payment" variant={emphasis ? "primary" : "secondary"} />}>
        <Landmark aria-hidden />
        Record owner payment
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-lg p-0 shadow-float ring-0 sm:max-w-[480px]">
        <form action={action} noValidate>
          <div className="border-b px-5 py-4 pr-12">
            <DialogTitle className="text-base leading-6 font-semibold">Record owner payment</DialogTitle>
            <DialogDescription className="type-meta mt-0.5">Groundwork splits it and starts each deadline.</DialogDescription>
          </div>
          <input type="hidden" name="projectId" value={projectId} />
          <div className="flex flex-col gap-4 px-5 py-4">
            <Field label="Amount received" error={err("amount")}>
              <Input id="amount" name="amount" inputMode="decimal" defaultValue={v.amount} placeholder="0.00" className="type-mono" autoComplete="off" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bank reference" error={err("reference")}>
                <Input id="reference" name="reference" defaultValue={v.reference} placeholder="ACH or wire reference" className="type-mono" autoComplete="off" />
              </Field>
              <Field label="Pay period through" error={err("periodThrough")}>
                <Input id="periodThrough" name="periodThrough" type="date" defaultValue={v.periodThrough} />
              </Field>
            </div>
            <Field label="Received" optional error={err("receivedAt")} help={`Leave blank for now. ${deadlineDays ? `Each subcontractor's ${deadlineDays}-day deadline` : "Each subcontractor's payment deadline"} runs from this moment.`}>
              <Input id="receivedAt" name="receivedAt" type="datetime-local" defaultValue={v.receivedAt} />
            </Field>
            <Field label="Of which, retention released by the owner" optional error={err("retention")} help="Pays out retainage you have certified for release. The rest funds progress billing.">
              <Input id="retention" name="retention" inputMode="decimal" defaultValue={v.retention} placeholder="0.00" className="type-mono" autoComplete="off" />
            </Field>
            {state.error && !state.field && (
              <p role="alert" className="type-meta text-destructive">
                {state.error}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/60 px-5 py-3">
            <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
            <Button type="submit" loading={pending}>
              Record and split
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
