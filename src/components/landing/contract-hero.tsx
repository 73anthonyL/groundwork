"use client";

import { motion, useReducedMotion } from "motion/react";
import { duration, ease, spring } from "@/lib/motion";

/**
 * The product in one picture: a page of a real demo subcontract (Summit Drywall, Article 5 and 6),
 * the three phrases Groundwork reads out of it, the rules they become, and what those rules do to
 * the next owner payment. One sequence on load: each phrase is marked, its rule appears, then the
 * payment splits. With reduced motion the finished state is shown at once.
 *
 * The contract's words are set in the serif; everything Groundwork says is in the sans.
 */

const T = { mark: 1.1, gap: 1.05, rule: 0.45, split: 4.5 };
/**
 * Reduced motion: the same starting markup as everyone else (the server cannot know the setting, so
 * the first render must not depend on it), then straight to the finished state with no travel.
 */
const INSTANT = { duration: 0, delay: 0 };

function Mark({ n, tone = "read", children, play }: { n: number; tone?: "read" | "flag"; children: React.ReactNode; play: boolean }) {
  const color = tone === "flag" ? "var(--hold-soft)" : "var(--link-soft)";
  return (
    <motion.mark
      className="rounded-[3px] bg-no-repeat text-inherit [box-decoration-break:clone]"
      style={{ backgroundImage: `linear-gradient(${color}, ${color})`, backgroundColor: "transparent", padding: "1px 0" }}
      initial={{ backgroundSize: "0% 100%" }}
      animate={{ backgroundSize: "100% 100%" }}
      transition={play ? { duration: duration.mark, ease: ease.trace, delay: T.mark + (n - 1) * T.gap } : INSTANT}
    >
      {children}
      <sup className={`ml-0.5 font-sans text-[10px] font-semibold not-italic ${tone === "flag" ? "text-hold" : "text-link"}`}>{n}</sup>
    </motion.mark>
  );
}

function Rule({ n, label, value, note, tone = "read", play }: { n: number; label: string; value: string; note: string; tone?: "read" | "flag"; play: boolean }) {
  return (
    <motion.li
      className="grid grid-cols-[1.25rem_1fr] gap-x-3 py-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={play ? { ...spring.ui, delay: T.mark + (n - 1) * T.gap + T.rule } : INSTANT}
    >
      <span className={`num pt-0.5 text-xs font-semibold ${tone === "flag" ? "text-hold" : "text-link"}`}>{n}</span>
      <div>
        <div className="text-[13px] text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-[17px] font-semibold leading-snug">{value}</div>
        <div className="mt-1 text-[13px] leading-snug text-muted-foreground">{note}</div>
      </div>
    </motion.li>
  );
}

export function ContractHero() {
  const reduce = useReducedMotion();
  const play = !reduce;
  const parts = [
    { label: "Summit Drywall, due in 7 days", cents: "$22,500", width: 90, color: "var(--flow-moving)" },
    { label: "Retainage held", cents: "$2,500", width: 10, color: "var(--flow-held)" },
  ];
  return (
    <div className="grid overflow-hidden rounded-2xl bg-card shadow-float lg:grid-cols-[1.15fr_1fr]">
      {/* The contract page. */}
      <figure className="border-b bg-paper px-6 py-7 text-paper-ink sm:px-10 sm:py-9 lg:border-b-0 lg:border-r" style={{ colorScheme: "light" }}>
        <figcaption className="flex items-baseline justify-between font-sans text-xs text-paper-muted">
          <span>Subcontract, Summit Drywall</span>
          <span className="num">page 3 of 7</span>
        </figcaption>
        <div className="type-contract mt-5 space-y-4 text-[15px] leading-[1.62] sm:text-[16px]">
          <p className="font-semibold tracking-wide">ARTICLE 5. PROGRESS PAYMENTS</p>
          <p>
            5.1 Subject to the other provisions of this Subcontract, Contractor shall pay Subcontractor,{" "}
            <Mark n={1} play={play}>
              within seven (7) days after Contractor receives payment from Owner
            </Mark>{" "}
            on account of the Subcontract Work covered by Subcontractor&rsquo;s application, the amount approved by Owner and Contractor for that Subcontract Work, less retention withheld under Article 6.
          </p>
          <p>
            5.2 Subcontractor acknowledges that{" "}
            <Mark n={2} tone="flag" play={play}>
              Contractor&rsquo;s receipt of payment from Owner for the Subcontract Work is a condition precedent to Contractor&rsquo;s obligation to make any progress payment
            </Mark>{" "}
            or final payment to Subcontractor.
          </p>
          <p className="font-semibold tracking-wide">ARTICLE 6. RETENTION</p>
          <p>
            6.1 Contractor shall withhold from each progress payment{" "}
            <Mark n={3} play={play}>
              retention equal to ten percent (10%) of the amount otherwise due
            </Mark>{" "}
            to Subcontractor.
          </p>
        </div>
      </figure>

      {/* What Groundwork makes of it. */}
      <div className="flex flex-col px-6 py-7 sm:px-8 sm:py-9">
        <div className="text-xs text-muted-foreground">Payment rules, approved once by the controller</div>
        <ol className="mt-2 divide-y">
          <Rule n={1} play={play} label="When" value="Pay within 7 days of the owner's payment" note="Quoted from section 5.1 and found word for word in the PDF." />
          <Rule n={2} play={play} tone="flag" label="Pay-if-paid" value="Void in California. Still 7 days." note="Flagged for the controller. Applied by code, citing Clarke v. Safeco and Bus. & Prof. Code §7108.5, never decided by the model." />
          <Rule n={3} play={play} label="Retainage" value="Hold back 10% of each payment" note="Quoted from section 6.1. Released when the contract's condition is certified." />
        </ol>

        <motion.div className="mt-auto border-t pt-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={play ? { duration: duration.fade, delay: T.split } : INSTANT}>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-muted-foreground">Then the owner pays for Summit&rsquo;s work</span>
            <span className="num font-semibold">$25,000</span>
          </div>
          <motion.div
            className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full"
            initial={{ clipPath: "inset(0 100% 0 0)" }}
            animate={{ clipPath: "inset(0 0% 0 0)" }}
            transition={play ? { duration: duration.draw, ease: ease.trace, delay: T.split + 0.25 } : INSTANT}
          >
            {parts.map((p) => (
              <span key={p.label} className="h-full" style={{ background: p.color, width: `${p.width}%` }} />
            ))}
          </motion.div>
          <dl className="num mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1 text-[13px]">
            {parts.map((p) => (
              <div key={p.label} className="flex items-baseline gap-2">
                <span aria-hidden className="h-2 w-2 translate-y-[-1px] rounded-full" style={{ background: p.color }} />
                <dt className="font-sans text-muted-foreground">{p.label}</dt>
                <dd className="font-semibold">{p.cents}</dd>
              </div>
            ))}
          </dl>
        </motion.div>
      </div>
    </div>
  );
}
