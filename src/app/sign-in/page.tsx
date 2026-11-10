import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { auth, homeFor } from "@/server/auth";
import { Wordmark } from "@/components/wordmark";
import { signInAs } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

const GROUPS: { kind: "owner" | "gc" | "sub"; title: string; blurb: string }[] = [
  { kind: "owner", title: "Owner", blurb: "Pays for the building. Only watches: sees where each payment went." },
  { kind: "gc", title: "General contractor", blurb: "Does most of the work: uploads subcontracts, approves bills, records the owner's payments." },
  { kind: "sub", title: "Subcontractors", blurb: "Bill for their work, sign a waiver, and watch their money arrive." },
];

/** The seat to start from: the controller sees the whole chain. */
const START = "Priya Natarajan";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; switch?: string }> }) {
  const session = await auth();
  const { error, switch: switching } = await searchParams;
  if (session && !switching) redirect(homeFor(session.org.kind));

  const db = await getDb();
  const rows = await db
    .select({ user: schema.users, org: schema.organizations })
    .from(schema.users)
    .innerJoin(schema.organizations, eq(schema.users.orgId, schema.organizations.id))
    .orderBy(asc(schema.organizations.name), asc(schema.users.name));
  // Which project each company is on, so a seat says where it sits.
  const projects = await db.query.projects.findMany({ with: { contracts: { columns: { subOrgId: true, parentContractId: true } } } });
  const projectOf = (orgId: string) => projects.find((p) => p.ownerOrgId === orgId || p.contracts.some((c) => c.subOrgId === orgId && !c.parentContractId))?.name ?? null;
  // One seat per company: the contractor's three people see the same screens, so only the controller is offered.
  const seats = rows.filter((r) => r.org.kind !== "gc" || r.user.name === START);

  return (
    <div className="flex flex-1 flex-col">
      <div className="stage">
        <header className="mx-auto w-full max-w-5xl px-6 pt-6">
          <Wordmark />
        </header>
        <div className="mx-auto w-full max-w-5xl px-6 pb-16 pt-14">
          <h1 className="max-w-2xl text-4xl font-bold leading-[1.1] sm:text-5xl">Who do you want to be?</h1>
        <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-stage-muted">
          The owner pays the general contractor, who pays the subcontractors. Click a name to use Groundwork as that person. Start as {START.split(" ")[0]}, the contractor&rsquo;s controller, who does most of the work. This is a demo sign-in, so no password is needed.
        </p>
        </div>
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-16">
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            That person is no longer in the demo. Pick someone else.
          </p>
        )}
        <div className="mt-12 grid gap-x-10 gap-y-10 md:grid-cols-3">
          {GROUPS.map((g, gi) => {
            const people = seats.filter((r) => r.org.kind === g.kind);
            return (
              <section key={g.kind} aria-labelledby={`group-${g.kind}`} className="relative min-w-0">
                {/* Money flows left to right; the rule and arrowhead say so without a diagram. */}
                <div aria-hidden className="mb-5 flex items-center gap-2 text-muted-foreground">
                  <span className="num text-xs">{gi + 1}</span>
                  <span className="h-px flex-1 bg-border" />
                  {gi < GROUPS.length - 1 && <span className="text-xs">pays</span>}
                </div>
                <h2 id={`group-${g.kind}`} className="text-lg font-semibold">
                  {g.title}
                </h2>
                <p className="mt-1 min-h-10 text-sm text-muted-foreground">{g.blurb}</p>
                <ul className="mt-4 divide-y overflow-hidden rounded-xl bg-card shadow-card">
                  {people.map(({ user, org }) => (
                    <li key={user.id}>
                      <form action={signInAs}>
                        <input type="hidden" name="userId" value={user.id} />
                        <button type="submit" className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-link-soft focus-visible:bg-link-soft">
                          <span className="min-w-0">
                            <span className="block font-medium">
                              {user.name}
                              {user.name === START && <span className="ml-2 rounded-full bg-link-soft px-2 py-0.5 text-xs font-medium text-link">Start here</span>}
                            </span>
                            <span className="block text-[13px] text-muted-foreground">
                              {user.title}, {org.name}
                            </span>
                            <span className="block truncate text-[13px] text-muted-foreground">{org.kind === "gc" ? "Runs both projects" : (projectOf(org.id) ?? "Not on a project yet")}</span>
                          </span>
                          <span className="shrink-0 text-[13px] font-medium text-link transition-transform duration-150 group-hover:translate-x-1">Sign in</span>
                        </button>
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
