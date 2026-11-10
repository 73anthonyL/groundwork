import { projectClocks, projectFlow, projectSeries, projectSummary, projectTimeline } from "@/server/read/project";
import { apiSession, fail, json } from "@/server/read/api";

const VIEWS = { summary: projectSummary, flow: projectFlow, timeline: projectTimeline, series: projectSeries, clocks: projectClocks } as const;

/** GET /api/v1/projects/:id/:view where view is summary | flow | timeline | series | clocks. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; view: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { id, view } = await params;
  if (!(view in VIEWS)) return fail(404, "unknown_view", `Unknown view "${view}". Use ${Object.keys(VIEWS).join(", ")}.`);
  const data = await VIEWS[view as keyof typeof VIEWS](s.org, id);
  return data === null ? fail(404, "not_found", "No such project in your organization.") : json(data);
}
