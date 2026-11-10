"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormActions } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { inviteTeammateAction, type InviteState } from "./actions";

/** Invite one teammate by email into the subcontractor's own company. Nothing is emailed: the link appears in the list to copy. */
export function InviteForm({ orgName }: { orgName: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteTeammateAction, {});
  const v = state.values;
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" error={state.field === "email" ? state.error : undefined}>
          <Input name="email" type="email" defaultValue={v?.email} placeholder="name@company.com" autoComplete="off" />
        </Field>
        <Field label="Name" optional error={state.field === "name" ? state.error : undefined}>
          <Input name="name" defaultValue={v?.name} placeholder="Full name" autoComplete="off" />
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
            Invitation created for <span className="type-mono break-all">{state.created.email}</span> to join {orgName}. Email sending is not connected; copy the link below and send it yourself.
          </span>
        </p>
      )}
      <FormActions className="pt-0">
        <Button type="submit" loading={pending} className="max-sm:h-10 max-sm:w-full">
          Create invite link
        </Button>
      </FormActions>
    </form>
  );
}
