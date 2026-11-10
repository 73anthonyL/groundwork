import { CircleDashed, FileSearch, CheckCircle2, Loader2, PenLine, Send, Banknote, ShieldCheck, OctagonAlert, Inbox, type LucideIcon } from "lucide-react";

type Tone = "neutral" | "hold" | "settled" | "money";

const CONTRACT: Record<string, { label: string; tone: Tone; icon: LucideIcon }> = {
  draft: { label: "Not read yet", tone: "neutral", icon: CircleDashed },
  compiling: { label: "Compiling", tone: "neutral", icon: Loader2 },
  in_review: { label: "Needs review", tone: "hold", icon: FileSearch },
  active: { label: "Rules approved", tone: "settled", icon: CheckCircle2 },
};

export const RELEASE: Record<string, { label: string; tone: Tone; icon: LucideIcon }> = {
  planned: { label: "Planned", tone: "neutral", icon: CircleDashed },
  awaiting_waiver: { label: "Waiver requested", tone: "hold", icon: PenLine },
  waiver_signed: { label: "Waiver signed", tone: "money", icon: ShieldCheck },
  payment_initiated: { label: "Payment sent", tone: "money", icon: Send },
  paid: { label: "Paid", tone: "settled", icon: Banknote },
  settled: { label: "Settled", tone: "settled", icon: CheckCircle2 },
  blocked: { label: "Blocked", tone: "neutral", icon: OctagonAlert },
};

export const PAY_APP: Record<string, { label: string; tone: Tone; icon: LucideIcon }> = {
  draft: { label: "Draft", tone: "neutral", icon: CircleDashed },
  submitted: { label: "Needs review", tone: "hold", icon: Inbox },
  changes_requested: { label: "Changes requested", tone: "hold", icon: FileSearch },
  approved: { label: "Approved", tone: "settled", icon: CheckCircle2 },
  funded: { label: "Funded", tone: "settled", icon: Banknote },
  closed: { label: "Closed", tone: "neutral", icon: CheckCircle2 },
};

const TONE: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  hold: "text-hold",
  settled: "text-settled",
  money: "text-money",
};

/**
 * Status is an icon and a word, never color alone. The icon carries the color; the word stays in
 * ink so a column of statuses reads as text, not as a row of stickers.
 */
export function StatusPill({ status, map = CONTRACT }: { status: string; map?: typeof CONTRACT }) {
  const s = map[status] ?? { label: status, tone: "neutral" as Tone, icon: CircleDashed };
  const Icon = s.icon;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${TONE[s.tone]}`} aria-hidden />
      <span className={s.tone === "neutral" ? "text-muted-foreground" : ""}>{s.label}</span>
    </span>
  );
}
