import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadSpecs } from "./dataset";

const roots: string[] = [];
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

/** A throwaway dataset root: { "evals/specs/b.json": { slug: "b" }, ... }. Files are written in the order given. */
function root(files: Record<string, object>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "eval-dataset-"));
  roots.push(dir);
  for (const [rel, spec] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), JSON.stringify({ file: `${path.basename(rel, ".json")}.pdf`, ...spec }));
  }
  return dir;
}

describe("loadSpecs", () => {
  it("returns specs in a fixed order (seed, evals, evals/real; by file name) whatever order they were created in", () => {
    const dir = root({
      "evals/real/specs/r.json": { slug: "r", category: "real" },
      "evals/specs/z.json": { slug: "z", category: "clean" },
      "evals/specs/a.json": { slug: "a" },
      "seed/specs/m.json": { slug: "m" },
    });
    const specs = loadSpecs(dir);
    expect(specs.map((s) => s.spec.slug)).toEqual(["m", "a", "z", "r"]);
    expect(specs.map((s) => s.spec.category)).toEqual(["demo", "synthetic", "clean", "real"]);
    expect(specs.map((s) => s.pdfOptional)).toEqual([false, false, false, true]);
    expect(specs[0].pdf).toBe(path.join(dir, "seed", "contracts", "m.pdf"));
  });

  it("refuses a slug used twice, since the slug is the cache key", () => {
    const dir = root({ "seed/specs/x.json": { slug: "same" }, "evals/specs/y.json": { slug: "same" } });
    expect(() => loadSpecs(dir)).toThrow('duplicate slug "same"');
  });

  it("filters by --only after checking every slug", () => {
    const dir = root({ "evals/specs/a.json": { slug: "adv-one" }, "evals/specs/b.json": { slug: "clean-one" } });
    expect(loadSpecs(dir, "adv").map((s) => s.spec.slug)).toEqual(["adv-one"]);
  });

  it("the committed dataset has unique slugs", () => {
    expect(() => loadSpecs(process.cwd())).not.toThrow();
  });
});
