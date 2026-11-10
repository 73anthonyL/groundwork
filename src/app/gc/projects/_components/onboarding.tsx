import Link from "next/link";
import type { GcOnboarding } from "@/server/read/gc-lists";
import { buttonVariants } from "@/components/ui/button";
import type { ChecklistStep } from "@/components/ui/checklist";

/**
 * The five steps from an empty account to the first payment. The first unfinished step is the
 * current one and carries the only button. `primary` is false where the page already has a primary action.
 */
export function onboardingSteps(o: GcOnboarding, { primary = false }: { primary?: boolean } = {}): ChecklistStep[] {
  const go = (href: string, label: string) => (
    <Link href={href} className={buttonVariants({ variant: primary ? "primary" : "secondary" })}>
      {label}
    </Link>
  );
  const project = o.projectId ? `/gc/projects/${o.projectId}` : "/gc/projects/new";
  const steps: (Omit<ChecklistStep, "state"> & { done: boolean })[] = [
    {
      id: "project",
      title: "Create a project",
      done: o.hasProject,
      description: "Name the job, its owner and its state. The state sets the payment law Groundwork applies.",
      action: go("/gc/projects/new", "Create project"),
    },
    {
      id: "subcontract",
      title: "Upload a subcontract",
      done: o.hasSubcontract,
      description: "A signed PDF with selectable text. Groundwork reads its payment terms and quotes the clause behind each one.",
      action: go(`${project}/subcontracts/new`, "Upload subcontract"),
    },
    {
      id: "rules",
      title: "Approve its payment rules",
      done: o.rulesApproved,
      description: "Check each term against the contract, resolve anything flagged, and approve once. Nothing is paid on a subcontract until you do.",
      action: go(o.contractToApprove ? `/gc/contracts/${o.contractToApprove}` : `${project}/subcontracts`, "Review payment rules"),
    },
    {
      id: "invite",
      title: "Invite the subcontractor",
      done: o.invited,
      description: "They bill against the schedule of values and sign lien waivers from their own account. Email sending is not connected, so you copy the link and send it yourself.",
      action: go(o.subToInvite ? `/gc/team?invite=${o.subToInvite}` : "/gc/team", "Invite subcontractor"),
    },
    {
      id: "payment",
      title: "Record the first owner payment",
      done: o.ownerPaymentRecorded,
      description: "Groundwork splits it between approved pay apps, holds retainage, requests waivers and starts each deadline.",
      action: go(o.projectToFund ? `/gc/projects/${o.projectToFund}?record=1` : project, "Record owner payment"),
    },
  ];
  const current = steps.findIndex((s) => !s.done);
  return steps.map(({ done, ...s }, i) => ({ ...s, state: done ? "done" : i === current ? "current" : "todo" }));
}
