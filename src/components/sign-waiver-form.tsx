"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signWaiverAction, type SignState } from "@/app/sub/actions";

type SignAction = (prev: SignState, formData: FormData) => Promise<SignState>;

export function SignWaiverForm({ waiverId, defaultName, defaultTitle, amountLabel, action: signAction = signWaiverAction, token }: { waiverId: string; defaultName: string; defaultTitle: string; amountLabel: string; action?: SignAction; token?: string }) {
  const [state, action, pending] = useActionState<SignState, FormData>(signAction, {});
  return (
    <form action={action} className="mt-6 grid gap-3 rounded-xl bg-card shadow-card p-4">
      <input type="hidden" name="waiverId" value={waiverId} />
      {token && <input type="hidden" name="token" value={token} />}
      <div className="grid gap-1.5">
        <Label htmlFor="signerName">Type your full name to sign</Label>
        <Input id="signerName" name="signerName" defaultValue={defaultName} autoComplete="name" required className="font-display text-lg" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="signerTitle">Title</Label>
        <Input id="signerTitle" name="signerTitle" defaultValue={defaultTitle} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="attest" className="mt-1 h-4 w-4" />
        <span>I am authorized to sign for the claimant, and I intend this typed name to be my electronic signature under the ESIGN Act and the applicable state electronic transactions law.</span>
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} variant="money" className="h-11 w-full">
        {pending ? "Signing…" : `Sign and release ${amountLabel}`}
      </Button>
    </form>
  );
}
