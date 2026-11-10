"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { ContractSummary, SeriesPoint, TimelineEntry } from "@/server/read/project";
import type { EvalRun } from "@/server/read/eval";
import { duration, ease, list, spring } from "@/lib/motion";
import { RollingNumber, formatUsd0 } from "./rolling-number";

// ─── Where every dollar is, over time ───────────────────────────────────────

const BANDS = [
  { key: "sub_paid", label: "Paid to subs", color: "var(--flow-paid)" },
  { key: "sub_payable", label: "Owed, on its way", color: "var(--flow-moving)" },
  { key: "retainage_held", label: "Retainage held", color: "var(--flow-held)" },
  { key: "backcharge_recovered", label: "Backcharges kept", color: "var(--flow-setoff)" },
] as const;

/**
 * Stacked step chart of the ledger: after each posting, where the owner's money sits. The x axis is
 * the sequence of postings (not wall time), so a burst of activity does not collapse into one pixel.
 */
export function BalanceChart({ series, height = 220 }: { series: SeriesPoint[]; height?: number }) {
  const [at, setAt] = useState<number | null>(null);
  if (series.length < 2) return <p className="text-sm text-muted-foreground">The ledger needs at least two postings to draw.</p>;
  const W = 720;
  const pad = { l: 8, r: 8, t: 10, b: 22 };
  const totals = series.map((p) => BANDS.reduce((s, b) => s + Math.max(0, p.balances[b.key] ?? 0), 0));
  const max = Math.max(...totals, 1);
  // Each posting owns one equal slot: its balances hold from its left edge to the next posting's.
  const slot = (W - pad.l - pad.r) / series.length;
  const x = (i: number) => pad.l + i * slot;
  const y = (v: number) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const stackAt = (i: number, upto: number) => BANDS.slice(0, upto).reduce((s, b) => s + Math.max(0, series[i].balances[b.key] ?? 0), 0);
  // Step paths: a balance holds until the next posting changes it.
  const area = (band: number) => {
    const top: string[] = [];
    const bottom: string[] = [];
    series.forEach((_, i) => {
      const nx = x(i + 1);
      top.push(`${i === 0 ? "M" : "L"}${x(i)},${y(stackAt(i, band + 1))} L${nx},${y(stackAt(i, band + 1))}`);
      bottom.unshift(`L${nx},${y(stackAt(i, band))} L${x(i)},${y(stackAt(i, band))}`);
    });
    return `${top.join(" ")} ${bottom.join(" ")} Z`;
  };
  const shown = at ?? series.length - 1;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label="Where the owner's money sits after each ledger posting" onMouseLeave={() => setAt(null)}>
        <defs>
          <clipPath id="balance-wipe">
            <motion.rect x="0" y="0" height={height} initial={{ width: 0 }} animate={{ width: W }} transition={{ duration: duration.draw, ease: ease.trace }} />
          </clipPath>
        </defs>
        <g clipPath="url(#balance-wipe)">
          {BANDS.map((b, i) => (
            <path key={b.key} d={area(i)} fill={b.color} opacity={0.78} />
          ))}
        </g>
        <rect x={x(shown)} y={pad.t} width={slot} height={height - pad.t - pad.b} fill="var(--foreground)" opacity={at === null ? 0 : 0.08} />
        {series.map((_, i) => (
          <rect key={i} x={x(i)} y={0} width={slot} height={height} fill="transparent" onMouseEnter={() => setAt(i)} />
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={height - pad.b} y2={height - pad.b} stroke="var(--border)" />
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-xs">
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {BANDS.filter((b) => series.some((p) => (p.balances[b.key] ?? 0) > 0)).map((b) => (
            <li key={b.key} className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: b.color }} />
              <span className="text-muted-foreground">{b.label}</span>
              <span className="num font-medium">{formatUsd0(series[shown].balances[b.key] ?? 0)}</span>
            </li>
          ))}
        </ul>
        <span className="text-muted-foreground">{at === null ? "now" : series[shown].memo}</span>
      </figcaption>
    </figure>
  );
}

// ─── One bar per contract: where its sum stands ─────────────────────────────

