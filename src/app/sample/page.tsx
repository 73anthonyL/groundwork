import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { listSamplePersonas } from "@/server/auth";
import { Badge } from "@/components/ui/badge";
import { AuthFrame, authLink } from "../sign-in/auth-frame";
import { enterSample } from "./actions";

export const metadata: Metadata = { title: "Sample workspace" };

const GROUPS: { kind: "owner" | "gc" | "sub"; title: string; does: string }[] = [
  { kind: "owner", title: "Owner", does: "Pays for the building and watches where each payment went. Read only." },
  { kind: "gc", title: "General contractor", does: "Adds subcontracts, approves pay apps and records the owner's payments." },
  { kind: "sub", title: "Subcontractors", does: "Bill for the period, sign a waiver and see when their money arrives." },
];

/** The seat to start from: the controller sees the whole chain. */
const START = "Priya Natarajan";

export default async function SamplePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const people = await listSamplePersonas();
  // The contractor's people all see the same screens, so one seat is offered: the controller.
  const seats = people.filter((p) => p.org.kind !== "gc" || p.user.name === START);

  return (
    <AuthFrame
      width="list"
      title="Sample workspace"
      description="Sample data on two projects. Pick a person to explore as."
    >
      {error && (
        <p role="alert" className="mb-6 rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-destructive">
          That person is no longer in the sample workspace. Choose someone else.
        </p>
      )}
      {seats.length === 0 && <p className="text-muted-foreground">The sample workspace has not been set up on this server.</p>}
      <div className="flex flex-col gap-8">
        {GROUPS.map((g) => {
          const rows = seats.filter((p) => p.org.kind === g.kind);
          if (rows.length === 0) return null;
          return (
            <section key={g.kind} aria-labelledby={`group-${g.kind}`}>
              <h2 id={`group-${g.kind}`} className="font-semibold">
                {g.title}
              </h2>
              <p className="type-meta mt-0.5 text-muted-foreground">{g.does}</p>
              <ul className="mt-3 divide-y border-y">
                {rows.map(({ user, org }) => (
                  <li key={user.id}>
                    <form action={enterSample}>
                      <input type="hidden" name="userId" value={user.id} />
                      <button type="submit" className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted focus-visible:-outline-offset-2">
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                            {user.name}
                            {user.name === START && <Badge tone="info">Start here</Badge>}
                          </span>
                          <span className="type-meta block truncate text-muted-foreground">{[user.title, org.name].filter(Boolean).join(", ")}</span>
                        </span>
                        <span className="type-meta flex shrink-0 items-center gap-1 text-muted-foreground">
                          Enter
                          <ChevronRight aria-hidden className="size-4" />
                        </span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="mt-8 border-t pt-6 text-muted-foreground">
        Here for your own projects?{" "}
        <Link href="/sign-in?switch=1" className={authLink}>
          Sign in
        </Link>{" "}
        or{" "}
        <Link href="/sign-up" className={authLink}>
          create an account
        </Link>
        .
      </p>
    </AuthFrame>
  );
}
