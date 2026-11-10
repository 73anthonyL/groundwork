import { latestEval } from "@/server/read/eval";
import { fail, json } from "@/server/read/api";

/** GET /api/v1/eval: the latest extraction eval run. Public: it describes the product, not a customer. */
export async function GET() {
  const run = latestEval();
  return run ? json(run) : fail(404, "no_eval", "No eval results on disk. Run `pnpm eval`.");
}
