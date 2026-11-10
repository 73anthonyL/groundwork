import type { Metadata } from "next";
import { requireAuth } from "@/server/auth";
import { STATES } from "@/domain/statutes";
import { PageBody, PageHeader } from "@/components/page-header";
import { NewProjectForm, type StateOption } from "./form";

export const metadata: Metadata = { title: "Create project" };

/** What the statute data says about paying subcontractors in each state, in one line. */
const STATE_OPTIONS: StateOption[] = STATES.map((s) => {
  const p = s.promptPay;
  const line =
    p.days === null
      ? `${s.name}: no statutory deadline for paying subcontractors on private work, so each subcontract's own terms apply`
      : `${s.name}: pay subcontractors within ${p.days} days of each owner payment${p.contractCanOverride === false ? ", and a contract cannot lengthen it" : p.contractCanOverride ? ", unless the subcontract says otherwise" : ""}`;
  return { code: s.state, name: s.name, line, cite: p.days === null ? null : p.cite || null };
});

export default async function NewProjectPage() {
  await requireAuth("gc");
  return (
    <>
      <PageHeader width="form" breadcrumbs={[{ label: "Projects", href: "/gc/projects" }, { label: "Create project" }]} title="Create project" description="A project is one job for one owner. Subcontracts, pay apps and owner payments all belong to it." />
      <PageBody width="form">
        <NewProjectForm states={STATE_OPTIONS} />
      </PageBody>
    </>
  );
}
