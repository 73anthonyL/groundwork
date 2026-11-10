"use client";

import { useActionState } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "./password-input";
import { signIn, type SignInState } from "./actions";

export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {state.error && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-destructive">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </p>
      )}
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} defaultValue={state.email ?? ""} autoFocus />
      </Field>
      <Field label="Password">
        <PasswordInput name="password" autoComplete="current-password" />
      </Field>
      <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
        Sign in
      </Button>
    </form>
  );
}