/** Paid, on its way, held, billed-but-unfunded and not yet billed, as shares of each contract sum. */
export function ContractBars({ contracts }: { contracts: ContractSummary[] }) {
  const rows = contracts.filter((c) => c.tier === 1);
  const lower = (id: string) => contracts.filter((c) => c.parentContractId === id);
  const seg = (c: ContractSummary) => [
    { label: "Paid", cents: c.paidCents, color: "var(--flow-paid)" },
    { label: "On its way", cents: c.inMotionCents, color: "var(--flow-moving)" },
    { label: "Retainage held", cents: c.retainageHeldCents, color: "var(--flow-held)" },
    { label: "Backcharged", cents: c.backchargedCents, color: "var(--flow-setoff)" },
    { label: "Billed, awaiting owner", cents: c.awaitingOwnerCents, color: "var(--flow-idle)" },
  ];
  return (
    <motion.ul variants={list.parent} initial="hidden" animate="show" className="space-y-4">
      {rows.map((c) => (
        <motion.li key={c.id} variants={list.row}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium">
              {c.payee} <span className="font-normal text-muted-foreground">· {c.trade}</span>
            </span>
            <span className="num text-muted-foreground">
              {c.percentBilled}% billed of <span className="text-foreground">{formatUsd0(c.contractSumCents)}</span>
            </span>
          </div>
          <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={seg(c).filter((s) => s.cents > 0).map((s) => `${s.label} ${formatUsd0(s.cents)}`).join(", ")}>
            {seg(c).map((s) => (
              <motion.span key={s.label} title={`${s.label} · ${formatUsd0(s.cents)}`} style={{ background: s.color }} initial={{ width: 0 }} animate={{ width: `${(s.cents / c.contractSumCents) * 100}%` }} transition={spring.ui} />
            ))}
          </div>
          {lower(c.id).map((l) => (
            <div key={l.id} className="num mt-1 flex items-center gap-2 pl-3 text-xs text-muted-foreground">
              <span aria-hidden>↳</span>
              <span className="font-sans">{l.payee}</span>
              <span className="leader" />
              {formatUsd0(l.paidCents)} paid · {formatUsd0(l.inMotionCents)} on its way
            </div>
          ))}
        </motion.li>
      ))}
    </motion.ul>
  );
}

// ─── What happened, in lanes ────────────────────────────────────────────────

const LANES: { id: TimelineEntry["lane"]; label: string; color: string }[] = [
  { id: "contract", label: "Contract", color: "var(--foreground)" },
  { id: "billing", label: "Billing", color: "var(--flow-idle)" },
  { id: "money", label: "Money", color: "var(--flow-moving)" },
  { id: "waiver", label: "Waivers", color: "var(--flow-paid)" },
  { id: "adjustment", label: "Adjustments", color: "var(--flow-setoff)" },
];

