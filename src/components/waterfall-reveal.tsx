"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { formatCentsCompact } from "@/lib/money";
import { duration, ease, spring } from "@/lib/motion";

/** Hover is instant on rows: sweeping the cursor down a table should not leave a trail. */
const ROW = "border-b border-border/70 last:border-0 hover:bg-muted/40";

/**
 * The one orchestrated moment: when an owner payment has just landed, the amount sweeps down the
 * board and the release rows arrive one after another. Transform/opacity only; reduced motion
 * renders the end state.
 */
export function WaterfallReveal({ active, children }: { active: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (!active || reduce) return <>{children}</>;
  return (
    <motion.div initial={{ opacity: 0.6 }} animate={{ opacity: 1 }} transition={{ duration: duration.fade, ease: ease.out }} className="relative">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 origin-left rounded bg-link"
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
  if (!active || reduce) return <tr className={ROW}>{children}</tr>;
  return (
    <motion.tr className={ROW} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.ui, delay: 0.3 + Math.min(index, 8) * 0.06 }}>
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
