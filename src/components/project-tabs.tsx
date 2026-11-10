/**
 * ProjectTabs: the five sections of a contractor's project. Put it in <PageHeader tabs={…}>.
 * Props: `projectId`; `counts?` ({ subcontracts?, payApps?, payments? }) to show a number beside a tab.
 * The current tab follows the address. (`active` is ignored; it is accepted so older pages compile.)
 */
import { Tabs } from "@/components/ui/tabs";

export function projectTabItems(projectId: string, counts: { subcontracts?: number; payApps?: number; payments?: number } = {}) {
  const base = `/gc/projects/${projectId}`;
  return [
    { href: base, label: "Overview" },
    { href: `${base}/subcontracts`, label: "Subcontracts", count: counts.subcontracts },
    { href: `${base}/pay-apps`, label: "Pay apps", count: counts.payApps },
    { href: `${base}/payments`, label: "Payments", count: counts.payments },
    { href: `${base}/activity`, label: "Activity" },
  ];
}

export function ProjectTabs({
  projectId,
  counts,
}: {
  projectId: string;
  counts?: { subcontracts?: number; payApps?: number; payments?: number };
  /** @deprecated ignored */
  active?: string;
}) {
  return <Tabs label="Project sections" items={projectTabItems(projectId, counts)} />;
}
