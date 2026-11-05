/**
 * Fetch the real, publicly posted subcontract forms the eval scores against (not redistributed here).
 *   pnpm eval:fetch
 * Each evals/real/specs/*.json names its source URL and the sha256 the labels were made against; a
 * file whose hash differs is rejected, since the labels would no longer describe it.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = path.resolve("evals/real");
mkdirSync(path.join(dir, "contracts"), { recursive: true });
let bad = 0;
for (const f of readdirSync(path.join(dir, "specs")).filter((x) => x.endsWith(".json"))) {
  const spec = JSON.parse(readFileSync(path.join(dir, "specs", f), "utf8")) as { slug: string; file: string; source: { url: string; sha256: string } };
  const out = path.join(dir, "contracts", spec.file);
  if (!existsSync(out)) {
    const res = await fetch(spec.source.url, { headers: { "User-Agent": "groundwork-eval/1.0" } });
    if (!res.ok) {
      console.error(`FAIL ${spec.slug}: HTTP ${res.status}`);
      bad++;
      continue;
    }
    writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  }
  const sha = createHash("sha256").update(readFileSync(out)).digest("hex");
  if (sha !== spec.source.sha256) {
    console.error(`FAIL ${spec.slug}: sha256 ${sha.slice(0, 12)}… does not match the labeled version ${spec.source.sha256.slice(0, 12)}…`);
    bad++;
  } else console.log(`ok   ${spec.slug}`);
}
process.exit(bad ? 1 : 0);
