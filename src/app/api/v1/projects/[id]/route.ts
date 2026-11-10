import { projectClocks, projectFlow, projectSeries, projectSummary, projectTimeline } from "@/server/read/project";
import { apiSession, fail, json } from "@/server/read/api";

const VIEWS = { summary: projectSummary, flow: projectFlow, timeline: projectTimeline, series: projectSeries, clocks: projectClocks } as const;

/** GET /api/v1/projects/:id[?include=flow,clocks]: every view of the project, or the ones asked for. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { id } = await params;
  const asked = new URL(req.url).searchParams.get("include")?.split(",").map((v) => v.trim()).filter(Boolean);
  const names = (asked?.length ? asked : Object.keys(VIEWS)) as (keyof typeof VIEWS)[];
  const unknown = names.filter((n) => !(n in VIEWS));
  if (unknown.length) return fail(400, "unknown_view", `Unknown view: ${unknown.join(", ")}. Use ${Object.keys(VIEWS).join(", ")}.`);
  const out: Record<string, unknown> = {};
  for (const n of names) {
    const v = await VIEWS[n](s.org, id);
    if (v === null) return fail(404, "not_found", "No such project in your organization.");
    out[n] = v;
  }
  return json(out);
}
