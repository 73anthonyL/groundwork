import { STATE_LAW, overlayFor, statute } from "@/domain/statutes";
import { fail, json } from "@/server/read/api";

/** GET /api/v1/statutes/:state[?executedOn=2026-03-01&prime=420000000]: one state's record and the overlay the engine applies. */
export async function GET(req: Request, { params }: { params: Promise<{ state: string }> }) {
  const code = (await params).state.toUpperCase();
  const law = STATE_LAW[code];
  if (!law) return fail(404, "not_found", `No record for "${code}". Use a two-letter state code or DC.`);
  const q = new URL(req.url).searchParams;
  const executedOn = q.get("executedOn") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(executedOn)) return fail(400, "bad_date", "executedOn must be YYYY-MM-DD.");
  const prime = q.get("prime");
  const overlay = overlayFor(code, executedOn, { primeContractSumCents: prime && /^\d+$/.test(prime) ? Number(prime) : undefined });
  const citations = Object.fromEntries(Object.entries(overlay.cites ?? {}).filter(([, id]) => id).map(([rule, id]) => [rule, { id, ...statute(id!) }]));
  return json({ law, overlay, citations, evaluatedFor: { executedOn, primeContractSumCents: prime ? Number(prime) : null } });
}
