import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { requireAuth } from "@/server/auth";
import { getContract, getDocument } from "@/server/scoped";
import { createRuleSet } from "@/server/actions/rules";
import { extractRuleSet } from "@/lib/ai/extractRuleSet";
import { hasApiKey, MODEL } from "@/lib/ai/client";
import { ruleSetFromSpec, type ContractSpec } from "@/domain/rules/from-spec";
import { blockingFields } from "@/server/rules/review";
import { ID } from "@/db/seed";
import { stableId } from "@/lib/ids";

export const maxDuration = 300;

/**
 * POST /api/extract/:contractId[?source=seed]
 * Compiles the contract's PDF into a rule set. `source=seed` (or DEMO_PRECOMPILED=1, or no API key)
 * replays the seed spec instead of calling the model, so the review UI works without credentials.
 */
export async function POST(req: Request, { params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  const session = await requireAuth("gc");
  const contract = await getContract(session.org, contractId);
  if (!contract) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!contract.documentId) return NextResponse.json({ error: "no_document" }, { status: 400 });
  const doc = await getDocument(session.org, contract.documentId);
  if (!doc) return NextResponse.json({ error: "no_document" }, { status: 400 });
  const pageTexts = doc.pageTexts ?? [];
  if (!pageTexts.some((t) => t.trim().length > 0)) {
    return NextResponse.json({ error: "scanned_pdf", message: "This PDF has no text layer; every field would be escalated. Upload a text PDF." }, { status: 422 });
  }
  const wantSeed = new URL(req.url).searchParams.get("source") === "seed" || process.env.DEMO_PRECOMPILED === "1";
  const actor = { userId: session.user.id, label: session.user.name };

  if (wantSeed || !hasApiKey()) {
    const key = (Object.keys(ID.contract) as (keyof typeof ID.contract)[]).find((k) => ID.contract[k] === contractId);
    // The cached extraction belongs to the seeded PDF only; an uploaded replacement must go to the model.
    const isSeedDoc = doc.id === stableId(`document:${contractId}:${doc.sha256}`);
    const specFile = key && isSeedDoc ? path.resolve("seed/specs", `${{ ironline: "ironline-steel", pacific: "pacific-electric", summit: "summit-drywall" }[key]}.json`) : null;
    if (!specFile || !existsSync(specFile)) {
      return NextResponse.json({ error: "no_api_key", message: "ANTHROPIC_API_KEY is not set and no cached extraction exists for this PDF." }, { status: 409 });
    }
    const spec = JSON.parse(readFileSync(specFile, "utf8")) as ContractSpec;
    const t0 = Date.now();
    const extracted = ruleSetFromSpec(spec, pageTexts);
    const created = await createRuleSet({ contractId, extracted, pageTexts, model: wantSeed && hasApiKey() ? `${MODEL} (cached)` : "cached extraction", promptVersion: "seed-1", extractionMs: Date.now() - t0, actor });
    return NextResponse.json({ ruleSetId: created.id, version: created.version, blocking: blockingFields(created.stored), source: "seed", ms: Date.now() - t0 });
  }

  try {
    const bytes = Buffer.from(doc.bytesB64, "base64");
    const result = await extractRuleSet(new Uint8Array(bytes));
    const created = await createRuleSet({ contractId, extracted: result.extracted, pageTexts, model: result.model, promptVersion: result.promptVersion, extractionMs: result.ms, usage: result.usage, actor });
    return NextResponse.json({ ruleSetId: created.id, version: created.version, blocking: blockingFields(created.stored), source: "model", ms: result.ms });
  } catch (e) {
    return NextResponse.json({ error: "extraction_failed", message: (e as Error).message }, { status: 502 });
  }
}
