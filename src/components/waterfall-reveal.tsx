"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { formatCentsCompact } from "@/lib/money";

/**
 * The one orchestrated moment: when an owner payment has just landed, the amount sweeps down the
 * board and the release rows arrive one after another. Transform/opacity only; reduced motion
 * renders the end state.
 */
export function WaterfallReveal({ active, children }: { active: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (!active || reduce) return <>{children}</>;
  return (
    <motion.div initial={{ opacity: 0.6, scale: 0.995 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: "easeOut" }} className="relative">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1 origin-left rounded bg-money"
        initial={{ scaleX: 0, opacity: 1 }}
        animate={{ scaleX: 1, opacity: 0 }}
        transition={{ scaleX: { duration: 0.6, ease: "easeInOut" }, opacity: { delay: 0.9, duration: 0.4 } }}
      />
      {children}
    </motion.div>
  );
}

export function RevealRow({ index, active, children }: { index: number; active: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (!active || reduce) return <tr className="border-b transition-colors last:border-0 hover:bg-muted/50">{children}</tr>;
  return (
    <motion.tr initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 + index * 0.22, duration: 0.4, ease: "easeOut" }}>
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
