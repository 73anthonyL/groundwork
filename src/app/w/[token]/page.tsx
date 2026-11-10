import { notFound } from "next/navigation";
import { getWaiverByToken } from "@/server/scoped";
import { formatCents } from "@/lib/money";
import { waiverBody, waiverMeta, type WaiverFields, type WaiverFormId } from "@/domain/waivers/ca";
import { SignWaiverForm } from "@/components/sign-waiver-form";
import { StatusPill, RELEASE } from "@/components/status-pill";
import { Wordmark } from "@/components/wordmark";
import { signByTokenAction } from "./actions";

export const metadata = { title: "Sign a lien waiver" };

const WHERE: Record<string, string> = {
  awaiting_waiver: "Waiting for your signature.",
  waiver_signed: "Signed. Your payment goes out as soon as your customer has been paid.",
  payment_initiated: "Your payment has been sent.",
  paid: "You have been paid.",
  settled: "Paid and closed out.",
  blocked: "This payment is on hold. Contact your customer.",
};

/** A lower-tier claimant's whole experience: see the money, read the waiver, sign. No account. */
export default async function TokenWaiverPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ signed?: string }> }) {
  const { token } = await params;
  const { signed } = await searchParams;
  const waiver = await getWaiverByToken(token);
  if (!waiver) notFound();
  const fields = waiver.fields as WaiverFields;
  const meta = waiverMeta(waiver.form as WaiverFormId, fields.state);
  const r = waiver.release;
  const amount = fields.amountCents !== null ? formatCents(fields.amountCents) : "";
  const upstream = r.event.parentRelease;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <Wordmark href={`/w/${token}`} />
          <span className="text-xs text-muted-foreground">{r.contract.sub.name}</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
        <div className="text-xs text-muted-foreground">
          {r.contract.project.name} · from {r.contract.payer.name}
        </div>
        <div className="mt-1 flex items-end justify-between gap-3">
          <div className="num text-3xl font-semibold">{formatCents(r.releaseCents)}</div>
          <StatusPill status={r.status} map={RELEASE} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {WHERE[r.status] ?? ""}
          {upstream && r.status !== "paid" && r.status !== "settled"
            ? ` ${r.contract.payer.name} ${upstream.status === "paid" || upstream.status === "settled" ? "has been paid" : "has not been paid yet"} by ${r.contract.project.gc.name}.`
            : ""}
          {r.payByAt && r.status !== "paid" && r.status !== "settled" ? ` Due to you by ${r.payByAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.` : ""}
        </p>
        {signed && (
          <p role="status" className="mt-4 rounded-md border border-settled/40 bg-settled-soft px-3 py-2 text-sm text-settled">
            Signed. Keep this link to check on your payment.
          </p>
        )}

        <h1 className="mt-6 text-xl font-semibold">{meta.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {meta.cite} · {meta.conditional ? "takes effect only when the payment clears" : "confirms payment received"}
        </p>
        <article className="mt-4 rounded-md border bg-card p-4 font-mono text-[13px] leading-relaxed" aria-label="Waiver text">
          {waiverBody(fields).map((line, i) => (line === "" ? <div key={i} className="h-3" /> : <p key={i} className={/^[A-Z ()0-9.§:·']+$/.test(line) && line.length < 90 ? "font-semibold" : ""}>{line}</p>))}
        </article>

        {waiver.status === "signed" ? (
          <div className="mt-6 rounded-md border border-settled/40 bg-settled-soft p-4 text-sm">
            <div className="font-medium text-settled">Signed by {waiver.signerName}</div>
            <div className="mt-1 break-all font-mono text-xs text-muted-foreground">sha256 {waiver.signatureHash}</div>
          </div>
        ) : waiver.status === "sent" ? (
          <SignWaiverForm waiverId={waiver.id} defaultName="" defaultTitle="" amountLabel={amount} action={signByTokenAction} token={token} />
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">This waiver is no longer open for signature.</p>
        )}
      </main>
    </div>
  );
}
