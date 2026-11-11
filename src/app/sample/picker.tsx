"use client";

/**
 * The character picker for the sample workspace: one drawn face per person, grouped by the kind of
 * company they work for. Choosing a card shows who they are and what the tour will have you do;
 * "Play as …" enters the workspace as that person and starts their tour.
 *
 * The cards are a radio group: Tab moves into it, the arrow keys move between people, and the play
 * button is the form's one submit.
 */
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Face } from "@/components/tour/faces";
import { TOURS, type TourKind } from "@/components/tour/tours";
import { enterSample } from "./actions";

export type Seat = { id: string; name: string; title: string | null; company: string; city: string | null; kind: TourKind; start: boolean };

const GROUPS: { kind: TourKind; title: string; does: string }[] = [
  { kind: "owner", title: "Owners", does: "Pay for the building and see where each payment went. They cannot change anything." },
  { kind: "gc", title: "General contractor", does: "Adds subcontracts, approves pay apps and records the owner's payments." },
  { kind: "sub", title: "Subcontractors", does: "Bill for the period, sign lien waivers and see when their money arrives." },
];

function PlayButton({ first }: { first: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="signal" size="lg" loading={pending} className="px-5 text-[15px] max-sm:w-full">
      Play as {first}
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

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = order[(order.findIndex((s) => s.id === chosen) + step + order.length) % order.length];
    setChosen(next.id);
    cards.current.get(next.id)?.focus();
  }

  return (
    <form action={enterSample} className="flex flex-col gap-10">
      <input type="hidden" name="userId" value={seat.id} />
      <div role="radiogroup" aria-label="Who you play" onKeyDown={onKeyDown} className="flex flex-wrap gap-x-10 gap-y-8">
        {GROUPS.map((g) => {
          const people = seats.filter((s) => s.kind === g.kind);
          if (people.length === 0) return null;
          return (
            <section key={g.kind} aria-label={g.title} className="min-w-0">
              <h2 className="text-sm font-semibold leading-5">{g.title}</h2>
              <p className="type-meta mt-0.5 max-w-[34ch] text-muted-foreground">{g.does}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {people.map((p) => {
                  const on = p.id === seat.id;
                  return (
                    <button
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
                      className={cn(
                        "group relative flex w-[8.75rem] cursor-pointer flex-col items-center rounded-xl border bg-card px-3 pb-4 pt-5 text-center transition-[translate,border-color,background-color,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:border-signal/60 active:translate-y-0",
                        on && "-translate-y-1 border-signal bg-secondary shadow-float",
                      )}
                    >
                      {p.start && (
                        <Badge tone="money" dot={false} className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-background px-2 whitespace-nowrap">
                          Start here
                        </Badge>
                      )}
                      <Face name={p.name} size={80} className={cn("transition-[scale] duration-200 ease-out group-hover:scale-105", on && "scale-105")} />
                      <span className="mt-3 text-[15px] font-semibold leading-5">{p.name.split(" ")[0]}</span>
                      <span className="type-meta mt-0.5 text-muted-foreground">{p.company}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div aria-live="polite" className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5 border-t pt-6">
        <div key={seat.id} className="reveal flex min-w-0 items-start gap-4">
          <Face name={seat.name} size={56} />
          <div className="min-w-0">
            <p className="text-[17px] font-semibold leading-6">{seat.name}</p>
            <p className="text-muted-foreground">{[seat.title, seat.company, seat.city].filter(Boolean).join(", ")}</p>
            <p className="type-meta mt-2 text-muted-foreground">As {first} you will:</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {TOURS[seat.kind].missions.map((m) => (
                <li key={m.label} className="flex items-start gap-2">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-signal" />
                  {m.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <PlayButton first={first} />
      </div>
    </form>
  );
}
