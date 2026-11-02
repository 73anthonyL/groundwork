import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getWaiver } from "@/server/scoped";
import { formatCents } from "@/lib/money";
import { WAIVER_TITLES, waiverBody, type WaiverFields, type WaiverFormId } from "@/domain/waivers/ca";
import { SignWaiverForm } from "@/components/sign-waiver-form";

export default async function SignWaiverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org, user } = await requireAuth("sub");
  const waiver = await getWaiver(org, id);
  if (!waiver) notFound();
  const fields = waiver.fields as WaiverFields;
  const meta = WAIVER_TITLES[waiver.form as WaiverFormId];
  const body = waiverBody(fields);
  const amount = fields.amountCents !== null ? formatCents(fields.amountCents) : "";

  return (
    <div>
      <Link href={`/sub/contracts/${waiver.contractId}`} className="text-sm text-muted-foreground hover:underline">
        ← Back
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{meta.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {meta.cite} · {meta.conditional ? "takes effect only when the payment clears" : "confirms payment received"}
      </p>

      <div className="num mt-4 rounded-md border bg-card p-4">
        <div className="text-xs text-muted-foreground">Amount of this release</div>
        <div className="text-2xl font-semibold">{amount}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {waiver.release.contract.project.gc.name} · pay app #{waiver.release.payApplication.number}
          {fields.throughDate ? ` · through ${fields.throughDate}` : ""}
        </div>
      </div>

      <article className="mt-4 rounded-md border bg-card p-4 font-mono text-[13px] leading-relaxed" aria-label="Statutory form text">
        {body.map((line, i) =>
          line === "" ? <div key={i} className="h-3" /> : <p key={i} className={/^[A-Z ()0-9.§]+$/.test(line) && line.length < 80 ? "font-semibold" : ""}>{line}</p>,
        )}
      </article>

      {waiver.status === "signed" ? (
        <div className="mt-6 rounded-md border border-settled/40 bg-settled-soft p-4 text-sm">
          <div className="font-medium text-settled">Signed by {waiver.signerName}</div>
          <div className="mt-1 break-all font-mono text-xs text-muted-foreground">sha256 {waiver.signatureHash}</div>
        </div>
      ) : (
        <SignWaiverForm waiverId={waiver.id} defaultName={user.name} defaultTitle={user.title ?? ""} amountLabel={amount} />
      )}
    </div>
  );
}
