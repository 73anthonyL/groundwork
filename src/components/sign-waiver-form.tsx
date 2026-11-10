"use client";

/**
 * SignWaiverForm: the signature block under a waiver. Name, title, one statement to confirm, and one
 * button that says what signing does.
 *
 * Props: `waiverId`; `defaultName` / `defaultTitle` (empty for a no-account signer); `amountLabel`
 * ("$45,000.00", or "" when the form states no amount); `conditional` (true: signing releases the
 * payment; false: signing confirms it was received); `payerName`; `claimantName` (the company being
 * signed for); `action` (defaults to the signed-in action) and `token` for the no-account page.
 */
import { useActionState, useRef, useState } from "react";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { signWaiverAction, type SignState } from "@/app/sub/actions";

type SignAction = (prev: SignState, formData: FormData) => Promise<SignState>;

const NAME_ERROR = "Type your full name to sign.";
const ATTEST_ERROR = "Confirm the statement before signing.";

export function SignWaiverForm({
  waiverId,
  defaultName,
  defaultTitle,
  amountLabel,
  conditional = true,
  payerName,
  claimantName,
  action: signAction = signWaiverAction,
  token,
}: {
  waiverId: string;
  defaultName: string;
  defaultTitle: string;
  amountLabel: string;
  conditional?: boolean;
  payerName?: string;
  claimantName?: string;
  action?: SignAction;
  token?: string;
}) {
  const [state, action, pending] = useActionState<SignState, FormData>(signAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [local, setLocal] = useState<{ name?: string; attest?: string }>({});
  const nameError = local.name ?? (state.error === NAME_ERROR ? state.error : undefined);
  const attestError = local.attest ?? (state.error === ATTEST_ERROR ? state.error : undefined);
  const otherError = state.error && state.error !== NAME_ERROR && state.error !== ATTEST_ERROR ? state.error : undefined;
  const payer = payerName ?? "your customer";
  const label = !amountLabel ? "Sign waiver" : conditional ? `Sign waiver to release ${amountLabel}` : `Sign to confirm you received ${amountLabel}`;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(e.currentTarget);
    const next = {
      name: String(data.get("signerName") ?? "").trim().length < 3 ? NAME_ERROR : undefined,
      attest: data.get("attest") !== "on" ? ATTEST_ERROR : undefined,
    };
    setLocal(next);
    if (next.name || next.attest) {
      e.preventDefault();
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(next.name ? "[name=signerName]" : "[name=attest]")?.focus());
    }
  }

  return (
    <Panel title="Sign" description={claimantName ? `You are signing for ${claimantName}.` : undefined}>
      <form ref={formRef} action={action} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="waiverId" value={waiverId} />
        {token && <input type="hidden" name="token" value={token} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your full name" help="Typing your name is your signature." error={nameError}>
            <Input name="signerName" defaultValue={defaultName} autoComplete="name" className="type-contract h-10 text-[17px] italic md:text-[17px]" />
          </Field>
          <Field label="Your title" optional>
            <Input name="signerTitle" defaultValue={defaultTitle} autoComplete="organization-title" className="h-10" />
          </Field>
        </div>
        <div>
          <label className="flex items-start gap-2.5 text-sm leading-5">
            <input type="checkbox" name="attest" aria-invalid={attestError ? true : undefined} aria-describedby={attestError ? "attest-error" : undefined} className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" />
            <span>
              I am authorized to sign for {claimantName ?? "the claimant"}, and I intend this typed name to be my electronic signature under the ESIGN Act and the applicable state electronic transactions law.
            </span>
          </label>
          {attestError && (
            <p id="attest-error" role="alert" className="type-meta mt-1.5 pl-[26px] text-destructive">
              {attestError}
            </p>
          )}
        </div>
        {otherError && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
            This waiver was not signed: {otherError}
          </p>
        )}
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="type-meta max-w-md text-muted-foreground">
            {conditional
              ? `Signing lets ${payer} send this payment. The waiver takes effect only when the money reaches you.`
              : `Signing states that you have received this payment from ${payer}. Do not sign if the money has not arrived.`}
          </p>
          <Button type="submit" size="lg" loading={pending} className="shrink-0 max-sm:w-full">
            <PenLine aria-hidden />
            {label}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
