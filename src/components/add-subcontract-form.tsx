"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileText, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { Field, FormActions } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addSubcontractAction, type AddSubcontractState } from "@/app/gc/projects/[id]/actions";

/**
 * The subcontract upload: the PDF, three facts about the deal, and who bills for the subcontractor.
 * Everything else is read out of the contract. When a contact email is given, the result is an
 * invitation link to copy (no email is sent), then on to the payment rules.
 *
 * Props: `projectId`; `knownSubs` (the contractor's existing subcontractors, offered by name);
 * `isSample` (invitations are off in the sample workspace, so the email field says so);
 * `cancelHref?` (adds a Cancel link beside the submit button).
 */
export function AddSubcontractForm({ projectId, knownSubs, isSample = false, cancelHref }: { projectId: string; knownSubs: string[]; isSample?: boolean; cancelHref?: string }) {
  const [state, action, pending] = useActionState<AddSubcontractState, FormData>(addSubcontractAction, {});
  // The browser clears the file input after a failed submit, so a chosen file belongs to one attempt.
  const [chosen, setChosen] = useState<{ name: string; attempt: AddSubcontractState } | null>(null);
  const file = chosen && chosen.attempt === state ? chosen.name : null;
  const setFile = (name: string | null) => setChosen(name ? { name, attempt: state } : null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const v = state.values;

  if (state.invited) {
    const { contractId, subName, email, url } = state.invited;
    return (
      <div role="status" className="flex flex-col gap-4">
        <p className="flex items-start gap-2 text-sm leading-5">
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-settled" />
          <span>
            <span className="font-medium">{subName}&rsquo;s subcontract is uploaded,</span> and an invitation was created for <span className="type-mono">{email}</span>.
          </span>
        </p>
        <CopyField label="Invite link" value={url} help="Email isn't connected: copy the link. Single use, 14 days." />
        <FormActions>
          <Link href={`/gc/contracts/${contractId}?read=1`} className={buttonVariants({ variant: "primary" })}>
            Review payment rules
          </Link>
        </FormActions>
      </div>
    );
  }

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="projectId" value={projectId} />

      <div className="group flex flex-col gap-1.5">
        <Label htmlFor="file">Signed subcontract</Label>
        <label
          htmlFor="file"
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f && input.current) {
              input.current.files = e.dataTransfer.files;
              setFile(f.name);
            }
          }}
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-6 py-8 text-center group-has-[input:focus-visible]:outline-2 group-has-[input:focus-visible]:outline-offset-2 group-has-[input:focus-visible]:outline-ring ${over ? "border-foreground bg-muted" : file ? "border-solid border-input bg-muted/60" : "border-input bg-background hover:border-foreground/40 hover:bg-muted/60"}`}
        >
          {file ? <FileText className="mb-1 size-5 text-foreground" aria-hidden /> : <Upload className="mb-1 size-5 text-muted-foreground" aria-hidden />}
          <span className="text-sm leading-5 font-medium">{file ?? "Drop the PDF here, or click to choose it"}</span>
          <span className="type-meta text-muted-foreground">{file ? "Click to choose a different file" : "A PDF with selectable text, up to 4 MB. Scanned pages cannot be read yet."}</span>
        </label>
        <input ref={input} id="file" name="file" type="file" accept="application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0]?.name ?? null)} />
      </div>

      <Field label="Subcontractor">
        <Input id="subName" name="subName" list="known-subs" defaultValue={v?.subName} placeholder="Company name" autoComplete="off" />
      </Field>
      <datalist id="known-subs">
        {knownSubs.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Trade">
          <Input id="trade" name="trade" defaultValue={v?.trade} placeholder="Painting, plumbing, roofing" autoComplete="off" />
        </Field>
        <Field label="Subcontract sum">
          <Input id="sum" name="sum" inputMode="decimal" defaultValue={v?.sum} placeholder="150,000.00" className="type-mono" autoComplete="off" />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Their billing contact" optional>
          <Input id="contactName" name="contactName" defaultValue={v?.contactName} placeholder="Full name" autoComplete="off" />
        </Field>
        <Field label="Contact email" optional help={isSample ? "Invitations are turned off in the sample workspace, so nothing is created for this address." : "Creates an invite link for you to send. No email is sent."}>
          <Input id="contactEmail" name="contactEmail" type="email" defaultValue={v?.contactEmail} placeholder="name@company.com" autoComplete="off" />
        </Field>
      </div>

      {state.error && (
        <p role="alert" className="type-meta rounded-md bg-destructive-soft px-3 py-2 text-destructive">
          {state.error}
        </p>
      )}

      <FormActions>
        <p className="type-meta mr-auto max-w-xs text-muted-foreground">Next, Claude reads the payment terms and you approve them. Nothing is paid until you do.</p>
        {cancelHref && (
          <Link href={cancelHref} className={buttonVariants({ variant: "secondary" })}>
            Cancel
          </Link>
        )}
        <Button type="submit" loading={pending}>
          Upload and read contract
        </Button>
      </FormActions>
    </form>
  );
}
