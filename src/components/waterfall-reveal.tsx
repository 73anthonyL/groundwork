"use client";

/**
 * The one orchestrated moment: when an owner payment has just been recorded, a line sweeps across
 * the top of its table and the rows arrive one after another.
 *
 *   <WaterfallReveal active={justRecorded}>
 *     <Table>… <TableBody>{rows.map((r, i) => <RevealRow key={r.id} index={i} active={justRecorded}>…cells…</RevealRow>)}</TableBody></Table>
 *   </WaterfallReveal>
 *
 * `RevealRow` stands in for `TableRow` (same border and hover). `CountUp` counts a figure up from zero.
 * Transform and opacity only; with reduced motion, or when `active` is false, everything renders in
 * its end state.
 */
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { formatCentsCompact } from "@/lib/money";
import { duration, ease, spring } from "@/lib/motion";

/** Matches TableRow. Hover is instant: sweeping the cursor down a table should not leave a trail. */
const ROW = "border-b hover:bg-muted/60";

export function WaterfallReveal({ active, children }: { active: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (!active || reduce) return <>{children}</>;
  return (
    <motion.div initial={{ opacity: 0.6 }} animate={{ opacity: 1 }} transition={{ duration: duration.fade, ease: ease.out }} className="relative">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 origin-left rounded-sm bg-signal"
        initial={{ scaleX: 0, opacity: 1 }}
        animate={{ scaleX: 1, opacity: 0 }}
        transition={{ scaleX: { duration: 0.6, ease: ease.trace }, opacity: { delay: 0.9, duration: duration.fade } }}
      />
      {children}
    </motion.div>
  );
}

export function RevealRow({ index, active, children }: { index: number; active: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (!active || reduce) return <tr data-slot="table-row" className={ROW}>{children}</tr>;
  return (
    <motion.tr data-slot="table-row" className={ROW} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.ui, delay: 0.3 + Math.min(index, 8) * 0.06 }}>
      {children}
    </motion.tr>
  );
}

export function CountUp({ cents, active }: { cents: number; active: boolean }) {
  const reduce = useReducedMotion();
  const animating = active && !reduce;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!animating) return;
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(cents * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cents, animating]);
  return <span className="num">{formatCentsCompact(animating ? shown : cents)}</span>;
}
