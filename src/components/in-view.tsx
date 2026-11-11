"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll-triggered motion without a library.
 *
 * <InView> marks itself `data-inview="true"` the first time it scrolls into view. The stylesheet
 * does the rest: any descendant with class `iv` rises in, `iv-grow` wipes in from the left,
 * `iv-pop` scales in, each delayed by its `--i` (set with style={{ "--i": n }}). Until then those
 * descendants are hidden. Reduced motion shows them at once; without JavaScript a <noscript> rule
 * in the root layout keeps them visible.
 */
export function InView({ className, children, threshold = 0.2, ...rest }: React.ComponentProps<"div"> & { threshold?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.dataset.inview = "true";
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return (
    <div ref={ref} data-inview="false" className={className} {...rest}>
      {children}
    </div>
  );
}

/**
 * A figure that counts up from zero the first time it is seen. The server renders the final value,
 * so it is correct without JavaScript; frames are written straight to the element.
 */
export function CountUp({ value, decimals = 0, prefix = "", suffix = "", seconds = 1.2, className }: { value: number; decimals?: number; prefix?: string; suffix?: string; seconds?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const format = (n: number) => `${prefix}${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (t: number) => {
          const k = Math.min(1, (t - start) / (seconds * 1000));
          el.textContent = format(value * (1 - Math.pow(1 - k, 3)));
          if (k < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, seconds]);
  return (
    <span ref={ref} className={className} suppressHydrationWarning>
      {format(value)}
    </span>
  );
}
