import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { extractPageTexts } from "@/lib/pdf/text";
import { ruleSetFromSpec, type ContractSpec } from "./from-spec";
import { StrictRuleSetSchema, RULE_FIELDS, getField, toValues } from "./schema";
import { verifyQuote } from "@/lib/verify/quote";

const specDir = path.resolve("seed/specs");
const specs = readdirSync(specDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(path.join(specDir, f), "utf8")) as ContractSpec);

describe("rule sets built from seed specs", () => {
  for (const spec of specs) {
    it(`${spec.slug}: every anchor is a verbatim quote found in the rendered PDF`, async () => {
      const bytes = readFileSync(path.resolve("seed/contracts", spec.file));
      const { pages } = await extractPageTexts(new Uint8Array(bytes));
      const rules = ruleSetFromSpec(spec, pages);
      expect(StrictRuleSetSchema.safeParse(rules).success).toBe(true);
      for (const p of RULE_FIELDS) {
        const f = getField(rules, p);
        if (f.evidence) {
          const v = verifyQuote(pages, f.evidence.quote, f.evidence.page);
          expect(v.status, `${spec.slug} ${p}`).toBe("exact");
          expect(v.page, `${spec.slug} ${p}`).toBe(f.evidence.page);
        } else {
          expect(f.not_found, `${spec.slug} ${p} has no evidence so must be not_found`).toBe(true);
        }
      }
      expect(toValues(rules)).toEqual(spec.expected);
    });
  }
});
