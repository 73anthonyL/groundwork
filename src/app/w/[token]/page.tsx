import { notFound } from "next/navigation";
import { getWaiverByToken } from "@/server/scoped";
import { formatCents } from "@/lib/money";
import { waiverMeta, type WaiverFields, type WaiverFormId } from "@/domain/waivers/ca";
import { SignWaiverForm } from "@/components/sign-waiver-form";
import { StatusPill } from "@/components/status-pill";
import { SUB_RELEASE as RELEASE } from "@/app/sub/_shared/status";
import { Wordmark } from "@/components/wordmark";
import { Notice } from "@/app/sub/_shared/notice";
import { fullDay, isPaid } from "@/app/sub/_shared/format";
import { NextSteps, SignatureRecord, WaiverDocument, WaiverFacts } from "@/app/sub/_shared/waiver";
import { signByTokenAction } from "./actions";

export const metadata = { title: "Sign a lien waiver", robots: { index: false, follow: false } };

/**
 * A lower-tier claimant's whole experience: see the money, read the waiver, sign. No account and no
 * app shell: the link is the credential, so the page stands alone under the wordmark. It shows only
 * this claimant's own payment, never what the company paying them was paid.
 */
export default async function TokenWaiverPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ signed?: string }> }) {
  const { token } = await params;
  const { signed } = await searchParams;
  const waiver = await getWaiverByToken(token);
  if (!waiver) notFound();
  const fields = waiver.fields as WaiverFields;
  const meta = waiverMeta(waiver.form as WaiverFormId, fields.state);
  const r = waiver.release;
  const amount = fields.amountCents !== null ? formatCents(fields.amountCents) : "";
  const claimant = r.contract.sub.name;
  const payerName = r.contract.payer.name;
  const upstream = r.event.parentRelease;
  const upstreamPaid = upstream ? isPaid(upstream.status) : true;
  const isSigned = waiver.status === "signed";
  const open = waiver.status === "sent";
  const landed = isPaid(r.status);

  const title = isSigned ? (landed ? `You have been paid ${formatCents(r.releaseCents)}` : "Waiver signed") : open ? (meta.conditional ? `Sign to release ${amount}` : amount ? `Confirm you received ${amount}` : "Sign your final waiver") : "This waiver is closed";
  const lede = isSigned
    ? null
    : open
      ? meta.conditional
        ? `${payerName} is ready to pay ${claimant} for work on ${r.contract.project.name}. Read the waiver below, then sign at the bottom. You do not need an account.`
        : `${payerName} has paid ${claimant}. Read the waiver below, then sign at the bottom to confirm you received it.`
      : null;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 w-full max-w-[820px] items-center justify-between gap-4 px-4 sm:px-6">
          <Wordmark href={`/w/${token}`} />
          <span className="type-meta truncate text-muted-foreground">{claimant}</span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[820px] flex-1 flex-col gap-6 px-4 pt-6 pb-16 sm:px-6 sm:pt-8">
        <div>
          <p className="type-caption text-muted-foreground">
            {r.contract.project.name}, payment from {payerName}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="type-title">{title}</h1>
            <StatusPill status={r.status} map={RELEASE} />
          </div>
          {lede && <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{lede}</p>}
          {open && meta.conditional && (
            <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
              {upstream ? `${payerName} ${upstreamPaid ? "has been paid" : "has not been paid yet"} by ${r.contract.project.gc.name}. ` : ""}
              {r.payByAt ? `Your payment is due by ${fullDay(r.payByAt)}.` : ""}
            </p>
          )}
        </div>

        {isSigned && (
          <>
            <Notice tone="settled" title={signed ? (meta.conditional ? `Signed. ${amount} is released for payment.` : "Signed. This payment is confirmed and closed.") : `Signed by ${waiver.signerName}`}>
              Keep this link. It is the way back to this page to check on your payment.
            </Notice>
            <section aria-labelledby="next-heading" className="flex flex-col gap-3">
              <h2 id="next-heading" className="type-section">
                What happens next
              </h2>
              <div className="rounded-lg border bg-card p-4">
                <NextSteps
                  conditional={meta.conditional}
                  amountCents={r.releaseCents}
                  releaseStatus={r.status}
                  payerName={payerName}
                  payByAt={r.payByAt}
                  signedAt={waiver.signedAt}
                  signerName={waiver.signerName}
                  waitingOnUpstream={upstream && !upstreamPaid ? r.contract.project.gc.name : null}
                />
              </div>
            </section>
          </>
        )}

        {!isSigned && !open && <Notice tone="info" title="This waiver is no longer open for signature">A newer waiver replaced it, or the payment was withdrawn. Ask {payerName} for a current link.</Notice>}

        <WaiverFacts fields={fields} payerName={payerName} projectName={r.contract.project.name} conditional={meta.conditional} />

        <section aria-labelledby="doc-heading" className="flex flex-col gap-3">
          <div>
            <h2 id="doc-heading" className="type-section">
              {meta.title}
            </h2>
            <p className="type-meta mt-0.5 text-muted-foreground">
              {meta.conditional ? "A conditional waiver: it takes effect only when the payment reaches you." : "An unconditional waiver: it states that you have been paid."} {meta.statutory ? `The wording is fixed by ${meta.cite}.` : `${meta.cite.replace(" · ", ", ")}.`}
            </p>
          </div>
          {meta.notice && <Notice tone="hold">{meta.notice}</Notice>}
          <WaiverDocument fields={fields} signature={isSigned && waiver.signerName ? { name: waiver.signerName, title: waiver.signerTitle, at: waiver.signedAt, hash: waiver.signatureHash } : null} />
          {isSigned && <SignatureRecord hash={waiver.signatureHash} />}
        </section>

        {open && <SignWaiverForm waiverId={waiver.id} defaultName="" defaultTitle="" amountLabel={amount} conditional={meta.conditional} payerName={payerName} claimantName={claimant} action={signByTokenAction} token={token} />}

        <p className="type-caption text-muted-foreground">
          Groundwork runs subcontract payments for {r.contract.project.gc.name} on {r.contract.project.name}. Questions about the amount go to {payerName}.
        </p>
      </main>
    </div>
  );
}
