import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { isSampleWorkspace, requireAuth } from "@/server/auth";
import { gcAttention, gcOnboarding } from "@/server/read/gc-lists";
import { now } from "@/server/clock";
import { PageBody, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Checklist } from "@/components/ui/checklist";
import { Section } from "@/components/ui/panel";
import { AttentionTable } from "./projects/_components/attention-table";
import { ProjectsTable } from "./projects/_components/projects-table";
import { onboardingSteps } from "./projects/_components/onboarding";

export const metadata: Metadata = { title: "Home" };

/**
 * The contractor's home. With nothing in the account it is one panel: what Groundwork does and the
 * five steps to a first payment. With projects it is what is waiting, then the projects.
 */
export default async function GcHome() {
  const { org } = await requireAuth("gc");
  const onboarding = await gcOnboarding(org);

  if (!onboarding.hasProject) {
    const steps = onboardingSteps(onboarding).map((s) => (s.id === "project" ? { ...s, action: undefined } : s));
    return (
      <>
        <PageHeader width="form" title="Home" />
        <PageBody width="form">
          <section aria-labelledby="start-heading" className="border-y">
            <div className="p-6">
              <h2 id="start-heading" className="type-section">
                Pay every subcontractor what the contract says, by the day the law allows
              </h2>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">
                Upload a subcontract, approve its payment rules once, and every owner payment splits itself.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Link href="/gc/projects/new" className={buttonVariants({ variant: "primary" })}>
                  Create project
                </Link>
                {!isSampleWorkspace(org) && (
                  <Link href="/sample" className={buttonVariants({ variant: "link" })}>
                    Explore the sample workspace
                  </Link>
                )}
              </div>
            </div>
            <Checklist title="From here to the first payment" steps={steps} className="rounded-none border-0 border-t" />
          </section>
        </PageBody>
      </>
    );
  }

  const items = await gcAttention(org);
  const steps = onboardingSteps(onboarding);
  const next = steps.find((s) => s.state === "current");
  return (
    <>
      <PageHeader title="Home" badge={items.length > 0 ? <Badge tone="hold">{items.length} waiting</Badge> : undefined} description={org.name} />
      <PageBody>
        {onboarding.done < onboarding.total && (
          <details open={items.length === 0} className="group border-y">
            <summary className="flex min-h-10 cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-medium">
                Finish setting up
                {next && <span className="font-normal text-muted-foreground group-open:hidden">, next: {next.title}</span>}
              </span>
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="type-meta num group-open:hidden">
                  {onboarding.done} of {onboarding.total}
                </span>
                <ChevronDown aria-hidden className="size-4 group-open:rotate-180" />
              </span>
            </summary>
            <Checklist steps={steps} className="rounded-none border-0 border-t" />
          </details>
        )}

        <Section title="Needs your attention">
          <AttentionTable items={items} nowIso={now().toISOString()} showProject />
        </Section>

        <Section
          title="Projects"
          actions={
            <Link href="/gc/projects/new" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Create project
            </Link>
          }
        >
          <ProjectsTable org={org} />
        </Section>
      </PageBody>
    </>
  );
}
