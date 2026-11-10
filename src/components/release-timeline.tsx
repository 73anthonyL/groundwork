import { Countdown } from "@/components/countdown";
import { formatCents, formatCentsCompact } from "@/lib/money";
import { WAIVER_TITLES, type WaiverFormId } from "@/domain/waivers/ca";

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
  payment: { status: string; rail: string; externalBillId: string | null; updatedAt: Date } | null;
  waivers: Waiver[];
};

const ORDER = ["awaiting_waiver", "waiver_signed", "payment_initiated", "paid", "settled"];

function fmt(d: Date) {
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Owner paid → allocated to you → waiver → payment sent → paid. The sub's "where is my money". */
export function ReleaseTimeline({ r, ownerName, gcName, nowIso, signHref, payee }: { r: ReleaseLike; ownerName: string; gcName: string; nowIso: string; signHref?: (waiverId: string) => string; /** Set when someone other than the payee is looking. */ payee?: string }) {
  const stage = r.status === "blocked" ? -1 : ORDER.indexOf(r.status);
  const conditional = r.waivers.find((w) => w.form === "cp_8132" || w.form === "cf_8136");
  const unconditional = r.waivers.find((w) => w.form === "up_8134" || w.form === "uf_8138");
  const steps: { title: string; detail: React.ReactNode; done: boolean; active: boolean; tone?: "money" | "settled" | "hold" }[] = [
    {
      title: `${ownerName} paid ${gcName}`,
      detail: `${formatCentsCompact(r.event.amountCents)} · ${r.event.reference} · ${fmt(r.event.receivedAt)}`,
      done: true,
      active: false,
    },
    {
      title: payee ? `${payee}'s share, by the rules` : "Your share, by the rules",
      detail: (
        <span className="num">
          {r.payApplication ? `${formatCents(r.grossCents)} funded on pay app #${r.payApplication.number} − ${formatCents(r.retainageWithheldCents)} retainage${r.offsetCents ? ` − ${formatCents(r.offsetCents)} backcharge` : ""} = ` : "Retainage held on this contract, released on certification: "}
          <strong>{formatCents(r.releaseCents)}</strong>
          {r.awaitingOwnerCents ? ` · ${formatCents(r.awaitingOwnerCents)} still with the owner` : ""}
        </span>
      ),
      done: true,
      active: false,
    },
    {
      title: conditional ? WAIVER_TITLES[conditional.form as WaiverFormId].title : "Waiver",
      detail:
        conditional?.status === "signed"
          ? `Signed by ${conditional.signerName} · ${conditional.signedAt ? fmt(conditional.signedAt) : ""}`
          : conditional && signHref
            ? (
                <a href={signHref(conditional.id)} className="font-medium text-link hover:underline">
                  Sign to release {formatCents(r.releaseCents)}
                </a>
              )
            : payee ? `Waiting for ${payee} to sign` : "Waiting for your signature",
      done: stage >= 1,
      active: stage === 0,
      tone: "hold",
    },
    {
      title: "Payment sent",
      detail: r.payment ? `${r.payment.rail === "simulated" ? "Simulated ACH" : r.payment.rail} · ${r.payment.externalBillId ?? ""} · ${r.payment.status}` : "Queued once the waiver is signed",
      done: stage >= 2,
      active: stage === 1,
      tone: "money",
    },
    {
      title: "Paid",
      detail:
        stage >= 3
          ? `${formatCents(r.releaseCents)} landed${r.payment ? ` · ${fmt(r.payment.updatedAt)}` : ""}${unconditional ? ` · ${unconditional.status === "signed" ? "unconditional release signed" : "unconditional release waiting for your signature"}` : ""}`
          : (
              <Countdown deadline={r.payByAt?.toISOString() ?? null} amountCents={r.releaseCents} settled={false} nowIso={nowIso} label="Due by law" />
            ),
      done: stage >= 3,
      active: stage === 2,
      tone: "settled",
    },
  ];
  return (
    <ol className="relative ml-2 border-l border-border pl-5">
      {steps.map((s, i) => (
        <li key={i} className="relative pb-5 last:pb-0">
          <span
            aria-hidden
            className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 ${
              s.done ? "border-settled bg-settled" : s.active ? `border-${s.tone ?? "money"} bg-card` : "border-border bg-card"
            }`}
          />
          <div className={`text-sm font-medium ${s.done || s.active ? "" : "text-muted-foreground"}`}>{s.title}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">{s.detail}</div>
        </li>
      ))}
      {unconditional && unconditional.status !== "signed" && signHref && (
        <li className="relative">
          <a href={signHref(unconditional.id)} className="text-sm font-medium text-link hover:underline">
            Sign the unconditional release
          </a>
        </li>
      )}
    </ol>
  );
}
