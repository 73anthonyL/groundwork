/**
 * StatusPill: the Badge for a subcontract, payment (release) or pay app status.
 *
 *   <StatusPill status={contract.status} />              // subcontract statuses (default map)
 *   <StatusPill status={r.status} map={RELEASE} />       // payments
 *   <StatusPill status={app.status} map={PAY_APP} />     // pay apps
 *
 * Each status has words, an icon and a tone: orange = money on its way, green = paid or approved,
 * amber = waiting on someone, red = blocked, grey = nothing happening yet. An unknown status is
 * shown as its own text in grey.
 */
import { CircleDashed, FileSearch, CheckCircle2, Loader2, PenLine, Send, Banknote, ShieldCheck, OctagonAlert, Inbox, type LucideIcon } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";

export type StatusMap = Record<string, { label: string; tone: BadgeTone; icon: LucideIcon }>;

export const CONTRACT: StatusMap = {
  draft: { label: "Not read yet", tone: "neutral", icon: CircleDashed },
  compiling: { label: "Reading", tone: "neutral", icon: Loader2 },
  in_review: { label: "Needs review", tone: "hold", icon: FileSearch },
  active: { label: "Rules approved", tone: "settled", icon: CheckCircle2 },
};

export const RELEASE: StatusMap = {
  planned: { label: "Planned", tone: "neutral", icon: CircleDashed },
  awaiting_waiver: { label: "Waiver requested", tone: "hold", icon: PenLine },
  waiver_signed: { label: "Waiver signed", tone: "money", icon: ShieldCheck },
  payment_initiated: { label: "Payment sent", tone: "money", icon: Send },
  paid: { label: "Paid", tone: "settled", icon: Banknote },
  settled: { label: "Paid and confirmed", tone: "settled", icon: CheckCircle2 },
  blocked: { label: "Blocked", tone: "danger", icon: OctagonAlert },
};

export const PAY_APP: StatusMap = {
  draft: { label: "Draft", tone: "neutral", icon: CircleDashed },
  submitted: { label: "Needs review", tone: "hold", icon: Inbox },
  changes_requested: { label: "Changes requested", tone: "hold", icon: FileSearch },
  approved: { label: "Approved", tone: "settled", icon: CheckCircle2 },
  funded: { label: "Funded by owner", tone: "settled", icon: Banknote },
  closed: { label: "Closed", tone: "neutral", icon: CheckCircle2 },
};

export function StatusPill({ status, map = CONTRACT, className }: { status: string; map?: StatusMap; className?: string }) {
  const s = map[status];
  if (!s) return <Badge className={className}>{status.replaceAll("_", " ")}</Badge>;
  const Icon = s.icon;
  return (
    <Badge tone={s.tone} icon={<Icon aria-hidden />} className={className}>
      {s.label}
    </Badge>
  );
}
