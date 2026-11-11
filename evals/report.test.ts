import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAUGHT, contract, runOf, SILENT } from "./fixtures";
import { missKind, renderReport } from "./report";
import { parseRun } from "./run-file";
import { LAYERS, metrics } from "./score";

describe("missKind", () => {
  const f = contract("a").fields[0];
  it("separates a wrong value from a term invented or overlooked", () => {
    expect(missKind({ ...f, expected: "a", actual: "b" })).toBe("wrong value");
    expect(missKind({ ...f, expected: null, actual: "b" })).toBe("spurious value");
    expect(missKind({ ...f, expected: "a", actual: null })).toBe("missed value");
    expect(missKind({ ...f, path: "timing.type", expected: "silent", actual: "pay_if_paid" })).toBe("spurious value");
  });
});

describe("renderReport", () => {
  const run = runOf([
    contract("one", { "timing.days": SILENT, "parties.owner": { ...CAUGHT, expected: null, actual: "a | b" } }, "adversarial"),
    contract("two", {}, "clean"),
  ]);

  it("is deterministic", () => {
    expect(renderReport(run)).toBe(renderReport(structuredClone(run)));
  });

  it("lists every miss with its type and whether production flagged it", () => {
    const md = renderReport(run);
    expect(md).toContain('| one | adversarial | `timing.days` | wrong value | "x" | "y" | high | **silent** | **silent** | **silent** |');
    // A pipe inside a value must not split the table row.
    expect(md).toContain('| one | adversarial | `parties.owner` | spurious value | null | "a \\| b" | high | **silent** | **silent** | flagged |');
    expect(md).toContain("| Value accuracy | 40/42 (95.2%) |");
  });

  it("handles a run with nothing wrong and a run with nothing at all without NaN", () => {
    for (const md of [renderReport(runOf([contract("a"), contract("b")])), renderReport(runOf([]))]) {
      expect(md).not.toMatch(/NaN|undefined/);
      expect(md).toContain("## Every miss\n\nNone.");
    }
  });

  it("includes the gate verdict when given thresholds", () => {
    const md = renderReport(run, { thresholds: { minContracts: 2, minFields: 42, minAccuracy: 0.99, minQuoteVerifiedRate: 1, maxSilentErrors: 0, maxReviewBurden: 1 } });
    expect(md).toContain("Verdict: **FAIL**");
    expect(md).toContain("| Value accuracy | 95.24% (40/42) | >= 99.00% | **FAIL** |");
  });

  it("counts every field of the committed run exactly once in each breakdown", () => {
    const committed = parseRun(JSON.parse(readFileSync("evals/results/latest.json", "utf8")));
    const md = renderReport(committed);
    const total = committed.results.reduce((n, r) => n + r.fields.length, 0);
    const section = (title: string) => md.split(`## ${title}\n`)[1].split("\n## ")[0];
    const denominators = (title: string) => [...section(title).matchAll(/^\| [^|]+ \| \d+\/(\d+) /gm)].reduce((n, m) => n + Number(m[1]), 0);
    expect(denominators("By field")).toBe(total);
    expect(denominators("By field group")).toBe(total);
    const confidence = [...section("By model confidence").matchAll(/^\| (?:high|medium|low|none) \| (\d+) /gm)].reduce((n, m) => n + Number(m[1]), 0);
    expect(confidence).toBe(total);
  });
});

describe("evals/README.md", () => {
  it("states the committed run's headline figures", () => {
    const readme = readFileSync("evals/README.md", "utf8");
    const run = parseRun(JSON.parse(readFileSync("evals/results/latest.json", "utf8")));
    const m = metrics(run.results);
    const quoted = run.results.flatMap((r) => r.fields).filter((f) => f.quoted);
    const p1 = (x: number) => `${(100 * x).toFixed(1)}%`;
    for (const figure of [
      `**${m.contracts} contracts, ${m.fields} fields**`,
      `**Value accuracy ${p1(m.accuracy)}** (${m.fields - m.wrong} of ${m.fields} fields)`,
      `**Quotes verified: ${quoted.filter((f) => f.quoteVerified).length} of ${quoted.length}.**`,
      `**${m.wrong} wrong fields**`,
      `**Silent errors: ${LAYERS.map((l) => m.layers[l].silentErrors).join(" → ")}**`,
      `Review burden: ${LAYERS.map((l) => p1(m.layers[l].burden)).join(" → ")}.`,
    ]) {
      expect(readme).toContain(figure);
    }
    for (const category of new Set(run.results.map((r) => r.category))) {
      const c = metrics(run.results.filter((r) => r.category === category));
      expect(readme).toContain(`| ${category} | ${c.contracts} | ${c.fields - c.wrong}/${c.fields} | ${c.layers.L3.silentErrors} |`);
    }
  });
});

