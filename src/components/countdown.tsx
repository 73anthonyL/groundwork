"use client";

import { useEffect, useState } from "react";

/**
 * Countdown: a payment deadline as plain text in the color of its state. No dot, no box; the words
 * carry the meaning ("3d 4h left", "2d late").
 *   running   "Pay by Nov 12" in grey, then the time left in orange (a clock running), bold under 48 hours
 *   overdue   red, with the estimated late-payment penalty (2% a month of the amount)
 *   settled   grey, "Paid ahead of Nov 12"
 * Props: `deadline` (ISO string or null), `amountCents`, `settled`, `nowIso` (the server's "now";
 * the client keeps ticking from it every 30 seconds), `label` (default "Pay by").
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
  if (!deadline) return <span className="type-meta text-muted-foreground">No deadline</span>;
  // Dates are formatted in the viewer's locale; the server's guess may differ, so hydration is relaxed here.
  const now = new Date(nowIso).getTime() + offset;
  const due = new Date(deadline).getTime();
  const ms = due - now;
  const dueText = new Date(due).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (settled) {
    return (
      <span suppressHydrationWarning className="type-meta text-muted-foreground">
        Paid ahead of {dueText}
      </span>
    );
  }
  if (ms < 0) {
    const daysLate = Math.ceil(-ms / 86_400_000);
    const penalty = Math.round((amountCents * 0.02 * daysLate) / 30);
    return (
      <span suppressHydrationWarning className="type-meta num font-medium text-destructive">
        {daysLate}d late, about ${(penalty / 100).toFixed(2)} in penalties so far
      </span>
    );
  }
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const urgent = ms < 48 * 3_600_000;
  return (
    <span className="type-meta num whitespace-nowrap" suppressHydrationWarning>
      <span className="text-muted-foreground">
        {label} {dueText},
      </span>{" "}
      <span className={urgent ? "font-medium text-money" : "text-money"}>{d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`} left</span>
    </span>
  );
}
