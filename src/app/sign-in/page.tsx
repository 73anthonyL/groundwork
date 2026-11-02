import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { auth, homeFor } from "@/server/auth";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import { signInAs } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

const GROUPS: { kind: "gc" | "sub" | "owner"; title: string; blurb: string }[] = [
  { kind: "gc", title: "General contractor", blurb: "Compiles subcontracts, reviews pay apps, records owner payments." },
  { kind: "sub", title: "Subcontractors", blurb: "Submit pay apps, sign waivers, see where the money is." },
  { kind: "owner", title: "Owner", blurb: "Funds the project. Read-only view." },
];

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  if (session) redirect(homeFor(session.org.kind));
  const { error } = await searchParams;

  const db = await getDb();
  const rows = await db
    .select({ user: schema.users, org: schema.organizations })
    .from(schema.users)
    .innerJoin(schema.organizations, eq(schema.users.orgId, schema.organizations.id))
    .orderBy(asc(schema.organizations.name), asc(schema.users.name));

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto w-full max-w-5xl px-6 pt-8">
        <Wordmark />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight">
          Pick a seat at the table.
        </h1>
        <p className="mt-3 max-w-xl text-base text-muted-foreground">
          Every persona below works on the same project, Bayview Clinic TI in Oakland. Sign in as one to see the
          payment chain from that side.
        </p>
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            That persona no longer exists. Pick another.
          </p>
        )}
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {GROUPS.map((g) => {
            const people = rows.filter((r) => r.org.kind === g.kind);
            return (
              <section key={g.kind} aria-labelledby={`group-${g.kind}`}>
                <h2 id={`group-${g.kind}`} className="text-lg font-semibold">
                  {g.title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{g.blurb}</p>
                <ul className="mt-4 space-y-3">
                  {people.map(({ user, org }) => (
                    <li key={user.id} className="rounded-md border border-border bg-card p-4">
                      <div className="text-xs text-muted-foreground">{org.name}</div>
                      <div className="mt-0.5 font-medium">{user.name}</div>
                      <div className="text-sm text-muted-foreground">{user.title}</div>
                      <form action={signInAs} className="mt-3">
                        <input type="hidden" name="userId" value={user.id} />
                        <Button type="submit" size="sm" className="w-full">
                          Continue as {user.name.split(" ")[0]}
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