/** The append-only event log as dots on five lanes, in order. Hover a dot to read the event. */
export function EventTimeline({ entries }: { entries: TimelineEntry[] }) {
  const [at, setAt] = useState<number | null>(null);
  if (!entries.length) return <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>;
  const W = 720;
  const rowH = 26;
  const left = 96;
  const x = (i: number) => left + 8 + (i * (W - left - 20)) / Math.max(1, entries.length - 1);
  const sel = at === null ? entries[entries.length - 1] : entries[at];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${LANES.length * rowH + 8}`} className="h-auto w-full" role="img" aria-label={`${entries.length} recorded events across five lanes`} onMouseLeave={() => setAt(null)}>
        {LANES.map((l, li) => (
          <g key={l.id}>
            <text x={0} y={li * rowH + 17} className="type-label fill-muted-foreground">
              {l.label}
            </text>
            <line x1={left} x2={W - 8} y1={li * rowH + 13} y2={li * rowH + 13} stroke="var(--border)" />
          </g>
        ))}
        {entries.map((e, i) => {
          const li = LANES.findIndex((l) => l.id === e.lane);
          const big = e.type === "owner_payment.recorded" || e.type === "payment.paid";
          return (
            <motion.circle
              key={e.id}
              cx={x(i)}
              cy={li * rowH + 13}
              fill={LANES[li].color}
              initial={{ r: 0 }}
              animate={{ r: at === i ? 6 : big ? 4.5 : 3 }}
              transition={{ ...spring.pop, delay: at === null ? Math.min(1.2, i * 0.012) : 0 }}
              onMouseEnter={() => setAt(i)}
            />
          );
        })}
      </svg>
      <figcaption className="mt-2 flex min-h-9 flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs" aria-live="polite">
        <span className="font-medium text-foreground">{sel.title}</span>
        {sel.party && <span className="text-muted-foreground">{sel.party}</span>}
        {sel.amountCents !== null && <span className="num">{formatUsd0(sel.amountCents)}</span>}
        {sel.detail && <span className="truncate text-muted-foreground">{sel.detail}</span>}
        <span className="text-muted-foreground" suppressHydrationWarning>
          {sel.actor} · {new Date(sel.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </span>
      </figcaption>
    </figure>
  );
}

// ─── What each review layer buys ────────────────────────────────────────────

/** The eval ablation: wrong values that would reach the engine unflagged, layer by layer. */
export function AblationChart({ run }: { run: EvalRun }) {
  const max = Math.max(...run.layers.map((l) => l.silentErrors), 1);
  return (
    <figure>
      <motion.ol variants={list.parent} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }} className="space-y-3">
        {run.layers.map((l, i) => (
          <motion.li key={l.id} variants={list.row} className="grid grid-cols-[minmax(0,13rem)_1fr_auto] items-center gap-3 text-sm">
            <span className={i === run.layers.length - 1 ? "font-medium" : "text-muted-foreground"}>{l.label}</span>
            <span className="h-6 overflow-hidden rounded-sm bg-muted">
              <motion.span className="block h-full rounded-sm" style={{ background: i === run.layers.length - 1 ? "var(--flow-paid)" : "var(--destructive)", opacity: i === run.layers.length - 1 ? 1 : 0.75 }} initial={{ width: 0 }} whileInView={{ width: `${Math.max(1.5, (l.silentErrors / max) * 100)}%` }} viewport={{ once: true }} transition={{ ...spring.ui, delay: 0.15 + i * 0.12 }} />
            </span>
            <span className="num w-28 text-right">
              <span className="font-semibold">{l.silentErrors}</span> <span className="text-muted-foreground">silent · {l.burden === null ? "0" : Math.round(l.burden * 100)}% reviewed</span>
            </span>
          </motion.li>
        ))}
      </motion.ol>
      <figcaption className="mt-3 text-xs text-muted-foreground">
        {run.metrics.contracts} contracts, {run.metrics.fields} fields. A silent error is a wrong value no layer asked a person to look at. The last column is the share of fields a person must review.
      </figcaption>
    </figure>
  );
}

/** Headline eval figures as three counting numbers. */
export function EvalHeadline({ run }: { run: EvalRun }) {
  const prod = run.layers[run.layers.length - 1];
  const items = [
    { label: "Values extracted correctly", node: <RollingNumber value={run.metrics.accuracy * 100} format="pct1" /> },
    { label: "Quotes found verbatim in the PDF", node: <RollingNumber value={(run.metrics.quoteVerifiedRate ?? 0) * 100} format="pct1" /> },
    { label: `Wrong values reaching the engine unflagged, of ${run.metrics.fields}`, node: <RollingNumber value={prod.silentErrors} format="int" /> },
  ];
  return (
    <dl className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="bg-card p-4">
          <dd className="type-numeral text-4xl">{it.node}</dd>
          <dt className="mt-2 text-xs text-muted-foreground">{it.label}</dt>
        </div>
      ))}
    </dl>
  );
}

// ─── The problem in one picture ─────────────────────────────────────────────

/**
 * Owner pays the contractor in a median of 17 days; the sub waits a median of 50 (Built, Aug 2026).
 * Bars grow in sequence; the third shows the statutory 7 days from the owner's payment.
 */
export function DaysGap({ onStage = false }: { onStage?: boolean }) {
  const rows = [
    { label: "Owner pays the general contractor", days: 17, color: onStage ? "var(--stage-muted)" : "var(--flow-idle)", note: "median" },
    { label: "The subcontractor who did the work is paid", days: 50, color: "var(--money)", note: "median" },
    { label: "With Groundwork: the day the owner's money lands, plus the clock the law allows", days: 24, color: "var(--settled)", note: "17 + 7 by statute" },
  ];
  return (
    <ol className="space-y-5">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className={`text-sm ${onStage ? "text-stage-foreground/80" : "text-muted-foreground"}`}>{r.label}</div>
          <div className="mt-1.5 flex items-center gap-3">
            <motion.span className="h-3 rounded-full" style={{ background: r.color }} initial={{ width: 0 }} whileInView={{ width: `${(r.days / 50) * 72}%` }} viewport={{ once: true }} transition={{ duration: 1.1, ease: ease.trace, delay: 0.2 + i * 0.5 }} />
            <motion.span className="type-numeral whitespace-nowrap text-2xl" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: duration.fade, delay: 1.1 + i * 0.5 }}>
              {r.days} <span className={`font-sans text-xs tracking-normal ${onStage ? "text-stage-muted" : "text-muted-foreground"}`}>days · {r.note}</span>
            </motion.span>
          </div>
        </li>
      ))}
    </ol>
  );
}
