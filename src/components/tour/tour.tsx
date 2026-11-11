"use client";

/**
 * The guided tour of the sample workspace.
 *
 *   <Tour kind="gc" name="Priya Natarajan" home="/gc" />      mounted once by <AppShell> in the sample workspace
 *   <TourRestartButton home="/gc" className={navRow} />       "Replay tour" in the sidebar
 *
 * It starts when the address carries `?tour=1` (the character picker sends people in that way) and
 * remembers where it is for the browser tab, so it follows the visitor from page to page. Each kind
 * of page has a chapter (see ./tours.ts) that plays the first time the visitor lands there: the page
 * dims, one section is lit, and a card beside it says what it is.
 *
 * The tour never takes the page away. The dim layer and the spotlight ignore the pointer, so every
 * link and button works while a tip is showing; Escape or the close button dismisses the tips; a
 * dialog opened from the page hides them; and "End tour" removes every trace until it is replayed.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, Circle, RotateCcw, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { spring } from "@/lib/motion";
import { Face } from "./faces";
import { TOURS, type TourChapter, type TourKind, type TourStep } from "./tours";

/* ---------- Where the tour is, kept for the tab ---------- */

type State = { active: boolean; seen: string[]; chapter: string | null; step: number };
const KEY = "gw-tour";
const OFF: State = { active: false, seen: [], chapter: null, step: 0 };
const FRESH: State = { active: true, seen: [], chapter: null, step: 0 };

let snapshot: string | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): string {
  if (snapshot === null) {
    try {
      snapshot = window.sessionStorage.getItem(KEY) ?? "";
    } catch {
      snapshot = "";
    }
  }
  return snapshot;
}
function setTour(next: State) {
  snapshot = JSON.stringify(next);
  try {
    window.sessionStorage.setItem(KEY, snapshot);
  } catch {
    // Storage can be blocked; the tour then lasts until the page is reloaded.
  }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function useTourState(): State {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => "");
  return useMemo(() => {
    if (!raw) return OFF;
    try {
      return { ...OFF, ...(JSON.parse(raw) as Partial<State>) };
    } catch {
      return OFF;
    }
  }, [raw]);
}

/* ---------- Finding and following the section a step points at ---------- */

type Box = { top: number; left: number; width: number; height: number };
type Found = { box: Box | null; onScreen: boolean; index: number; total: number };

const PAD = 6;
const visible = (el: Element) => el.getClientRects().length > 0;
const find = (selector: string) => Array.from(document.querySelectorAll(selector)).find(visible) ?? null;

function boxOf(el: Element): { box: Box; onScreen: boolean } {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const top = Math.max(r.top - PAD, 8);
  const left = Math.max(r.left - PAD, 8);
  const bottom = Math.min(r.bottom + PAD, vh - 8);
  const right = Math.min(r.right + PAD, vw - 8);
  const onScreen = bottom - top > 24 && right - left > 24;
  return { box: { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }, onScreen };
}

/** Brings a section into view, leaving room for the card under or over it. */
function reveal(el: Element) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  if (r.top >= 88 && r.bottom <= vh - 220) return;
  const room = r.height > vh * 0.55 ? 96 : Math.max(96, (vh - r.height) / 2 - 80);
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollBy({ top: r.top - room, behavior: calm ? "auto" : "smooth" });
}

/**
 * One step, mounted fresh for each step. Looks for the target for two seconds (pages stream in),
 * then follows it as the page scrolls and resizes. Reports what it found; draws nothing itself.
 */
