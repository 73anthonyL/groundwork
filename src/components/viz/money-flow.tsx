"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Pause, Play, RotateCcw } from "lucide-react";
import type { FlowLink, FlowNode, ProjectFlow } from "@/server/read/project";
import { duration, ease, spring } from "@/lib/motion";
import { RollingNumber, formatUsd0 } from "./rolling-number";

/**
 * The project as moving money: owner → contractor → subcontractors → their lower tier, with retainage
 * and backcharges peeling off. Ribbon width is dollars. Steps through funding events in the order the
 * money arrived; "moving" ribbons carry particles until the payment lands.
 *
 * Pure presentation: give it the `flow` view from the read model (or /api/v1/projects/:id/flow).
 */

const W = 960;
const PAD_Y = 28;
const NODE_W = 10;
const GAP = 14;
const COLOR: Record<FlowLink["kind"], string> = { paid: "var(--flow-paid)", moving: "var(--flow-moving)", held: "var(--flow-held)", setoff: "var(--flow-setoff)", idle: "var(--flow-idle)" };
const KIND_LABEL: Record<FlowLink["kind"], string> = { paid: "Paid", moving: "On its way", held: "Retainage held", setoff: "Backcharge kept", idle: "Not yet allocated" };
/** Text sits on a stroke of the card color, so it stays readable over a ribbon. */
const HALO = { paintOrder: "stroke", stroke: "var(--card)", strokeWidth: 4, strokeLinejoin: "round" } as const;
const ORDER: FlowNode["kind"][] = ["owner", "gc", "sub", "lower", "retainage", "backcharge", "unallocated"];

type Laid = { node: FlowNode; x: number; y: number; h: number; value: number };
type Ribbon = { key: string; kind: FlowLink["kind"]; cents: number; source: string; target: string; d: string; mid: string; thickness: number };

function layout(flow: ProjectFlow, upTo: number, height: number) {
  const active = flow.events.slice(0, upTo + 1).flatMap((e) => e.links);
  // One ribbon per source/target/kind.
  const merged = new Map<string, { source: string; target: string; kind: FlowLink["kind"]; cents: number }>();
  for (const l of active) {
    const key = `${l.source}>${l.target}:${l.kind}`;
    const m = merged.get(key);
    if (m) m.cents += l.cents;
    else merged.set(key, { source: l.source, target: l.target, kind: l.kind, cents: l.cents });
  }
  const links = [...merged.entries()].map(([key, v]) => ({ key, ...v })).filter((l) => l.cents > 0);
  const used = new Set(links.flatMap((l) => [l.source, l.target]));
  const nodes = flow.nodes.filter((n) => used.has(n.id));
  const inflow = (id: string) => links.filter((l) => l.target === id).reduce((s, l) => s + l.cents, 0);
  const outflow = (id: string) => links.filter((l) => l.source === id).reduce((s, l) => s + l.cents, 0);
  const depths = [...new Set(nodes.map((n) => n.depth))].sort((a, b) => a - b);
  const colX = (d: number) => (depths.length <= 1 ? 0 : 150 + (depths.indexOf(d) * (W - 320)) / (depths.length - 1));
  const columns = depths.map((d) => nodes.filter((n) => n.depth === d).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)));
  const colTotal = (col: FlowNode[]) => col.reduce((s, n) => s + Math.max(inflow(n.id), outflow(n.id)), 0);
  const scale = Math.min(...columns.map((col) => (height - 2 * PAD_Y - GAP * (col.length - 1)) / Math.max(1, colTotal(col))));
  const laid = new Map<string, Laid>();
  for (const col of columns) {
    const hs = col.map((n) => Math.max(4, Math.max(inflow(n.id), outflow(n.id)) * scale));
    let y = (height - (hs.reduce((a, b) => a + b, 0) + GAP * (col.length - 1))) / 2;
    col.forEach((n, i) => {
      laid.set(n.id, { node: n, x: colX(n.depth), y, h: hs[i], value: Math.max(inflow(n.id), outflow(n.id)) });
      y += hs[i] + GAP;
    });
  }
  // Ribbons leave and enter their nodes stacked in the vertical order of the far end, so they do not cross.
  const outAt = new Map<string, number>();
  const inAt = new Map<string, number>();
  const sorted = [...links].sort((a, b) => laid.get(a.source)!.y - laid.get(b.source)!.y || laid.get(a.target)!.y - laid.get(b.target)!.y);
  const ribbons: Ribbon[] = sorted.map((l) => {
    const s = laid.get(l.source)!;
    const t = laid.get(l.target)!;
    const th = Math.max(1.5, l.cents * scale);
    const y0 = s.y + (outAt.get(l.source) ?? 0);
    const y1 = t.y + (inAt.get(l.target) ?? 0);
    outAt.set(l.source, (outAt.get(l.source) ?? 0) + th);
    inAt.set(l.target, (inAt.get(l.target) ?? 0) + th);
    const x0 = s.x + NODE_W;
    const x1 = t.x;
    const mx = (x0 + x1) / 2;
    return {
      key: l.key,
      kind: l.kind,
      cents: l.cents,
      source: l.source,
      target: l.target,
      thickness: th,
      d: `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1} L${x1},${y1 + th} C${mx},${y1 + th} ${mx},${y0 + th} ${x0},${y0 + th} Z`,
      mid: `M${x0},${y0 + th / 2} C${mx},${y0 + th / 2} ${mx},${y1 + th / 2} ${x1},${y1 + th / 2}`,
    };
  });
  // Label positions: centered on the node, then pushed apart so two small nodes never stack their text.
  const labelY = new Map<string, number>();
  for (const col of columns) {
    let floor = -Infinity;
    for (const n of col) {
      const l = laid.get(n.id)!;
      const y = Math.max(l.y + l.h / 2, floor + 32);
      labelY.set(n.id, y);
      floor = y;
    }
  }
  return { laid: [...laid.values()].map((l) => ({ ...l, labelY: labelY.get(l.node.id)! })), ribbons };
}

