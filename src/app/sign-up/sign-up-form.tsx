"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "../sign-in/password-input";
import { signUpAction, type SignUpState } from "./actions";

export function SignUpForm() {
  const [state, action, pending] = useActionState<SignUpState, FormData>(signUpAction, {});
  const e = state.errors ?? {};
  const v = state.values;
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {state.formError && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-destructive">
          {state.formError}
        </p>
      )}
      <Field label="Company name" error={e.companyName}>
        <Input name="companyName" autoComplete="organization" defaultValue={v?.companyName ?? ""} autoFocus />
      </Field>
      <Field label="Your name" error={e.name}>
        <Input name="name" autoComplete="name" defaultValue={v?.name ?? ""} />
      </Field>
      <Field
        label="Work email"
        error={
          state.emailTaken ? (
            <>
              An account with that email already exists.{" "}
              <Link href="/sign-in" className="font-medium underline underline-offset-4">
                Sign in instead
              </Link>
            </>
          ) : (
            e.email
          )
        }
      >
        <Input name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} defaultValue={v?.email ?? ""} />
      </Field>
      <Field label="Password" help="At least 10 characters." error={e.password}>
        <PasswordInput name="password" autoComplete="new-password" />
      </Field>
      <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
        Create account
      </Button>
    </form>
  );
}
