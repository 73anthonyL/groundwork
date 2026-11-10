import { listProjects } from "@/server/scoped";
import { apiSession, json } from "@/server/read/api";

export async function GET() {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const rows = await listProjects(s.org);
  return json(rows.map((p) => ({ id: p.id, name: p.name, address: p.address, state: p.state, owner: p.owner.name, gc: p.gc.name, primeContractSumCents: p.primeContractSumCents, contractDate: p.contractDate })));
}
