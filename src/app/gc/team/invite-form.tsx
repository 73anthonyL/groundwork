"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormActions } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { inviteAction, type InviteState } from "./actions";

/** Invite one person by email into the contractor's company or one of its subcontractors. Nothing is emailed: the link appears in the list to copy. */
export function InviteForm({ own, subs, preselect }: { own: { id: string; name: string }; subs: { id: string; name: string }[]; preselect?: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteAction, {});
  const v = state.values;
  const company = v?.orgId ?? (preselect && subs.some((s) => s.id === preselect) ? preselect : own.id);
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Email" error={state.field === "email" ? state.error : undefined}>
          <Input name="email" type="email" defaultValue={v?.email} placeholder="name@company.com" autoComplete="off" />
        </Field>
        <Field label="Name" optional error={state.field === "name" ? state.error : undefined}>
          <Input name="name" defaultValue={v?.name} placeholder="Full name" autoComplete="off" />
        </Field>
        <Field label="Joins">
          <Select name="orgId" className="read-only:bg-card" defaultValue={company} key={company}>
            <optgroup label="Your company">
              <option value={own.id}>{own.name}</option>
            </optgroup>
            {subs.length > 0 && (
              <optgroup label="Subcontractors">
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>
      </div>
      {state.error && !state.field && (
        <p role="alert" className="type-meta text-destructive">
          {state.error}
        </p>
      )}
      {state.created && (
        <p role="status" className="flex items-start gap-2 text-sm leading-5">
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-settled" />
          <span>
            Invitation created for <span className="type-mono">{state.created.email}</span> to join {state.created.orgName}. Email sending is not connected; copy the link from the list below and send it yourself.
          </span>
        </p>
      )}
      <FormActions className="pt-0">
        <Button type="submit" loading={pending}>
          Create invite link
        </Button>
      </FormActions>
    </form>
  );
}