function StepTracker({ chapter, index, onFound, onMissing }: { chapter: TourChapter; index: number; onFound: (f: Found) => void; onMissing: () => void }) {
  const step = chapter.steps[index];
  const found = useRef(onFound);
  const missing = useRef(onMissing);
  useEffect(() => {
    found.current = onFound;
    missing.current = onMissing;
  });

  useEffect(() => {
    const present = chapter.steps.filter((s) => !s.target || find(s.target));
    const position = () => ({ index: Math.max(0, present.indexOf(step)), total: Math.max(1, present.length) });
    if (!step.target) {
      found.current({ box: null, onScreen: true, ...position() });
      return;
    }
    let el: Element | null = null;
    let tries = 0;
    let last = "";
    let gone = false;
    const measure = () => {
      if (!el || gone) return;
      if (!el.isConnected) el = find(step.target!);
      if (!el) return;
      const m = boxOf(el);
      const sig = `${m.box.top}|${m.box.left}|${m.box.width}|${m.box.height}|${m.onScreen}`;
      if (sig === last) return;
      last = sig;
      found.current({ ...m, ...position() });
    };
    const look = setInterval(() => {
      if (el) return measure();
      el = find(step.target!);
      if (el) {
        reveal(el);
        measure();
      } else if (++tries > 12) {
        clearInterval(look);
        if (step.optional) missing.current();
        else found.current({ box: null, onScreen: true, ...position() });
      }
    }, 160);
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure);
    return () => {
      gone = true;
      clearInterval(look);
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  }, [chapter, step]);

  return null;
}

/* ---------- The card beside the lit section ---------- */

const CARD_W = 340;

function cardPlace(box: Box | null, onScreen: boolean): { style: React.CSSProperties; caret: { side: "top" | "bottom"; x: number } | null } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(CARD_W, vw - 24);
  if (!box) return { style: { top: "50%", left: "50%", width: w, translate: "-50% -50%" }, caret: null };
  const below = vh - (box.top + box.height);
  const above = box.top;
  const center = box.left + box.width / 2;
  const left = Math.min(Math.max(center > vw * 0.62 ? box.left + box.width - w : box.left, 12), vw - w - 12);
  const caretX = Math.min(Math.max(center - left, 24), w - 24);
  if (onScreen && below >= 230) return { style: { top: box.top + box.height + 14, left, width: w }, caret: { side: "top", x: caretX } };
  if (onScreen && above >= 230) return { style: { bottom: vh - box.top + 14, left, width: w }, caret: { side: "bottom", x: caretX } };
  // A section taller than the window, or scrolled away: the card waits in the corner.
  return { style: { bottom: 16, right: 16, width: w }, caret: null };
}

