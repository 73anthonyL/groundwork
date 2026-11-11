/**
 * The pieces of a waiver screen, shared by the signed-in signing page (/sub/waivers/[id]/sign) and
 * the no-account one (/w/[token]): the facts in plain words, the waiver itself set as a document in
 * the contract serif, and what happens after signing.
 */
import { waiverBody, type WaiverFields } from "@/domain/waivers/ca";
import { formatCents } from "@/lib/money";
import { Timeline, type TimelineEvent } from "@/components/ui/timeline";
import { fullDay, isoDay, isPaid } from "./format";

/** Amount, through date, who is paying and the job, above the document. */
export function WaiverFacts({ fields, payerName, projectName, conditional }: { fields: WaiverFields; payerName: string; projectName: string; conditional: boolean }) {
  const facts: { label: string; value: React.ReactNode; hint?: string }[] = [
    ...(fields.amountCents !== null ? [{ label: conditional ? "Amount this releases" : "Amount you received", value: <span className="num text-base font-semibold">{formatCents(fields.amountCents)}</span> }] : []),
    { label: conditional ? "Paying you" : "Paid by", value: payerName },
    ...(fields.throughDate ? [{ label: "For work through", value: /^\d{4}-\d{2}-\d{2}$/.test(fields.throughDate) ? isoDay(fields.throughDate) : fields.throughDate }] : []),
    { label: "Project", value: projectName },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
      {facts.map((f) => (
        <div key={f.label} className="min-w-0 bg-card px-4 py-3 last:odd:col-span-2 sm:last:odd:col-span-1">
          <dt className="type-meta text-muted-foreground">{f.label}</dt>
          <dd className="mt-0.5 text-sm leading-5 font-medium break-words">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The waiver text as a page of paper. Every word here is the statutory or general form, so all of it
 * is in the serif; the software's own words stay outside this box.
 */
export function WaiverDocument({ fields, signature }: { fields: WaiverFields; signature?: { name: string; title: string | null; at: Date | null; hash: string | null } | null }) {
  const lines = waiverBody(fields);
  return (
    <article aria-label="Waiver text" className="type-contract rounded-lg border bg-card px-5 py-7 text-[15px] text-foreground sm:px-10 sm:py-10">
      <div className="mx-auto flex max-w-[62ch] flex-col gap-1">
        {lines.map((line, i) => {
          if (line === "") return <div key={i} className="h-2" aria-hidden />;
          if (i === 0)
            return (
              <h2 key={i} className="text-center text-[17px] leading-6 font-semibold text-balance font-serif tracking-normal">
                {line}
              </h2>
            );
          if (i === 1 && line.startsWith("("))
            return (
              <p key={i} className="text-center text-muted-foreground">
                {line}
              </p>
            );
          if (line.startsWith("NOTICE")) {
            const cut = line.indexOf(":");
            return (
              <p key={i} className="border-y py-3 text-[14px] leading-[1.45]">
                <strong className="font-semibold">{line.slice(0, cut + 1)}</strong>
                {line.slice(cut + 1)}
              </p>
            );
          }
          if (!line.includes(":") && line.length < 40)
            return (
              <h3 key={i} className="mt-2 text-[15px] font-semibold font-serif tracking-normal">
                {line}
              </h3>
            );
          const field = line.length < 140 ? /^([A-Z][A-Za-z ]{2,48}): (.+)$/.exec(line) : null;
          if (field)
            return (
              <p key={i} className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground">{field[1]}:</span>
                <span className="num font-semibold">{field[2]}</span>
              </p>
            );
          const lead = /^((?:Conditional|Unconditional) Waiver and Release): (.+)$/.exec(line);
          return lead ? (
            <p key={i}>
              <strong className="font-semibold">{lead[1]}:</strong> {lead[2]}
            </p>
          ) : (
            <p key={i}>{line}</p>
          );
        })}
        {signature && (
          <div className="mt-6 border-t pt-4">
            <p className="text-[19px] leading-7 italic">{signature.name}</p>
            <p className="text-muted-foreground">
              {signature.title ? `${signature.title}, for ` : "For "}
              {fields.claimant}
              {signature.at ? `. Signed electronically ${signature.at.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}.` : "."}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

/** The fingerprint that ties a signature to this exact waiver. Software words, so sans and mono. */
export function SignatureRecord({ hash }: { hash: string | null }) {
  if (!hash) return null;
  return (
    <p className="type-caption text-muted-foreground">
      Signature record: <span className="type-mono break-all">sha256 {hash}</span>
    </p>
  );
}

/** After signing: the steps this payment still has to take, with the legal deadline. */
export function NextSteps({
  conditional,
  amountCents,
  releaseStatus,
  payerName,
  payByAt,
  signedAt,
  signerName,
  waitingOnUpstream,
}: {
  conditional: boolean;
  amountCents: number;
  releaseStatus: string;
  payerName: string;
  payByAt: Date | null;
  signedAt: Date | null;
  signerName: string | null;
  /** Lower tier only: the name of the company that must pay `payerName` first, when it has not yet. */
  waitingOnUpstream?: string | null;
}) {
  const amount = formatCents(amountCents);
  const time = (d: Date | null) => (d ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : undefined);
  if (!conditional) {
    return (
      <Timeline
        events={[
          { verb: `${payerName} paid ${amount}`, state: "done" },
          { actor: signerName ?? undefined, verb: "confirmed receipt with the unconditional waiver", time: time(signedAt), state: "done" },
          { verb: "This payment is closed. Nothing else is needed from you.", state: "done" },
        ]}
      />
    );
  }
  const sent = releaseStatus === "payment_initiated";
  const landed = isPaid(releaseStatus);
  const blocked = releaseStatus === "blocked";
  const events: TimelineEvent[] = [
    { actor: signerName ?? undefined, verb: "signed the conditional waiver", time: time(signedAt), state: "done" },
    blocked
      ? { verb: "The payment is on hold", state: "failed", detail: `Contact ${payerName} to find out why. As its text says, the conditional waiver takes effect only when you receive this payment.` }
      : {
          verb: sent || landed ? `${payerName} sent ${amount}` : `${payerName} sends ${amount}`,
          state: sent || landed ? "done" : "current",
          detail: sent || landed ? undefined : waitingOnUpstream ? `It goes out as soon as ${waitingOnUpstream} has paid ${payerName}.` : "Your signature was the last thing the payment was waiting for.",
        },
    {
      verb: landed ? `${amount} landed in your account` : "The money lands in your account",
      state: landed ? "done" : sent ? "current" : "todo",
      detail: landed ? undefined : payByAt ? `Due by ${fullDay(payByAt)}. As its text says, the conditional waiver takes effect only when you receive this payment.` : "As its text says, the conditional waiver takes effect only when you receive this payment.",
    },
    ...(releaseStatus === "settled"
      ? [{ verb: "Receipt confirmed with an unconditional waiver", state: "done" as const }]
      : [{ verb: "You may be asked to confirm receipt with an unconditional waiver", state: "todo" as const }]),
  ];
  return <Timeline events={events} />;
}
