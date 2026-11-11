"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Clock } from "@/server/read/project";
import { duration, ease } from "@/lib/motion";
import { formatUsd0 } from "./rolling-number";

const R = 26;
const C = 2 * Math.PI * R;

function tone(left: number | null, total: number | null): string {
  if (left === null || total === null) return "var(--flow-idle)";
  if (left < 0) return "var(--destructive)";
  const share = left / total;
  return share < 0.25 ? "var(--money)" : share < 0.5 ? "var(--hold)" : "var(--settled)";
}

function leftText(ms: number | null): string {
  if (ms === null) return "no deadline";
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 86_400_000);
  const h = Math.floor((abs % 86_400_000) / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const t = d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
  return ms < 0 ? `${t} late` : `${t} left`;
}

/**
 * One statutory clock as a ring that empties toward its deadline, with the law behind it.
 * `nowIso` is the server's clock (so a frozen demo clock is respected); the ring keeps ticking from it.
 */
export function ClockRing({ clock, nowIso, size = 64 }: { clock: Clock; nowIso: string; size?: number }) {
  const reduce = useReducedMotion();
  const [drift, setDrift] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setDrift(Date.now() - t0), 15_000);
    return () => clearInterval(id);
  }, []);
  const now = new Date(nowIso).getTime() + drift;
  const start = new Date(clock.startedAt).getTime();
  const due = clock.payByAt ? new Date(clock.payByAt).getTime() : null;
  const total = due === null ? null : Math.max(1, due - start);
  const left = due === null ? null : due - now;
  const waiting = due !== null && now < start;
  const remaining = left === null || total === null ? 1 : Math.min(1, Math.max(0, left / total));
  const color = waiting ? "var(--flow-idle)" : tone(left, total);
  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox="0 0 64 64" className="shrink-0 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={R} fill="none" stroke="var(--border)" strokeWidth="4" />
        <motion.circle cx="32" cy="32" r={R} fill="none" stroke={color} strokeWidth="4" strokeLinecap="butt" strokeDasharray={C} initial={reduce ? false : { strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - remaining) }} transition={{ duration: reduce ? 0 : duration.draw, ease: ease.trace }} />
      </svg>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium">{clock.party}</span>
          <span className="type-mono shrink-0 font-medium">{formatUsd0(clock.cents)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="truncate text-muted-foreground">
            {clock.label}
            {clock.citations.length > 0 ? `, ${clock.citations[clock.citations.length - 1].cite}` : ", contract terms"}
          </span>
          <span className="num shrink-0" style={{ color: waiting || (left !== null && total !== null && left / total >= 0.5) ? "var(--muted-foreground)" : color }} suppressHydrationWarning>
            {waiting ? `starts when ${clock.payer} is paid` : leftText(left)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ClockBoard({ clocks, nowIso, empty = "No payment deadline is running right now." }: { clocks: Clock[]; nowIso: string; empty?: string }) {
  if (!clocks.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {clocks.map((c) => (
        <li key={c.releaseId} className="py-3 first:pt-0 last:pb-0">
          <ClockRing clock={c} nowIso={nowIso} size={28} />
        </li>
      ))}
    </ul>
  );
}
