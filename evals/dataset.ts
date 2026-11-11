/**
 * The eval dataset on disk: every spec (answer key) in seed/specs, evals/specs and evals/real/specs,
 * paired with the contract PDF in the sibling contracts/ folder.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { EvalSpec } from "./score";

export const SPEC_DIRS = ["seed", "evals", "evals/real"];
/** The real forms are third-party PDFs that are fetched, not committed, so a checkout may not have them. */
export const OPTIONAL_PDF_DIRS = ["evals/real"];

export type Loaded = { spec: EvalSpec; pdf: string; pdfOptional: boolean };

/**
 * Specs in a stable order: folders as listed, files by name. readdir order is the filesystem's, and
 * the bootstrap intervals and the report depend on the order of the results.
 * The slug is the cache key and the row key in the results across all three folders, so a slug used
 * twice is an error rather than two contracts sharing one cached extraction.
 */
export function loadSpecs(root: string, only?: string): Loaded[] {
  const out: Loaded[] = [];
  const seen = new Map<string, string>();
  for (const dir of SPEC_DIRS) {
    const specDir = path.resolve(root, dir, "specs");
    if (!existsSync(specDir)) continue;
    for (const f of readdirSync(specDir).filter((x) => x.endsWith(".json")).sort()) {
      const spec = JSON.parse(readFileSync(path.join(specDir, f), "utf8")) as EvalSpec;
      spec.category ??= dir === "seed" ? "demo" : "synthetic";
      const where = path.join(dir, "specs", f);
      const clash = seen.get(spec.slug);
      if (clash) throw new Error(`duplicate slug "${spec.slug}" in ${clash} and ${where}`);
      seen.set(spec.slug, where);
      if (only && !spec.slug.includes(only)) continue;
      out.push({ spec, pdf: path.resolve(root, dir, "contracts", spec.file), pdfOptional: OPTIONAL_PDF_DIRS.includes(dir) });
    }
  }
  return out;
}
