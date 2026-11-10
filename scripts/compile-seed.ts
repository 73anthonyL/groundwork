/**
 * Compile a seed contract with the model and cache the extraction, so demo checkpoints can replay
 * a real model result without calling the API (needs ANTHROPIC_API_KEY).
 *   node --env-file-if-exists=.env.local --import tsx scripts/compile-seed.ts seed/states/contracts/<slug>.pdf
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractRuleSet } from "../src/lib/ai/extractRuleSet";

for (const file of process.argv.slice(2)) {
  const r = await extractRuleSet(new Uint8Array(readFileSync(file)));
  const out = path.resolve(path.dirname(file), "..", "cache", path.basename(file).replace(/\.pdf$/, ".json"));
  writeFileSync(out, JSON.stringify({ extracted: r.extracted, model: r.model, promptVersion: r.promptVersion, ms: r.ms, at: new Date().toISOString() }, null, 2));
  console.log(`${path.basename(file)} → ${path.relative(process.cwd(), out)} in ${(r.ms / 1000).toFixed(1)}s`);
}
