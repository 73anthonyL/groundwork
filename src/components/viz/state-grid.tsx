"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { StateLaw } from "@/domain/statutes";
import { duration, spring } from "@/lib/motion";

/** Tile map: one square per jurisdiction, placed roughly where it sits on a map. [column, row]. */
const TILE: Record<string, [number, number]> = {
  AK: [0, 0], ME: [11, 0],
  VT: [10, 1], NH: [11, 1],
  WA: [1, 2], ID: [2, 2], MT: [3, 2], ND: [4, 2], MN: [5, 2], IL: [6, 2], WI: [7, 2], MI: [8, 2], NY: [9, 2], RI: [10, 2], MA: [11, 2],
  OR: [1, 3], NV: [2, 3], WY: [3, 3], SD: [4, 3], IA: [5, 3], IN: [6, 3], OH: [7, 3], PA: [8, 3], NJ: [9, 3], CT: [10, 3],
  CA: [1, 4], UT: [2, 4], CO: [3, 4], NE: [4, 4], MO: [5, 4], KY: [6, 4], WV: [7, 4], VA: [8, 4], MD: [9, 4], DE: [10, 4],
  AZ: [2, 5], NM: [3, 5], KS: [4, 5], AR: [5, 5], TN: [6, 5], NC: [7, 5], SC: [8, 5], DC: [9, 5],
  OK: [4, 6], LA: [5, 6], MS: [6, 6], AL: [7, 6], GA: [8, 6],
  HI: [0, 7], TX: [4, 7], FL: [9, 7],
};

type Bin = { label: string; color: string; ink?: string };
type Rule = { id: string; label: string; question: string; bins: Bin[]; bin: (s: StateLaw) => number; value: (s: StateLaw) => string; source: (s: StateLaw) => { cite: string; url: string; confidence: string; notes: string } };

const NONE: Bin = { label: "No private rule", color: "var(--muted)", ink: "var(--muted-foreground)" };

export const RULES: Rule[] = [
  {
    id: "promptPay",
    label: "Pay the sub within",
    question: "After the contractor is paid, how long does it have to pay its subcontractor?",
    bins: [{ label: "7 days or less", color: "var(--settled)" }, { label: "8 to 14 days", color: "color-mix(in oklch, var(--settled) 55%, var(--card))" }, { label: "15 days or more", color: "var(--hold)" }, NONE],
    bin: (s) => (s.promptPay.days === null ? 3 : s.promptPay.days <= 7 ? 0 : s.promptPay.days <= 14 ? 1 : 2),
    value: (s) => (s.promptPay.days === null ? "No private deadline; contract terms govern" : `${s.promptPay.days} days${s.promptPay.contractCanOverride === false ? ", and the contract cannot lengthen it" : s.promptPay.contractCanOverride ? ", unless agreed otherwise in writing" : ""}`),
    source: (s) => s.promptPay,
  },
  {
    id: "retainageCap",
    label: "Retainage cap",
    question: "Is there a limit on how much of each payment can be held back?",
    bins: [{ label: "Prohibited", color: "var(--flow-setoff)" }, { label: "Capped at 5%", color: "var(--settled)" }, { label: "Capped at 10%", color: "var(--hold)" }, { ...NONE, label: "No cap on private work" }],
    bin: (s) => (s.retainageCap.bps === null ? 3 : s.retainageCap.bps === 0 ? 0 : s.retainageCap.bps <= 500 ? 1 : 2),
    value: (s) => (s.retainageCap.bps === null ? "No statutory cap on private work" : s.retainageCap.bps === 0 ? "Retainage may not be withheld" : `${s.retainageCap.bps / 100}%${s.retainageCap.appliesFrom ? ` on contracts from ${s.retainageCap.appliesFrom}` : ""}`),
    source: (s) => s.retainageCap,
  },
  {
    id: "retainageRelease",
    label: "Pass retainage down within",
    question: "Once the contractor gets retention back, how long to pass the sub's share down?",
    bins: [{ label: "10 days or less", color: "var(--settled)" }, { label: "11 to 30 days", color: "var(--hold)" }, { ...NONE, label: "No private deadline" }],
    bin: (s) => (s.retainageRelease.days === null ? 2 : s.retainageRelease.days <= 10 ? 0 : 1),
    value: (s) => (s.retainageRelease.days === null ? "No private deadline" : `${s.retainageRelease.days} days ${s.retainageRelease.trigger ?? ""}`),
    source: (s) => s.retainageRelease,
  },
  {
    id: "payIfPaid",
    label: "Pay-if-paid",
    question: "Can a contract make the sub's pay depend on the owner paying?",
    bins: [{ label: "Void", color: "var(--settled)" }, { label: "Limited", color: "color-mix(in oklch, var(--settled) 50%, var(--card))" }, { label: "Enforceable", color: "var(--money)" }, { ...NONE, label: "Unsettled" }],
    bin: (s) => ({ void: 0, limited: 1, enforceable: 2, unsettled: 3 })[s.payIfPaid.status],
    value: (s) => ({ void: "Unenforceable: the sub must be paid even if the owner does not pay", limited: "Enforced only within statutory limits", enforceable: "Enforced when clearly worded", unsettled: "No controlling authority" })[s.payIfPaid.status],
    source: (s) => s.payIfPaid,
  },
  {
    id: "lienWaiver",
    label: "Lien waiver forms",
    question: "Does the state prescribe the exact waiver form?",
    bins: [{ label: "Statutory form required", color: "var(--foreground)", ink: "var(--background)" }, { ...NONE, label: "Any form" }],
    bin: (s) => (s.lienWaiver.statutoryFormRequired ? 0 : 1),
    value: (s) => `${s.lienWaiver.statutoryFormRequired ? `Statutory form required (${s.lienWaiver.forms.length} form${s.lienWaiver.forms.length === 1 ? "" : "s"})` : "No prescribed form"}${s.lienWaiver.notarizationRequired ? "; must be notarized" : ""}${s.lienWaiver.advanceWaiverVoid ? "; waivers signed before payment are void" : ""}`,
    source: (s) => s.lienWaiver,
  },
];

