"use client";

import { useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { spring } from "@/lib/motion";

const THEMES = [
  { id: "", label: "Paper", note: "The default: white sheets, true ink, blue for actions, color only where it means something." },
  { id: "concrete", label: "Concrete", note: "The original look: concrete page, graphite ink, surveyor orange." },
  { id: "ink", label: "Ink", note: "Deep green ink on cool off-white, softer corners." },
  { id: "night", label: "Night", note: "Dark surfaces, hairline edges instead of shadows." },
];
const TYPES = [
  { id: "", label: "Sans", note: "IBM Plex Sans throughout; the serif is reserved for the contract's own words." },
  { id: "serif", label: "Serif figures", note: "A light serif for the page title and the big numbers." },
];

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const read = (key: "theme" | "type") => () => (typeof document === "undefined" ? "" : (document.documentElement.dataset[key] ?? ""));

function set(key: "theme" | "type", value: string) {
  const d = document.documentElement;
  if (value) d.dataset[key] = value;
  else delete d.dataset[key];
  try {
    if (value) localStorage.setItem(`gw-${key}`, value);
    else localStorage.removeItem(`gw-${key}`);
  } catch {}
  listeners.forEach((fn) => fn());
}

function Segmented({ name, options, value, onChange }: { name: string; options: typeof THEMES; value: string; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex gap-0.5 rounded-md bg-secondary p-0.5 text-xs">
      {options.map((o) => (
        <button key={o.id || "default"} role="radio" aria-checked={o.id === value} title={o.note} onClick={() => onChange(o.id)} className="relative cursor-pointer rounded-[5px] px-2.5 py-1 font-medium">
          {o.id === value && <motion.span layoutId={`seg-${name}`} transition={spring.ui} className="absolute inset-0 rounded-[5px] bg-card shadow-card" />}
          <span className={`relative ${o.id === value ? "text-foreground" : "text-muted-foreground"}`}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Switches the whole app between theme sets and type sets and remembers the choice in this browser.
 * A theme is one block of variables in globals.css, so adding or retuning one touches nothing else.
 */
export function ThemeSwitcher() {
  const theme = useSyncExternalStore(subscribe, read("theme"), () => "");
  const type = useSyncExternalStore(subscribe, read("type"), () => "");
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden>Theme</span> <Segmented name="theme" options={THEMES} value={theme} onChange={(v) => set("theme", v)} />
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden>Type</span> <Segmented name="type" options={TYPES} value={type} onChange={(v) => set("type", v)} />
      </div>
    </div>
  );
}
