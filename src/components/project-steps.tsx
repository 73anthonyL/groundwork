import Link from "next/link";
import { Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export type ProjectStep = {
  title: string;
  /** One line: what happens at this step and who does it. */
  body: string;
  done: boolean;
  /** What to do about it now, if this step is waiting on the contractor. */
  action?: { href: string; label: string };
};

/**
 * How a payment happens, in order, and where this project is in it. The first unfinished step is
 * the current one: it is the only one with a button, so there is always one obvious thing to do.
 */
export function ProjectSteps({ steps }: { steps: ProjectStep[] }) {
  const current = steps.findIndex((s) => !s.done);
  return (
    <section aria-labelledby="steps-heading" className="mt-8 overflow-hidden rounded-xl bg-card shadow-card">
      <h2 id="steps-heading" className="border-b px-5 py-3 text-sm font-semibold">
        How a payment happens
      </h2>
      <ol className="grid divide-y md:grid-cols-5 md:divide-x md:divide-y-0">
        {steps.map((s, i) => {
          const isCurrent = i === current;
          return (
            <li key={s.title} aria-current={isCurrent ? "step" : undefined} className={`flex flex-col gap-1.5 px-5 py-4 ${isCurrent ? "bg-link-soft/60" : ""}`}>
              <div className="flex items-center gap-2">
                <span
                  className={`num flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${s.done ? "bg-settled text-settled-foreground" : isCurrent ? "bg-link text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                >
                  {s.done ? <Check className="h-3 w-3" strokeWidth={3} aria-label="Done" /> : i + 1}
                </span>
                <span className={`text-sm font-semibold ${!s.done && !isCurrent ? "text-muted-foreground" : ""}`}>{s.title}</span>
              </div>
              <p className="text-[13px] leading-snug text-muted-foreground">{s.body}</p>
              {isCurrent && s.action && (
                <Link href={s.action.href} className={buttonVariants({ variant: "money", size: "sm", className: "mt-1.5 self-start" })}>
                  {s.action.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
