import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireAuth } from "@/server/auth";
import { getRelease, getWaiver } from "@/server/scoped";
import { formatCents } from "@/lib/money";
import { releaseLabel } from "@/lib/release-label";
import { waiverMeta, type WaiverFields, type WaiverFormId } from "@/domain/waivers/ca";
import { PageBody, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Section } from "@/components/ui/panel";
import { SignWaiverForm } from "@/components/sign-waiver-form";
import { Notice } from "../../../_shared/notice";
import { NextSteps, SignatureRecord, WaiverDocument, WaiverFacts } from "../../../_shared/waiver";

export const metadata = { title: "Sign a lien waiver" };

export default async function SignWaiverPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ signed?: string }> }) {
  const { id } = await params;
  const { signed } = await searchParams;
  const { org, user } = await requireAuth("sub");
  const waiver = await getWaiver(org, id);
  if (!waiver) notFound();
  const fields = waiver.fields as WaiverFields;
  const meta = waiverMeta(waiver.form as WaiverFormId, fields.state);
  const amount = fields.amountCents !== null ? formatCents(fields.amountCents) : "";
  const contract = waiver.release.contract;
  const payerName = contract.project.gc.name;
  const contractHref = `/sub/contracts/${waiver.contractId}`;
  const paymentHref = `${contractHref}#release-${waiver.releaseId}`;
  // Read the payment again so the confirmation shows where it stands right now.
  const release = waiver.status === "signed" ? await getRelease(org, waiver.releaseId) : null;
  const isSigned = waiver.status === "signed";
  const open = waiver.status === "sent" || waiver.status === "drafted";

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/sub" }, { label: contract.trade, href: contractHref }, { label: `${releaseLabel(waiver.release)} waiver` }]}
        title={isSigned ? "Waiver signed" : meta.conditional ? `Sign to release ${amount}` : amount ? `Confirm you received ${amount}` : "Sign your final waiver"}
        badge={isSigned ? <Badge tone="settled">Signed</Badge> : open ? <Badge tone="hold">Waiting for your signature</Badge> : <Badge>Closed</Badge>}
        description={
          isSigned
            ? undefined
            : meta.conditional
              ? `${payerName} is ready to pay you for ${releaseLabel(waiver.release, { lower: true })}. Read the waiver, then sign at the bottom.`
              : `Your payment for ${releaseLabel(waiver.release, { lower: true })} has landed. Read the waiver, then sign at the bottom to confirm it.`
        }
        actions={
          isSigned ? (
            <>
              <Link href={paymentHref} className={buttonVariants()}>
                View this payment
              </Link>
              <a href={`/api/waivers/${waiver.id}/pdf`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary" })}>
                <Download aria-hidden />
                Signed waiver (PDF)
              </a>
            </>
          ) : undefined
        }
        className="max-w-[820px]"
      />
      <PageBody className="max-w-[820px] gap-6">
        {isSigned && (
          <>
            <Notice tone="settled" title={signed ? (meta.conditional ? `Signed. ${amount} is released for payment.` : "Signed. This payment is confirmed and closed.") : `Signed by ${waiver.signerName}`}>
              {meta.conditional ? `${payerName} can now send your payment. You do not need to do anything else for it to go out.` : "Nothing else is needed from you for this payment."}
            </Notice>
            <Section title="What happens next">
              <div className="rounded-lg border bg-card p-4">
                <NextSteps
                  conditional={meta.conditional}
                  amountCents={waiver.release.releaseCents}
                  releaseStatus={release?.status ?? waiver.release.status}
                  payerName={payerName}
                  payByAt={release?.payByAt ?? waiver.release.payByAt}
                  signedAt={waiver.signedAt}
                  signerName={waiver.signerName}
                />
              </div>
            </Section>
          </>
        )}

        {!isSigned && !open && <Notice tone="info" title="This waiver is no longer open for signature">It was replaced or withdrawn. Check Home.</Notice>}

        <WaiverFacts fields={fields} payerName={payerName} projectName={contract.project.name} conditional={meta.conditional} />

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

        {open && <SignWaiverForm waiverId={waiver.id} defaultName={user.name} defaultTitle={user.title ?? ""} amountLabel={amount} conditional={meta.conditional} payerName={payerName} claimantName={org.name} />}
      </PageBody>
    </>
  );
}
