"use client";

import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { ContractSummary, SeriesPoint, TimelineEntry } from "@/server/read/project";
import type { EvalRun } from "@/server/read/eval";
import { duration, ease, list, spring } from "@/lib/motion";
import { RollingNumber, formatUsd0 } from "./rolling-number";

// ─── Where every dollar is, over time ───────────────────────────────────────

const BANDS = [
  { key: "sub_paid", label: "Paid to subcontractors", color: "var(--flow-paid)" },
  { key: "sub_payable", label: "Owed, on its way", color: "var(--flow-moving)" },
  { key: "retainage_held", label: "Retainage held", color: "var(--flow-held)" },
  { key: "backcharge_recovered", label: "Backcharges kept", color: "var(--flow-setoff)" },
] as const;

/** A round figure for an axis label: $250k, $1.2M. */
const axisUsd = (cents: number) => {
  const d = cents / 100;
  if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(d % 1_000_000 === 0 ? 0 : 1)}M`;
  if (d >= 1_000) return `$${Math.round(d / 1_000)}k`;
  return `$${Math.round(d)}`;
};
/** The step between gridlines: 1, 2, 2.5 or 5 times a power of ten, giving three or four lines. */
function niceStep(max: number) {
  const raw = max / 3.5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const pick = [1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10;
  return pick * pow;
}

/**
 * Where the owner's money is after each recorded movement, as stacked bands that swell and settle.
 * The x axis is the sequence of movements (not wall time), so a burst of activity does not collapse
 * into one pixel. Dashed lines mark each owner payment; the gridlines give the scale. Point at the
 * chart, or tab through it, to read the figures at that moment in the legend below.
 */
export function BalanceChart({ series, height = 260 }: { series: SeriesPoint[]; height?: number }) {
  const [at, setAt] = useState<number | null>(null);
  const clip = useId();
  if (series.length < 2) return <p className="text-sm text-muted-foreground">This chart is drawn once money has moved at least twice.</p>;
  const W = 720;
  const pad = { l: 40, r: 10, t: 24, b: 8 };
  const n = series.length;
  const bands = BANDS.filter((b) => series.some((p) => (p.balances[b.key] ?? 0) > 0));
  const stackAt = (i: number, upto: number) => bands.slice(0, upto).reduce((sum, b) => sum + Math.max(0, series[i].balances[b.key] ?? 0), 0);
  const max = Math.max(...series.map((_, i) => stackAt(i, bands.length)), 1);
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (n - 1);
  const y = (v: number) => pad.t + (1 - v / top) * (height - pad.t - pad.b);
  // Each change eases in as an S-curve between two movements: level, rise, level. No sharp corners.
  const curve = (level: number, reverse = false) => {
    const idx = series.map((_, i) => i);
    if (reverse) idx.reverse();
    return idx
      .map((i, k) => {
        const px = x(i);
        const py = y(stackAt(i, level));
        if (k === 0) return `${px},${py}`;
        const prev = idx[k - 1];
        const mid = (x(prev) + px) / 2;
        return `C${mid},${y(stackAt(prev, level))} ${mid},${py} ${px},${py}`;
      })
      .join(" ");
  };
  const area = (band: number) => `M${curve(band + 1)} L${curve(band, true)} Z`;
  // An owner payment is a movement where the money received from the owner goes up.
  const ownerPayments = series.map((p, i) => ((p.balances.owner_receipts ?? 0) > (i === 0 ? 0 : (series[i - 1].balances.owner_receipts ?? 0)) ? i : -1)).filter((i) => i >= 0);
  const shown = at ?? n - 1;
  const slot = (W - pad.l - pad.r) / (n - 1);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full overflow-visible" role="img" aria-label="Where the owner's money is after each recorded movement" onMouseLeave={() => setAt(null)}>
        <defs>
          <clipPath id={clip}>
            <motion.rect x="0" y="0" height={height} initial={{ width: 0 }} animate={{ width: W }} transition={{ duration: duration.draw, ease: ease.trace }} />
          </clipPath>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t === 0 ? undefined : "2 4"} />
            <text x={pad.l - 8} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 9 }}>
              {axisUsd(t)}
            </text>
          </g>
        ))}
        <g clipPath={`url(#${clip})`}>
          {bands.map((b, i) => (
            <path key={b.key} d={area(i)} fill={b.color} stroke="var(--card)" strokeWidth={1.5} strokeLinejoin="round" />
          ))}
        </g>
        {ownerPayments.map((i, k) => (
          <g key={i}>
            <line x1={x(i)} x2={x(i)} y1={pad.t - 6} y2={height - pad.b} stroke="var(--foreground)" strokeOpacity={0.35} strokeDasharray="3 3" />
            <text x={x(i)} y={pad.t - 11} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-foreground" style={{ fontSize: 9, fontWeight: 500 }}>
              Owner payment {k + 1}
            </text>
          </g>
        ))}
        {/* The moment being read: a line, and a ringed dot on top of each band. */}
        <motion.g initial={false} animate={{ opacity: at === null ? 0 : 1 }} transition={{ duration: duration.hover }}>
          <motion.line y1={pad.t} y2={height - pad.b} stroke="var(--foreground)" strokeWidth={1} initial={false} animate={{ x1: x(shown), x2: x(shown) }} transition={spring.snappy} />
          {bands.map((b, i) => (
            <motion.circle key={b.key} r={3.5} fill="var(--card)" stroke={b.color} strokeWidth={2} initial={false} animate={{ cx: x(shown), cy: y(stackAt(shown, i + 1)) }} transition={spring.snappy} />
          ))}
        </motion.g>
        {series.map((p, i) => (
          <rect key={i} x={x(i) - slot / 2} y={0} width={slot} height={height} fill="transparent" tabIndex={0} role="img" aria-label={`${p.memo}: ${bands.map((b) => `${b.label} ${formatUsd0(p.balances[b.key] ?? 0)}`).join(", ")}`} onMouseEnter={() => setAt(i)} onFocus={() => setAt(i)} onBlur={() => setAt(null)} style={{ outline: "none" }} />
        ))}
      </svg>
      <figcaption className="mt-3 flex flex-wrap items-start justify-between gap-x-8 gap-y-2">
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {bands.map((b) => (
            <li key={b.key}>
              <span className="type-meta flex items-center gap-1.5 text-muted-foreground">
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: b.color }} />
                {b.label}
              </span>
              <span className="num text-[15px] leading-6 font-semibold">{formatUsd0(series[shown].balances[b.key] ?? 0)}</span>
            </li>
          ))}
        </ul>
        <span className="type-meta max-w-[40ch] text-right text-muted-foreground" aria-live="polite">
          {at === null ? "Now. Point at the chart to go back in time." : series[shown].memo}
        </span>
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
              {c.payee} <span className="type-meta ml-1 font-normal text-muted-foreground">{c.trade}</span>
            </span>
            <span className="type-mono text-[13px] text-muted-foreground">
              {c.percentBilled}% billed of <span className="text-foreground">{formatUsd0(c.contractSumCents)}</span>
            </span>
          </div>
          <div className="mt-1.5 flex h-1.5 gap-px overflow-hidden rounded-[2px] bg-muted" role="img" aria-label={seg(c).filter((s) => s.cents > 0).map((s) => `${s.label} ${formatUsd0(s.cents)}`).join(", ")}>
            {seg(c).map((s) => (
              <span key={s.label} title={`${s.label}, ${formatUsd0(s.cents)}`} style={{ background: s.color, width: `${c.contractSumCents > 0 ? (s.cents / c.contractSumCents) * 100 : 0}%` }} />
            ))}
          </div>
          {lower(c.id).map((l) => (
            <div key={l.id} className="type-mono mt-1 flex items-center gap-2 pl-3 text-xs text-muted-foreground">
              <span aria-hidden>↳</span>
              <span className="font-sans">{l.payee}</span>
              <span className="leader" />
              {formatUsd0(l.paidCents)} paid, {formatUsd0(l.inMotionCents)} on its way
            </div>
          ))}
        </motion.li>
      ))}
    </motion.ul>
  );
}

