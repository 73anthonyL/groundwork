"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { duration } from "@/lib/motion";

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
type Format = "usd" | "int" | "pct1";
const text = (n: number, format: Format) => (format === "usd" ? usd0.format(Math.round(n) / 100) : format === "pct1" ? `${n.toFixed(1)}%` : Math.round(n).toLocaleString("en-US"));

/**
 * A figure that counts from its previous value to its new one. Tabular digits, so nothing jitters.
 * React renders the final value; the frames in between are written straight to the element, so a
 * page with several figures does not re-render sixty times a second while they roll.
 */
export function RollingNumber({ value, format = "usd", className = "", seconds = duration.count }: { value: number; format?: Format; className?: string; seconds?: number }) {
  const reduce = useReducedMotion();
  const el = useRef<HTMLSpanElement>(null);
  const from = useRef(value);
  useEffect(() => {
    const a = from.current;
    if (reduce || a === value) {
      from.current = value;
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - start) / (seconds * 1000)));
      const v = a + (value - a) * (1 - Math.pow(1 - k, 3));
      from.current = v;
      if (el.current) el.current.textContent = text(v, format);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce, seconds, format]);
  return (
    <span ref={el} className={`num ${className}`} suppressHydrationWarning>
      {text(value, format)}
    </span>
  );
}

export const formatUsd0 = (cents: number) => usd0.format(Math.round(cents) / 100);
