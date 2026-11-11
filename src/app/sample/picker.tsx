"use client";

/**
 * The role picker for the sample workspace: one drawn face per person, grouped by the kind of
 * company they work for, beside a panel that shows the chosen person and what their tour covers.
 * "Continue as …" enters the workspace as that person and starts the tour.
 *
 * The cards are a radio group: Tab moves into it, the arrow keys move between people, and the
 * continue button is the form's one submit. The panel stays on screen beside the cards on a wide
 * window. On a narrow one it sits under them, and a bar with the continue button stays pinned to
 * the bottom of the screen.
 *
 * Motion: the cards arrive in turn, the selection outline slides from card to card, and the panel's
 * face and text are swapped in. All of it stops when the visitor asks for reduced motion.
 */
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Face } from "@/components/tour/faces";
import { TOURS, type TourKind } from "@/components/tour/tours";
import { list, spring } from "@/lib/motion";
import { enterSample } from "./actions";

export type Seat = { id: string; name: string; title: string | null; company: string; city: string | null; kind: TourKind; start: boolean };

const GROUPS: { kind: TourKind; title: string; does: string; you: string }[] = [
  { kind: "owner", title: "Owner", does: "Pays for the building.", you: "You see where each of your payments went. This role can look at everything and change nothing." },
  { kind: "gc", title: "General contractor", does: "Pays the subcontractors.", you: "You add subcontracts, approve pay apps and record the owner's payments. This role sees the whole chain." },
  { kind: "sub", title: "Subcontractor", does: "Bills for the work and gets paid.", you: "You bill for the period, sign lien waivers and see when your money arrives." },
];

function ContinueButton({ first, className }: { first: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="signal" size="lg" loading={pending} className={cn("px-5 text-[15px]", className)}>
      Continue as {first}
      <ArrowRight aria-hidden />
    </Button>
  );
}

export function Picker({ seats }: { seats: Seat[] }) {
  const [chosen, setChosen] = useState(() => (seats.find((s) => s.start) ?? seats[0])?.id ?? "");
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const seat = seats.find((s) => s.id === chosen) ?? seats[0];
  if (!seat) return null;
  const order = GROUPS.flatMap((g) => seats.filter((s) => s.kind === g.kind));
  const first = seat.name.split(" ")[0];
  const group = GROUPS.find((g) => g.kind === seat.kind)!;

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = order[(order.findIndex((s) => s.id === chosen) + step + order.length) % order.length];
    setChosen(next.id);
    cards.current.get(next.id)?.focus();
  }

  return (
    <MotionConfig reducedMotion="user">
      <form action={enterSample} className="grid items-start gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <input type="hidden" name="userId" value={seat.id} />
        <LayoutGroup>
          <motion.div role="radiogroup" aria-label="Role" onKeyDown={onKeyDown} variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }} initial="hidden" animate="show" className="flex flex-wrap gap-x-10 gap-y-7">
            {GROUPS.map((g) => {
              const people = seats.filter((s) => s.kind === g.kind);
              if (people.length === 0) return null;
              return (
                <section key={g.kind} aria-label={g.title} className="min-w-0">
                  <h2 className="text-sm font-semibold leading-5">{g.title}</h2>
                  <p className="type-meta mt-0.5 text-muted-foreground">{g.does}</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {people.map((p) => {
                      const on = p.id === seat.id;
                      return (
                        <motion.button
                          key={p.id}
                          ref={(el) => {
                            if (el) cards.current.set(p.id, el);
                            else cards.current.delete(p.id);
                          }}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          tabIndex={on ? 0 : -1}
                          data-face-live
                          onClick={() => setChosen(p.id)}
                          variants={list.row}
                          whileHover={{ y: -4 }}
                          whileTap={{ scale: 0.97 }}
                          transition={spring.snappy}
                          className={cn("group relative flex w-[7.5rem] cursor-pointer flex-col items-center rounded-xl border bg-card px-2 pb-3.5 pt-4 text-center transition-colors duration-200 max-sm:w-[calc(33.333%-0.5rem)] max-sm:min-w-[6.25rem]", on ? "bg-popover" : "hover:border-input")}
                        >
                          {/* One outline for the whole group: it slides to whichever card is chosen. */}
                          {on && <motion.span layoutId="seat-outline" aria-hidden transition={spring.ui} className="pointer-events-none absolute -inset-px rounded-xl border-2 border-signal shadow-float" />}
                          {p.start && (
                            <Badge tone="money" dot={false} className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background px-2 whitespace-nowrap">
                              Start here
                            </Badge>
                          )}
                          <Face name={p.name} size={68} className={cn("transition-[scale] duration-200 ease-out group-hover:scale-105", on && "scale-105")} />
                          <span className="mt-2.5 text-[15px] font-semibold leading-5">{p.name.split(" ")[0]}</span>
                          <span className="type-meta mt-0.5 text-muted-foreground">{p.company}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </motion.div>
        </LayoutGroup>

        <motion.aside aria-live="polite" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.ui, delay: 0.15 }} className="rounded-xl border bg-card p-6 lg:sticky lg:top-8">
          <motion.div key={seat.id} variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }} initial="hidden" animate="show" data-face-live="always">
            <motion.div variants={{ hidden: { opacity: 0, scale: 0.8, rotate: -8 }, show: { opacity: 1, scale: 1, rotate: 0, transition: spring.pop } }} className="w-fit">
              <Face name={seat.name} size={104} />
            </motion.div>
            <motion.div variants={list.row}>
              <p className="mt-4 text-xl font-semibold leading-7 tracking-[-0.012em]">{seat.name}</p>
              <p className="text-muted-foreground">{[seat.title, seat.company, seat.city].filter(Boolean).join(", ")}</p>
            </motion.div>
            <motion.p variants={list.row} className="mt-3">
              {group.you}
            </motion.p>
            <motion.p variants={list.row} className="type-meta mt-4 text-muted-foreground">
              The tour covers
            </motion.p>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {TOURS[seat.kind].missions.map((m) => (
                <motion.li key={m.label} variants={list.row} className="flex items-start gap-2">
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-settled" />
                  {m.label}
                </motion.li>
              ))}
            </ul>
          </motion.div>
          <div className="mt-6 max-lg:hidden">
            <ContinueButton first={first} className="w-full" />
          </div>
        </motion.aside>

        {/* On a narrow window the panel is below the cards, so the way in stays pinned to the bottom of the screen. */}
        <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-xl border bg-popover p-2.5 shadow-float lg:hidden">
          <Face key={seat.id} name={seat.name} size={40} className="reveal" />
          <span className="min-w-0 flex-1 truncate font-medium">{seat.name}</span>
          <ContinueButton first={first} />
        </div>
      </form>
    </MotionConfig>
  );
}