const CONF: Record<string, string> = { high: "Read in the statute text", medium: "Consistent secondary sources", low: "Single or uncertain source" };

/**
 * The statutory overlay as a map you can read at a glance: pick a rule, every state takes its color.
 * Click a state for the rule in words, its citation and how sure the research is.
 */
export function StateGrid({ states, initialRule = "promptPay", initialState = "CA", compact = false }: { states: StateLaw[]; initialRule?: string; initialState?: string | null; compact?: boolean }) {
  const [ruleId, setRuleId] = useState(initialRule);
  const [picked, setPicked] = useState<string | null>(initialState);
  const rule = RULES.find((r) => r.id === ruleId) ?? RULES[0];
  const by = Object.fromEntries(states.map((s) => [s.state, s]));
  const sel = picked ? by[picked] : null;
  const cell = 100 / 12;
  return (
    <div className={compact ? "" : "grid gap-6 lg:grid-cols-[1fr_340px]"}>
      <div className="min-w-0">
        <div role="tablist" aria-label="Rule" className="flex flex-wrap gap-1 rounded-full bg-secondary p-1 text-xs">
          {RULES.map((r) => (
            <button key={r.id} role="tab" aria-selected={r.id === rule.id} onClick={() => setRuleId(r.id)} className="relative rounded-full px-3 py-1.5 font-medium transition-colors">
              {r.id === rule.id && <motion.span layoutId="rule-pill" transition={spring.ui} className="absolute inset-0 rounded-full bg-card shadow-card" />}
              <span className={`relative ${r.id === rule.id ? "text-foreground" : "text-muted-foreground"}`}>{r.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{rule.question}</p>
        <div className="relative mt-4 w-full" style={{ aspectRatio: "12 / 8" }}>
          {states.map((s) => {
            const pos = TILE[s.state];
            if (!pos) return null;
            const b = rule.bins[rule.bin(s)];
            const on = picked === s.state;
            return (
              <motion.button
                key={s.state}
                type="button"
                onClick={() => setPicked(s.state)}
                aria-label={`${s.name}: ${rule.value(s)}`}
                aria-pressed={on}
                title={`${s.name} · ${rule.value(s)}`}
                className={`absolute flex items-center justify-center rounded-[4px] font-mono text-[10px] font-medium sm:text-[11px] ${on ? "z-10 ring-2 ring-foreground ring-offset-1 ring-offset-background" : ""}`}
                style={{ left: `${pos[0] * cell}%`, top: `${pos[1] * 12.5}%`, width: `calc(${cell}% - 3px)`, height: "calc(12.5% - 3px)", opacity: rule.source(s).confidence === "low" ? 0.55 : 1 }}
                animate={{ backgroundColor: b.color, color: b.ink ?? "#fff" }}
                transition={{ duration: duration.fade }}
                whileTap={{ scale: 0.94 }}
              >
                {s.state}
              </motion.button>
            );
          })}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {rule.bins.map((b, i) => (
            <li key={b.label} className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-sm border" style={{ background: b.color }} />
              {b.label} <span className="num">· {states.filter((s) => rule.bin(s) === i).length}</span>
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-foreground opacity-50" /> faded: low-confidence source
          </li>
        </ul>
      </div>
      {!compact && (
        <aside className="min-w-0 rounded-md border bg-card p-4 shadow-card" aria-live="polite">
          <AnimatePresence mode="wait">
            {sel ? (
              <motion.div key={`${sel.state}-${rule.id}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <div className="type-label text-muted-foreground">{rule.label}</div>
                <h3 className="mt-1 text-2xl font-semibold">{sel.name}</h3>
                <p className="mt-2 text-sm">{rule.value(sel)}</p>
                {rule.source(sel).cite && (
                  <p className="mt-3 text-sm">
                    {rule.source(sel).url ? (
                      <a href={rule.source(sel).url} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                        {rule.source(sel).cite}
                      </a>
                    ) : (
                      <span className="font-medium">{rule.source(sel).cite}</span>
                    )}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{CONF[rule.source(sel).confidence]}</p>
                {rule.source(sel).notes && <p className="mt-3 max-h-48 overflow-y-auto text-xs leading-relaxed text-muted-foreground">{rule.source(sel).notes}</p>}
              </motion.div>
            ) : (
              <p className="text-sm text-muted-foreground">Pick a state.</p>
            )}
          </AnimatePresence>
        </aside>
      )}
    </div>
  );
}
