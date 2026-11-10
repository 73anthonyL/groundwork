"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "../../sign-in/password-input";
import { acceptAction, type AcceptState } from "./actions";

export function AcceptForm({ token, email, name, orgName }: { token: string; email: string; name: string | null; orgName: string }) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(acceptAction.bind(null, token), {});
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {state.formError && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-destructive">
          {state.formError}
          {state.signIn && (
            <>
              {" "}
              <Link href="/sign-in" className="font-medium underline underline-offset-4">
                Sign in
              </Link>
            </>
          )}
        </p>
      )}
      <Field label="Email" help="Your invitation was sent to this address. You will sign in with it.">
        <Input name="email" type="email" value={email} readOnly autoComplete="username" />
      </Field>
      <Field label="Your name" error={state.errors?.name}>
        <Input name="name" autoComplete="name" defaultValue={state.name ?? name ?? ""} autoFocus={!name} />
      </Field>
      <Field label="Password" help="At least 10 characters." error={state.errors?.password}>
        <PasswordInput name="password" autoComplete="new-password" autoFocus={!!name} />
      </Field>
      <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
        Join {orgName}
      </Button>
    </form>
  );
}
