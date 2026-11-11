import type { Metadata } from "next";
import Link from "next/link";
import { listSamplePersonas } from "@/server/auth";
import { Wordmark } from "@/components/wordmark";
import { authLink } from "../sign-in/auth-frame";
import { Picker, type Seat } from "./picker";

export const metadata: Metadata = { title: "Sample workspace" };

/** The seat to start from: the controller sees the whole chain. */
const START = "Priya Natarajan";

/** Choose a role in the sample workspace. Entering starts that person's guided tour. */
export default async function SamplePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const people = await listSamplePersonas();
  // The contractor's people all see the same screens, so one seat is offered: the controller.
  const seats: Seat[] = people
    .filter((p) => p.org.kind !== "gc" || p.user.name === START)
    .map(({ user, org }) => ({ id: user.id, name: user.name, title: user.title ?? null, company: org.name, city: org.city ?? null, kind: org.kind, start: user.name === START }));

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background px-4 text-sm leading-5 sm:px-8">
      <main className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col pb-12 pt-8 sm:pt-[5vh]">
        <Wordmark />
        <h1 className="mt-8 text-[clamp(1.75rem,1.3rem+1.9vw,2.5rem)] font-medium leading-[1.12] tracking-[-0.015em]">Choose a role to explore</h1>
        <p className="mt-3 max-w-[60ch] text-[15px] leading-6 text-muted-foreground">
          The sample workspace has two projects with made-up data. Each role sees its own side of the same payments, and a short tour shows you around. You can switch roles at any time.
        </p>
        {error && (
          <p role="alert" className="mt-6 rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-destructive">
            That person is no longer in the sample workspace. Choose someone else.
          </p>
        )}
        <div className="mt-8">
          {seats.length === 0 ? <p className="text-muted-foreground">The sample workspace has not been set up on this server.</p> : <Picker seats={seats} />}
        </div>
        <p className="mt-10 border-t pt-6 text-muted-foreground">
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
      </main>
    </div>
  );
}
