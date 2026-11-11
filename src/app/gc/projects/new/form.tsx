"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FormActions } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createProjectAction, type NewProjectState } from "./actions";

export type StateOption = { code: string; name: string; line: string; cite: string | null };

/** Six facts about the job. The state is the one that changes what Groundwork does, so it answers back. */
export function NewProjectForm({ states }: { states: StateOption[] }) {
  const [state, action, pending] = useActionState<NewProjectState, FormData>(createProjectAction, {});
  const v = state.values;
  const e = state.errors ?? {};
  // The form is reset after each submit, so the select takes its value from the last attempt and
  // a choice made since then is remembered against that attempt.
  const [choice, setChoice] = useState<{ attempt: NewProjectState; code: string } | null>(null);
  const picked = choice && choice.attempt === state ? choice.code : (v?.state ?? "");
  const law = states.find((s) => s.code === picked);
  return (
    <form action={action} noValidate className="flex flex-col gap-5 border-t pt-5">
      <Field label="Project name" error={e.name}>
        <Input name="name" defaultValue={v?.name} placeholder="Bayview Clinic tenant improvement" autoComplete="off" autoFocus />
      </Field>
      <Field label="Address" optional error={e.address}>
        <Input name="address" defaultValue={v?.address} placeholder="Street, city" autoComplete="off" />
      </Field>
      <Field
        label="State"
        error={e.state}
        help={
          law ? (
            <span aria-live="polite">
              <span className="text-foreground">{law.line}</span>
              {law.cite && <span className="type-mono ml-2 text-xs">{law.cite}</span>}
            </span>
          ) : (
            "The state the work is in. It decides the payment deadline, the retainage cap and the lien waiver forms."
          )
        }
      >
        <Select name="state" className="read-only:bg-card" key={v?.state ?? ""} defaultValue={v?.state ?? ""} onChange={(ev) => setChoice({ attempt: state, code: ev.target.value })}>
          <option value="">Choose a state</option>
          {states.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Owner" help="The company that pays you for this project." error={e.ownerName}>
        <Input name="ownerName" defaultValue={v?.ownerName} placeholder="Company name" autoComplete="off" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Prime contract sum" error={e.primeContractSumCents}>
          <Input name="sum" defaultValue={v?.sum} inputMode="decimal" placeholder="4,200,000.00" className="type-mono" autoComplete="off" />
        </Field>
        <Field label="Prime contract date" error={e.contractDate}>
          <Input name="contractDate" type="date" defaultValue={v?.contractDate} />
        </Field>
      </div>
      {state.error && (
        <p role="alert" className="type-meta text-destructive">
          {state.error}
        </p>
      )}
      <FormActions>
        <Link href="/gc/projects" className={buttonVariants({ variant: "secondary" })}>
          Cancel
        </Link>
        <Button type="submit" loading={pending}>
          Create project
        </Button>
      </FormActions>
    </form>
  );
}
