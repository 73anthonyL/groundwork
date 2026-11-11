/**
 * ReleaseTimeline: what has happened to one payment, and what has not happened yet.
 * Owner payment received, retainage held, waiver requested, waiver signed, payment sent, paid; a
 * failed bank payment and its retry appear where they occurred.
 *
 *   <ReleaseTimeline r={release} ownerName="Bayview Health" gcName="Meridian Builders" nowIso={nowIso} payee="Ironline Steel" log={log} />
 *
 * Props: `r` (a release with its event, payment, pay app and waivers); `ownerName`, `gcName`;
 * `nowIso` (the server's "now", for the countdown); `signHref?` (waiver id to its signing page: pass
 * it on the payee's own pages); `payee?` (the payee's name: set ONLY when someone other than the
 * payee is looking); `log?` (the recorded history from `paymentLog`, which adds exact times, who
 * acted, and failures and retries; without it the timeline is worked out from the release's state).
 *
 * Privacy: without `payee` the viewer is the subcontractor being paid, and the timeline leaves out
 * the amount and bank reference of the owner's payment. Those are the contractor's business.
 */
import { Countdown } from "@/components/countdown";
import { Timeline, type TimelineEvent } from "@/components/ui/timeline";
import { formatCents, formatCentsCompact } from "@/lib/money";

type Waiver = { id: string; form: string; status: string; signedAt: Date | null; signerName: string | null };
type ReleaseLike = {
  id: string;
  status: string;
  grossCents: number;
  retainageWithheldCents: number;
  offsetCents?: number;
  releaseCents: number;
  awaitingOwnerCents: number;
  payByAt: Date | null;
  event: { amountCents: number; receivedAt: Date; reference: string; periodThrough: string };
  kind?: string | null;
  payApplication: { number: number } | null;
  payment: { status: string; rail: string; externalBillId: string | null; updatedAt: Date; createdAt?: Date } | null;
  waivers: Waiver[];
};

export type ReleaseLog = {
  recordedBy: string | null;
  plannedAt: string;
  entries: { type: string; actor: string; at: string }[];
};