function TipCard({ name, step, found, canGoBack, last, onBack, onNext, onClose }: { name: string; step: TourStep; found: Found; canGoBack: boolean; last: boolean; onBack: () => void; onNext: () => void; onClose: () => void }) {
  const { style, caret } = cardPlace(found.box, found.onScreen);
  return (
    <motion.div
      data-tour-ui
      role="dialog"
      aria-label={`Tour: ${step.title}`}
      initial={{ opacity: 0, y: caret?.side === "bottom" ? -8 : 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
      transition={spring.ui}
      style={style}
      className="fixed z-[46] rounded-xl border border-signal/40 bg-popover p-4 text-sm leading-5 text-popover-foreground shadow-float"
    >
      {caret && (
        <span
          aria-hidden
          style={{ left: caret.x - 6 }}
          className={cn("absolute size-3 rotate-45 border-signal/40 bg-popover", caret.side === "top" ? "-top-[7px] border-l border-t" : "-bottom-[7px] border-b border-r")}
        />
      )}
      <div className="flex items-start gap-3">
        <Face name={name} size={36} />
        <div className="min-w-0 flex-1">
          <h2 className="pr-6 font-semibold leading-5">{step.title}</h2>
          <p className="mt-1 text-muted-foreground">{step.body}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close these tips" className="absolute right-2 top-2 flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="type-caption num text-muted-foreground" aria-live="polite">
          Tip {found.index + 1} of {found.total}
        </span>
        <div className="flex items-center gap-2">
          {canGoBack && (
            <Button type="button" variant="tertiary" size="sm" onClick={onBack}>
              Back
            </Button>
          )}
          <Button type="button" size="sm" onClick={onNext}>
            {last ? "Got it" : "Next"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

/* ---------- The guide in the corner ---------- */

function Guide({ kind, name, state, lifted, onReplayPage, onEnd }: { kind: TourKind; name: string; state: State; lifted: boolean; onReplayPage: (() => void) | null; onEnd: () => void }) {
  const tour = TOURS[kind];
  const first = name.split(" ")[0];
  const done = (chapters: string[]) => chapters.some((c) => state.seen.includes(c));
  const count = tour.missions.filter((m) => done(m.chapters)).length;
  const complete = count === tour.missions.length;
  // Opens by itself once, when the last mission is ticked; after that the visitor's choice wins.
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? complete;
  return (
    <div data-tour-ui className={cn("fixed right-4 z-[44] flex flex-col items-end gap-2", lifted ? "bottom-24" : "bottom-4")}>
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            data-tour-ui
            role="dialog"
            aria-label="Tour guide"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.12 } }}
            transition={spring.ui}
            style={{ transformOrigin: "bottom right" }}
            className="w-[min(20rem,calc(100vw-2rem))] rounded-xl border bg-popover p-4 text-sm leading-5 text-popover-foreground shadow-float"
          >
            <h2 className="font-semibold">{complete ? "That is the tour" : `Things to try as ${first}`}</h2>
            <p className="type-meta mt-0.5 text-muted-foreground">{complete ? "You have seen each part. The sample workspace is yours to explore." : "Tips appear the first time you open each page."}</p>
            <ul className="mt-3 flex flex-col gap-0.5">
              {tour.missions.map((m) => (
                <li key={m.label}>
                  <Link href={m.href} onClick={() => setChoice(false)} className="-mx-2 flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-secondary">
                    {done(m.chapters) ? <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-signal" strokeWidth={2.5} /> : <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                    <span className={done(m.chapters) ? "text-muted-foreground" : undefined}>
                      {m.label}
                      {done(m.chapters) && <span className="sr-only"> (done)</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              {onReplayPage ? (
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  onClick={() => {
                    setChoice(false);
                    onReplayPage();
                  }}
                >
                  <RotateCcw aria-hidden />
                  Show this page&rsquo;s tips
                </Button>
              ) : (
                <span />
              )}
              <Button type="button" variant={complete ? "primary" : "secondary"} size="sm" onClick={onEnd}>
                {complete ? "Finish" : "End tour"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setChoice(!open)}
        aria-expanded={open}
        className="flex h-10 cursor-pointer items-center gap-2 rounded-full border bg-popover pl-1.5 pr-3.5 text-sm font-medium text-popover-foreground shadow-float transition-[scale,border-color] duration-150 ease-out hover:border-signal/60 active:scale-[0.97]"
      >
        <Face name={name} size={28} />
        Tour
        <span className="num text-muted-foreground">
          {count} of {tour.missions.length}
        </span>
      </button>
    </div>
  );
}

/* ---------- The tour ---------- */

export function Tour({ kind, name }: { kind: TourKind; name: string }) {
  const path = usePathname();
  const state = useTourState();
  const tour = TOURS[kind];

  // The picker sends people in with ?tour=1. Start fresh and tidy the address.
  const starting = useRef(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tour") !== "1") return;
    url.searchParams.delete("tour");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    starting.current = true;
    setTour(FRESH);
  }, [path]);

  const chapter = state.active && state.chapter ? (tour.chapters.find((c) => c.id === state.chapter) ?? null) : null;
  const here = tour.chapters.find((c) => c.match(path)) ?? null;

  // Leaving a page ends its chapter; arriving on a page whose chapter has not played starts it.
  useEffect(() => {
    // The state in hand predates a start made a moment ago; wait for the fresh one.
    if (starting.current) {
      starting.current = false;
      return;
    }
    if (!state.active) return;
    if (chapter && !chapter.match(path)) {
      setTour({ ...state, seen: [...new Set([...state.seen, chapter.id])], chapter: null, step: 0 });
    } else if (!state.chapter && here && !state.seen.includes(here.id)) {
      setTour({ ...state, chapter: here.id, step: 0 });
    }
  }, [state, chapter, here, path]);

  const running = chapter && chapter.match(path) ? chapter : null;
  const step = running ? (running.steps[state.step] ?? null) : null;
  const stepKey = running && step ? `${running.id}:${step.id}` : null;

  // What the tracker found, tagged with the step it belongs to so a stale report is never drawn.
  const [report, setReport] = useState<{ key: string; found: Found } | null>(null);
  const found = report && report.key === stepKey ? report.found : null;
  // Steps actually shown in this chapter, so Back returns to one that exists on this page.
  const shown = useRef<number[]>([]);
  // A page dialog (record a payment, the phone menu) takes over; the tips step aside for it.
  const [covered, setCovered] = useState(false);
  // The spotlight glides between steps and then sticks to its section while the page scrolls.
  const [gliding, setGliding] = useState(false);

  const finish = useCallback(() => {
    if (!running) return;
    shown.current = [];
    setTour({ ...state, seen: [...new Set([...state.seen, running.id])], chapter: null, step: 0 });
  }, [running, state]);

  const go = useCallback(
    (to: number) => {
      if (!running) return;
      if (to >= running.steps.length) return finish();
      setTour({ ...state, step: Math.max(0, to) });
    },
    [running, state, finish],
  );

  useEffect(() => {
    if (!stepKey) return;
    const start = setTimeout(() => setGliding(true), 0);
    const stop = setTimeout(() => setGliding(false), 380);
    return () => {
      clearTimeout(start);
      clearTimeout(stop);
    };
  }, [stepKey]);

  useEffect(() => {
    if (!state.active) return;
    const check = () => setCovered(Boolean(document.querySelector('[role="dialog"]:not([data-tour-ui]), [role="alertdialog"]')));
    const id = setInterval(check, 250);
    return () => clearInterval(id);
  }, [state.active]);

  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]:not([data-tour-ui])')) finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, finish]);

  if (!state.active) return null;

  const showing = Boolean(running && step && found && !covered);
  const box = showing ? found!.box : null;
  const lit = showing && box !== null && found!.onScreen;
  const dim = showing && (box === null || found!.onScreen);

  return (
    <>
      {running && step && (
        <StepTracker
          key={stepKey}
          chapter={running}
          index={state.step}
          onFound={(f) => {
            if (!shown.current.includes(state.step)) shown.current.push(state.step);
            setReport({ key: stepKey!, found: f });
          }}
          onMissing={() => go(state.step + 1)}
        />
      )}

      {/* The dim layer and its lit window. Neither takes the pointer, so the page under them stays usable. */}
      <div
        data-tour-ui
        aria-hidden
        className={cn("tour-spot pointer-events-none fixed z-[45] rounded-[10px]", gliding && "tour-spot-glide")}
        style={{
          top: lit ? box!.top : "50%",
          left: lit ? box!.left : "50%",
          width: lit ? box!.width : 0,
          height: lit ? box!.height : 0,
          opacity: dim ? 1 : 0,
        }}
      >
        {lit && <span className="tour-ring absolute inset-0 rounded-[10px]" />}
        {lit && <span className="tour-pulse absolute inset-0 rounded-[10px]" />}
      </div>

      <AnimatePresence mode="wait">
        {showing && step && running && (
          <TipCard
            key={stepKey}
            name={name}
            step={step}
            found={found!}
            canGoBack={found!.index > 0}
            last={found!.index + 1 >= found!.total}
            onBack={() => {
              const before = shown.current.filter((i) => i < state.step);
              shown.current = before;
              go(before[before.length - 1] ?? 0);
            }}
            onNext={() => go(state.step + 1)}
            onClose={finish}
          />
        )}
      </AnimatePresence>

      {!running && !covered && (
        <Guide
          kind={kind}
          name={name}
          state={state}
          lifted={path.startsWith("/sub/pay-apps/new") || path.startsWith("/gc/contracts/")}
          onReplayPage={
            here
              ? () => {
                  shown.current = [];
                  setTour({ ...state, chapter: here.id, step: 0 });
                }
              : null
          }
          onEnd={() => setTour(OFF)}
        />
      )}
    </>
  );
}

/** "Replay tour" for the sidebar: starts the tour again from the home page. */
export function TourRestartButton({ home, className, children }: { home: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        setTour(FRESH);
        if (path !== home) router.push(home);
      }}
    >
      {children}
    </button>
  );
}
