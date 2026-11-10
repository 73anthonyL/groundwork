/**
 * A fixed copy of the Bayview Clinic TI story for pages that have no session (the landing page):
 * three owner payments, three subcontractors, one supplier, a backcharge. Same shape as the `flow`
 * view of the read API, so the same component draws both.
 */
import type { FlowLink, ProjectFlow } from "@/server/read/project";

const $ = (d: number) => d * 100;
const link = (eventId: string, source: string, target: string, cents: number, kind: FlowLink["kind"], label?: string): FlowLink => ({ source, target, cents, kind, eventId, label });

export const SAMPLE_FLOW: ProjectFlow = {
  nodes: [
    { id: "owner", kind: "owner", label: "Bayview Health", depth: 0 },
    { id: "gc", kind: "gc", label: "Meridian Builders", depth: 1 },
    { id: "c:iron", kind: "sub", label: "Ironline Steel", depth: 2 },
    { id: "c:pac", kind: "sub", label: "Pacific Electric", depth: 2 },
    { id: "c:sum", kind: "sub", label: "Summit Drywall", depth: 2 },
    { id: "retainage", kind: "retainage", label: "Retainage held", depth: 2 },
    { id: "backcharge", kind: "backcharge", label: "Backcharges", depth: 2 },
    { id: "c:rebar", kind: "lower", label: "Bay Rebar Supply", depth: 3 },
  ],
  links: [],
  events: [
    {
      id: "e1", reference: "ACH BVH-0147", receivedAt: "2026-10-14T17:05:00Z", amountCents: $(200_000), retentionCents: 0, periodThrough: "2026-09-30", tier: 1, parentReleaseId: null,
      links: [link("e1", "owner", "gc", $(200_000), "paid"), link("e1", "gc", "c:iron", $(90_000), "paid"), link("e1", "gc", "c:pac", $(57_000), "paid"), link("e1", "gc", "c:sum", $(36_000), "paid"), link("e1", "gc", "retainage", $(17_000), "held")],
    },
    {
      id: "e2", reference: "ACH BVH-0162", receivedAt: "2026-11-03T18:00:00Z", amountCents: $(125_000), retentionCents: 0, periodThrough: "2026-10-31", tier: 1, parentReleaseId: null,
      links: [link("e2", "owner", "gc", $(125_000), "paid"), link("e2", "gc", "c:iron", $(45_000), "paid"), link("e2", "gc", "c:pac", $(47_500), "paid"), link("e2", "gc", "c:sum", $(22_500), "paid"), link("e2", "gc", "retainage", $(10_000), "held")],
    },
    {
      id: "e3", reference: "ACH BVH-0188", receivedAt: "2026-11-10T17:00:00Z", amountCents: $(175_000), retentionCents: 0, periodThrough: "2026-11-30", tier: 1, parentReleaseId: null,
      links: [link("e3", "owner", "gc", $(175_000), "paid"), link("e3", "gc", "c:iron", $(90_000), "moving"), link("e3", "gc", "c:pac", $(47_500), "moving"), link("e3", "gc", "c:sum", $(21_000), "moving"), link("e3", "gc", "retainage", $(15_000), "held"), link("e3", "gc", "backcharge", $(1_500), "setoff")],
    },
    {
      id: "e4", reference: "Ironline Steel · ACH BVH-0188", receivedAt: "2026-11-17T17:00:00Z", amountCents: $(12_000), retentionCents: 0, periodThrough: "2026-11-30", tier: 2, parentReleaseId: "r",
      links: [link("e4", "c:iron", "c:rebar", $(12_000), "moving")],
    },
  ],
  totalInCents: $(500_000),
};
SAMPLE_FLOW.links = SAMPLE_FLOW.events.flatMap((e) => e.links);
