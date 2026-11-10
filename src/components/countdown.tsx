"use client";

import { useEffect, useState } from "react";

/**
 * Statutory clock. Green with more than 48h left, amber under 48h, red when overdue with the
 * §7108.5 penalty estimate (2% per month of the late amount). Ticks every 30 seconds.
 */
export function Countdown({
  deadline,
  amountCents,
  settled,
  label = "Pay by",
  nowIso,
}: {
  deadline: string | null;
  amountCents: number;
  settled: boolean;
  label?: string;
  /** Server-provided "now" (supports DEMO_NOW); the client keeps ticking from it. */
  nowIso: string;
}) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setOffset(Date.now() - started), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!deadline) return <span className="text-xs text-muted-foreground">No statutory deadline loaded</span>;
  // Dates are formatted in the viewer's locale; the server's guess may differ, so hydration is relaxed here.
  const now = new Date(nowIso).getTime() + offset;
  const due = new Date(deadline).getTime();
  const ms = due - now;
  const dueText = new Date(due).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (settled) {
    return (
      <span suppressHydrationWarning className="text-[13px] text-muted-foreground">
        Paid ahead of {dueText}
      </span>
    );
  }
  if (ms < 0) {
    const daysLate = Math.ceil(-ms / 86_400_000);
    const penalty = Math.round((amountCents * 0.02 * daysLate) / 30);
    return (
      <span suppressHydrationWarning className="inline-flex items-center gap-1.5 text-[13px] font-medium text-destructive">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-destructive" />
        {daysLate}d late, about ${(penalty / 100).toFixed(2)} in penalties so far
      </span>
    );
  }
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const urgent = ms < 48 * 3_600_000;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px]">
      {urgent && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-money" />}
      <span className="num" suppressHydrationWarning>
        <span className="text-muted-foreground">{label} {dueText}</span>
        <span className={urgent ? "ml-2 font-medium text-money" : "ml-2"}>{d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`} left</span>
      </span>
    </span>
  );
}