export function MoneyFlow({
  flow,
  height = 420,
  autoPlay = false,
  showControls = true,
  initialStep,
  playFrom = 0,
}: {
  flow: ProjectFlow;
  height?: number;
  autoPlay?: boolean;
  showControls?: boolean;
  initialStep?: number;
  /** With autoPlay: the step playback starts from (for example, the state just before a new payment). */
  playFrom?: number;
}) {
  const reduce = useReducedMotion();
  const last = flow.events.length - 1;
  // The server cannot know the viewer's motion setting, so the first render never depends on it;
  // autoplay starts after mount, and only when motion is allowed.
  const [step, setStep] = useState(initialStep ?? last);
  const [playing, setPlaying] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setMounted(true);
      if (autoPlay && !reduce) {
        setStep(Math.max(0, Math.min(playFrom, last)));
        setPlaying(true);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [autoPlay, reduce, playFrom, last]);
  const [hover, setHover] = useState<string | null>(null);
  const at = Math.min(Math.max(step, 0), Math.max(last, 0));

  useEffect(() => {
    if (!playing) return;
    if (at >= last) {
      const t = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(t);
    }
    const id = setTimeout(() => setStep((s) => Math.min(last, s + 1)), duration.step * 1000);
    return () => clearTimeout(id);
  }, [playing, at, last]);

  // Every party needs room for its two-line label, however many there are.
  const tallest = Math.max(1, ...[0, 1, 2, 3].map((d) => flow.nodes.filter((n) => n.depth === d).length));
  const h = Math.max(height, 2 * PAD_Y + tallest * 40);
  const { laid, ribbons } = useMemo(() => layout(flow, at, h), [flow, at, h]);
  if (!flow.events.length) {
    return <div className="rounded-md border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">No money has moved on this project yet. Record an owner payment to see it flow.</div>;
  }
  const current = flow.events[at];
  const totals = (["paid", "moving", "held", "setoff", "idle"] as const)
    // The contractor's ribbons only: money a sub passes down is already counted in what the sub received.
    .map((k) => ({ k, cents: ribbons.filter((r) => r.kind === k && r.source === "gc").reduce((s, r) => s + r.cents, 0) }))
    .filter((t) => t.cents > 0);
  const dim = (r: Ribbon) => hover !== null && r.source !== hover && r.target !== hover;

  return (
    <figure className="min-w-0">
      {/* On a phone the diagram keeps a readable width and scrolls sideways. */}
      <div className="-mx-1 overflow-x-auto px-1">
      <svg viewBox={`0 0 ${W} ${h}`} className="h-auto w-full min-w-[640px] overflow-visible" role="img" aria-label={`Money flow through ${at + 1} of ${flow.events.length} funding events`}>
        <AnimatePresence>
          {ribbons.map((r) => (
            <motion.path
              key={r.key}
              d={r.d}
              fill={COLOR[r.kind]}
              initial={{ opacity: 0 }}
              animate={{ opacity: dim(r) ? 0.08 : r.kind === "idle" ? 0.25 : 0.42, d: r.d }}
              exit={{ opacity: 0 }}
              transition={{ opacity: { duration: duration.fade, ease: ease.out }, d: spring.ui }}
            />
          ))}
        </AnimatePresence>
        {/* Particles ride the ribbons that are still on their way. */}
        {mounted &&
          !reduce &&
          ribbons
            .filter((r) => r.kind === "moving" && !dim(r))
            .flatMap((r) =>
              [0, 1, 2].map((i) => (
                <circle key={`${r.key}-${i}`} r={Math.min(3.5, Math.max(1.8, r.thickness / 6))} fill={COLOR.moving}>
                  <animateMotion dur="2.4s" begin={`${i * 0.8}s`} repeatCount="indefinite" path={r.mid} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.65 0 0.35 1" />
                </circle>
              )),
            )}
        {laid.map((n) => {
          const right = n.node.depth >= 2;
          const sink = ["retainage", "backcharge", "unallocated"].includes(n.node.kind);
          return (
            <motion.g key={n.node.id} initial={{ opacity: 0 }} animate={{ opacity: hover && hover !== n.node.id && !ribbons.some((r) => (r.source === hover && r.target === n.node.id) || (r.target === hover && r.source === n.node.id)) ? 0.35 : 1 }} transition={{ duration: duration.fade }} onMouseEnter={() => setHover(n.node.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(n.node.id)} onBlur={() => setHover(null)} tabIndex={0} role="img" aria-label={`${n.node.label}, ${formatUsd0(n.value)}`} style={{ cursor: "default", outline: "none" }}>
              <motion.rect x={n.x} width={NODE_W} rx={2} fill={sink ? COLOR[n.node.kind === "retainage" ? "held" : n.node.kind === "backcharge" ? "setoff" : "idle"] : "var(--foreground)"} animate={{ y: n.y, height: n.h }} transition={spring.ui} />
              <motion.text x={right ? n.x + NODE_W + 8 : n.x - 8} textAnchor={right ? "start" : "end"} animate={{ y: n.labelY - 3 }} transition={spring.ui} className="fill-foreground text-[13px] font-medium" style={HALO}>
                {n.node.label}
              </motion.text>
              <motion.text x={right ? n.x + NODE_W + 8 : n.x - 8} textAnchor={right ? "start" : "end"} animate={{ y: n.labelY + 12 }} transition={spring.ui} className="num fill-muted-foreground text-[12px]" style={HALO}>
                {formatUsd0(n.value)}
              </motion.text>
            </motion.g>
          );
        })}
      </svg>
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {totals.map((t) => (
            <li key={t.k} className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR[t.k] }} />
              <span className="text-muted-foreground">{KIND_LABEL[t.k]}</span>
              <RollingNumber value={t.cents} className="font-medium" />
            </li>
          ))}
        </ul>
        {showControls && flow.events.length > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (at >= last) setStep(0);
                setPlaying((p) => !p);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium transition-transform active:scale-[0.97]"
              aria-label={playing ? "Pause" : at >= last ? "Replay from the first payment" : "Play"}
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : at >= last ? <RotateCcw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {playing ? "Pause" : at >= last ? "Replay" : "Play"}
            </button>
            <ol className="flex items-center gap-1" aria-label="Funding events">
              {flow.events.map((e, i) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPlaying(false);
                      setStep(i);
                    }}
                    aria-current={i === at}
                    aria-label={`${e.reference}, ${formatUsd0(e.amountCents)}`}
                    title={`${e.reference} · ${formatUsd0(e.amountCents)}`}
                    className="group flex h-8 w-5 items-center justify-center"
                  >
                    <span className={`block rounded-full transition-all ${i === at ? "h-3 w-3 bg-money" : i < at ? "h-2 w-2 bg-foreground/60" : "h-2 w-2 bg-border group-hover:bg-foreground/40"} ${e.tier === 2 ? "ring-1 ring-foreground/30 ring-offset-1 ring-offset-background" : ""}`} />
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </figcaption>
      <p className="mt-2 text-xs text-muted-foreground" aria-live={playing ? "off" : "polite"}>
        <span className="type-label mr-2">{current.tier === 2 ? "One hop down" : `Payment ${flow.events.slice(0, at + 1).filter((e) => e.tier === 1).length}`}</span>
        {current.reference} · <span className="num">{formatUsd0(current.amountCents)}</span> · received {new Date(current.receivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
      </p>
    </figure>
  );
}
