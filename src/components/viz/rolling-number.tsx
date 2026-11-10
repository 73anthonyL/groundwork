"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { duration } from "@/lib/motion";

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** A figure that counts from its previous value to its new one. Tabular digits, so nothing jitters. */
export function RollingNumber({ value, format = "usd", className = "", seconds = duration.count }: { value: number; format?: "usd" | "int" | "pct1"; className?: string; seconds?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce) {
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - start) / (seconds * 1000)));
      const eased = 1 - Math.pow(1 - k, 3);
      const v = a + (value - a) * eased;
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce, seconds]);
  // With reduced motion the figure simply shows its value.
  const n = reduce ? value : shown;
  const text = format === "usd" ? usd0.format(Math.round(n) / 100) : format === "pct1" ? `${n.toFixed(1)}%` : Math.round(n).toLocaleString("en-US");
  return (
    <span className={`num ${className}`} suppressHydrationWarning>
      {text}
    </span>
  );
}

export const formatUsd0 = (cents: number) => usd0.format(Math.round(cents) / 100);