// ─── What happened, in lanes ────────────────────────────────────────────────

const LANES: { id: TimelineEntry["lane"]; label: string; color: string }[] = [
  { id: "contract", label: "Subcontract", color: "var(--foreground)" },
  { id: "billing", label: "Pay apps", color: "var(--flow-held)" },
  { id: "money", label: "Payments", color: "var(--flow-moving)" },
  { id: "waiver", label: "Waivers", color: "var(--flow-paid)" },
  { id: "adjustment", label: "Adjustments", color: "var(--flow-setoff)" },
];

/**
 * Everything recorded on the project, oldest on the left, on one rounded track per kind of event.
 * Dashed lines mark each owner payment, so the order reads at a glance: subcontracts, pay apps,
 * the owner pays, waivers, payments. Point at a dot, or tab to it, to read that event in the card below.
 */
export function EventTimeline({ entries }: { entries: TimelineEntry[] }) {
  const [at, setAt] = useState<number | null>(null);
  if (!entries.length) return <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>;
  const n = entries.length;
  const pct = (i: number) => 1.5 + (n === 1 ? 48.5 : (i / (n - 1)) * 97);
  const shown = at ?? n - 1;
  const sel = entries[shown];
  const selLane = LANES.find((l) => l.id === sel.lane) ?? LANES[0];
  const ownerPayments = entries.map((e, i) => (e.type === "owner_payment.recorded" ? i : -1)).filter((i) => i >= 0);
  const ROW = "h-10";
  return (
    <figure>
      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[9rem_minmax(0,1fr)]" onMouseLeave={() => setAt(null)}>
        <div>
          <div className="h-7" />
          {LANES.map((l) => (
            <div key={l.id} className={`${ROW} flex items-center justify-between gap-2`}>
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: l.color }} />
                <span className="truncate">{l.label}</span>
              </span>
              <span className="num type-meta text-muted-foreground">{entries.filter((e) => e.lane === l.id).length}</span>
            </div>
          ))}
        </div>
        <div className="relative">
          {/* Owner payments: a label on top and a dashed line down through every track. */}
          <div className="relative h-7">
            {ownerPayments.map((i, k) => (
              <span key={i} className="type-caption absolute top-0 rounded-full bg-secondary px-2 py-0.5 font-medium whitespace-nowrap" style={pct(i) < 12 ? { left: `${pct(i)}%` } : pct(i) > 88 ? { right: `${100 - pct(i)}%` } : { left: `${pct(i)}%`, translate: "-50% 0" }}>
                Owner payment {k + 1}
              </span>
            ))}
          </div>
          {ownerPayments.map((i) => (
            <span key={i} aria-hidden className="absolute bottom-0 top-6 border-l border-dashed border-foreground/35" style={{ left: `${pct(i)}%` }} />
          ))}
          {LANES.map((l) => (
            <div key={l.id} className={`${ROW} relative`}>
              <span aria-hidden className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-muted" />
              {entries.map((e, i) => {
                if (e.lane !== l.id) return null;
                const big = e.type === "owner_payment.recorded" || e.type === "payment.paid";
                const on = shown === i;
                return (
                  <motion.button
                    key={e.id}
                    type="button"
                    aria-label={`${e.title}${e.party ? `, ${e.party}` : ""}${e.amountCents !== null ? `, ${formatUsd0(e.amountCents)}` : ""}`}
                    onMouseEnter={() => setAt(i)}
                    onFocus={() => setAt(i)}
                    initial={{ scale: 0, x: "-50%", y: "-50%" }}
                    animate={{ scale: on ? 1.5 : 1, x: "-50%", y: "-50%" }}
                    transition={{ ...spring.pop, delay: at === null && !on ? Math.min(1.2, i * 0.012) : 0 }}
                    className="absolute top-1/2 cursor-default rounded-full ring-2 ring-card"
                    style={{ left: `${pct(i)}%`, width: big ? 14 : 10, height: big ? 14 : 10, background: l.color, zIndex: on ? 2 : 1, boxShadow: on ? `0 0 0 2px var(--card), 0 0 0 4px ${l.color}` : undefined }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="mt-3 flex min-h-[4.25rem] items-start gap-3 rounded-lg border bg-card px-4 py-3" aria-live="polite">
        <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: selLane.color }} />
        <div key={sel.id} className="reveal min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-3 text-sm leading-5">
            <span className="font-medium">{sel.title}</span>
            {sel.party && <span className="text-muted-foreground">{sel.party}</span>}
            {sel.amountCents !== null && <span className="num font-medium">{formatUsd0(sel.amountCents)}</span>}
          </p>
          <p className="type-meta mt-0.5 text-muted-foreground" suppressHydrationWarning>
            {sel.detail ? `${sel.detail} ` : ""}
            {sel.actor}, {new Date(sel.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
        <span className="type-meta shrink-0 text-muted-foreground">
          {at === null ? "Latest" : `${shown + 1} of ${n}`}
        </span>
      </figcaption>
    </figure>
  );
}

// ─── What each review layer buys ────────────────────────────────────────────

/** The eval ablation as a small table: under each review policy, how many wrong values slip through and how much a person must read. */
export function AblationChart({ run }: { run: EvalRun }) {
  const max = Math.max(...run.layers.map((l) => l.silentErrors), 1);
  const last = run.layers.length - 1;
  const NAMES = ["Trust the model", "Add the model's own confidence", "Add checking each quote against the PDF", "Add state law and anomaly checks"];
  return (
    <figure>
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 text-sm sm:grid-cols-[minmax(0,17rem)_1fr_auto_auto]">
        <div className="pb-2 text-xs text-muted-foreground">Review policy</div>
        <div className="hidden pb-2 sm:block" />
        <div className="pb-2 text-right text-xs text-muted-foreground">Wrong terms unflagged</div>
        <div className="pb-2 text-right text-xs text-muted-foreground">Terms a person reviews</div>
        {run.layers.map((l, i) => (
          <div key={l.id} className="col-span-full grid grid-cols-subgrid items-center border-t py-3">
            <div className={i === last ? "font-medium" : ""}>
              {NAMES[i] ?? l.label}
              {i === last && <span className="ml-2 text-xs font-normal text-muted-foreground">what Groundwork runs</span>}
            </div>
            <div className="hidden h-1.5 overflow-hidden rounded-[2px] bg-muted sm:block">
              <motion.div className="h-full rounded-[2px]" style={{ background: i === last ? "var(--settled)" : "var(--foreground)", opacity: i === last ? 1 : 0.55 }} initial={{ width: 0 }} whileInView={{ width: `${Math.max(2, (l.silentErrors / max) * 100)}%` }} viewport={{ once: true }} transition={{ ...spring.ui, delay: 0.1 + i * 0.08 }} />
            </div>
            <div className="type-mono text-right font-medium">{l.silentErrors}</div>
            <div className="type-mono text-right text-muted-foreground">{l.burden === null ? "0" : Math.round(l.burden * 100)}%</div>
          </div>
        ))}
      </div>
      <figcaption className="mt-3 border-t pt-3 text-xs text-muted-foreground">
        {run.metrics.contracts} subcontracts, {run.metrics.fields} payment terms, run on Claude Opus 5.5. Each policy adds one check to the one above it.
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
    <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="bg-card p-4">
          <dd className="type-figure">{it.node}</dd>
          <dt className="type-meta mt-1 text-muted-foreground">{it.label}</dt>
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
  const reduce = useReducedMotion();
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
            <motion.span className="h-2 origin-left rounded-[2px]" style={{ background: r.color, width: `${(r.days / 50) * 72}%` }} initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: duration.count, ease: ease.trace, delay: 0.2 + i * 0.5 }} />
            <motion.span className="type-numeral whitespace-nowrap text-2xl" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: duration.fade, delay: reduce ? 0 : 1.1 + i * 0.5 }}>
              {r.days} <span className={`font-sans text-xs tracking-normal ${onStage ? "text-stage-muted" : "text-muted-foreground"}`}>days, {r.note}</span>
            </motion.span>
          </div>
        </li>
      ))}
    </ol>
  );
}