function fmt(d: Date | string) {
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const railName = (rail: string) => (rail === "simulated" ? "Test-mode ACH" : rail === "ramp" ? "Ramp bill pay" : rail);

export function ReleaseTimeline({
  r,
  ownerName,
  gcName,
  nowIso,
  signHref,
  payee,
  log,
}: {
  r: ReleaseLike;
  ownerName: string;
  gcName: string;
  nowIso: string;
  signHref?: (waiverId: string) => string;
  /** Set when someone other than the payee is looking. */
  payee?: string;
  log?: ReleaseLog | null;
}) {
  const conditional = r.waivers.find((w) => w.form === "cp_8132" || w.form === "cf_8136");
  const unconditional = r.waivers.find((w) => w.form === "up_8134" || w.form === "uf_8138");
  const paid = r.status === "paid" || r.status === "settled";
  const whose = payee ? `${payee}'s` : "your";
  const at = (type: string) => log?.entries.find((e) => e.type === type)?.at;
  const events: TimelineEvent[] = [];

  // 1. The owner's payment. Its size and bank reference are shown to the contractor only.
  events.push({
    id: "owner",
    actor: ownerName,
    verb: `paid ${gcName}`,
    time: fmt(r.event.receivedAt),
    detail: payee ? (
      <>
        <span className="num">{formatCentsCompact(r.event.amountCents)}</span>, reference <span className="type-mono">{r.event.reference}</span>
        {log?.recordedBy ? `. Recorded by ${log.recordedBy}.` : ""}
      </>
    ) : undefined,
  });

  // 2. The split: what was funded, what was held back.
  events.push({
    id: "split",
    actor: "Groundwork",
    verb:
      r.kind === "retention" || !r.payApplication
        ? `released retainage held on this subcontract`
        : r.retainageWithheldCents > 0
          ? `held ${formatCents(r.retainageWithheldCents)} retainage and set ${whose} payment`
          : `set ${whose} payment`,
    time: log ? fmt(log.plannedAt) : undefined,
    detail: (
      <span className="num">
        {r.payApplication ? (
          <>
            {formatCents(r.grossCents)} funded on pay app #{r.payApplication.number}, less {formatCents(r.retainageWithheldCents)} retainage
            {r.offsetCents ? `, less ${formatCents(r.offsetCents)} backcharge` : ""}, leaves{" "}
          </>
        ) : (
          "Released after its release condition was certified: "
        )}
        <strong className="font-medium text-foreground">{formatCents(r.releaseCents)}</strong>
        {r.awaitingOwnerCents ? `. ${formatCents(r.awaitingOwnerCents)} more has not been paid by the owner yet.` : ""}
      </span>
    ),
  });

  // 3 and 4. The conditional waiver: asked for, then signed.
  if (conditional) {
    events.push({ id: "asked", actor: "Groundwork", verb: `asked ${payee ?? "you"} for a conditional waiver`, time: log ? fmt(log.plannedAt) : undefined });
    if (conditional.status === "signed") {
      events.push({ id: "signed", actor: conditional.signerName ?? payee ?? "You", verb: "signed the conditional waiver", time: conditional.signedAt ? fmt(conditional.signedAt) : undefined });
    } else {
      events.push({
        id: "signed",
        state: "current",
        verb: payee ? `Waiting for ${payee} to sign the conditional waiver` : "Waiting for your signature on the conditional waiver",
        detail: signHref ? (
          <a href={signHref(conditional.id)} className="rounded-sm font-medium text-link underline-offset-4 hover:underline">
            Sign to release {formatCents(r.releaseCents)}
          </a>
        ) : undefined,
      });
    }
  } else if (!paid && !r.payment) {
    events.push({ id: "signed", state: "todo", verb: "Conditional waiver signed" });
  }

  // 5. The bank payment, with any failure and retry in the order they happened.
  const sends = log?.entries.filter((e) => e.type === "payment.initiated" || e.type === "payment.failed" || e.type === "payment.retried") ?? [];
  const sentDetail = r.payment ? (
    <>
      {railName(r.payment.rail)}
      {r.payment.externalBillId ? (
        <>
          , reference <span className="type-mono break-all">{r.payment.externalBillId}</span>
        </>
      ) : null}
    </>
  ) : undefined;
  if (sends.length > 0) {
    const kinds = sends.map((e) => e.type);
    const firstSend = kinds.indexOf("payment.initiated");
    const lastSend = kinds.lastIndexOf("payment.initiated");
    sends.forEach((e, i) => {
      if (e.type === "payment.initiated") events.push({ id: `send-${i}`, actor: "Groundwork", verb: i === firstSend ? "sent the payment" : "sent the payment again", time: fmt(e.at), detail: i === lastSend ? sentDetail : undefined });
      else if (e.type === "payment.failed") events.push({ id: `send-${i}`, state: "failed", verb: "The bank did not accept the payment. Nothing was sent.", time: fmt(e.at) });
      else events.push({ id: `send-${i}`, actor: e.actor, verb: "asked for the payment to be sent again", time: fmt(e.at) });
    });
  } else if (r.payment) {
    events.push({ id: "send", actor: "Groundwork", verb: "sent the payment", time: r.payment.createdAt ? fmt(r.payment.createdAt) : undefined, detail: sentDetail });
    if (r.payment.status === "failed") events.push({ id: "failed", state: "failed", verb: "The bank did not accept the payment. Nothing was sent.", time: fmt(r.payment.updatedAt) });
  } else {
    const ready = r.status === "waiver_signed";
    events.push({ id: "send", state: ready ? "current" : "todo", verb: ready ? "Payment queued" : "Payment sent", detail: ready ? "It is sent as soon as every required waiver is signed and the company paying it has been paid." : undefined });
  }

  // 6. Paid, or the deadline it is running against.
  if (paid) {
    events.push({
      id: "paid",
      verb: `${formatCents(r.releaseCents)} paid${payee ? ` to ${payee}` : ""}`,
      time: fmt(at("payment.paid") ?? r.payment?.updatedAt ?? r.event.receivedAt),
      detail: "Confirmed by the bank.",
    });
  } else {
    const moving = r.status === "payment_initiated";
    events.push({
      id: "paid",
      state: moving ? "current" : "todo",
      verb: moving ? "On its way to the bank account" : "Payment arrives",
      detail: <Countdown deadline={r.payByAt?.toISOString() ?? null} amountCents={r.releaseCents} settled={false} nowIso={nowIso} label="Due by" />,
    });
  }

  // 7. The unconditional waiver that follows payment.
  if (unconditional) {
    if (unconditional.status === "signed") {
      events.push({ id: "uncond", actor: unconditional.signerName ?? payee ?? "You", verb: "signed the unconditional waiver", time: unconditional.signedAt ? fmt(unconditional.signedAt) : undefined });
    } else {
      events.push({
        id: "uncond",
        state: "current",
        verb: payee ? `Waiting for ${payee} to sign the unconditional waiver` : "Waiting for your signature on the unconditional waiver",
        detail: signHref ? (
          <a href={signHref(unconditional.id)} className="rounded-sm font-medium text-link underline-offset-4 hover:underline">
            Sign the unconditional waiver
          </a>
        ) : undefined,
      });
    }
  }

  return <Timeline events={events} />;
}
