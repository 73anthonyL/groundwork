/**
 * Regression gate: fail when the committed eval results fall below evals/thresholds.json.
 *   pnpm eval:gate [--results=<file>] [--thresholds=<file>]
 * Reads files only; never calls the model. Exit 0 when every check passes, 1 otherwise.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { evaluateGate, formatGate, ThresholdsSchema } from "../evals/gate";
import { parseRun } from "../evals/run-file";

const arg = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const resultsFile = arg("results", "evals/results/latest.json");
const thresholdsFile = arg("thresholds", "evals/thresholds.json");

try {
  const run = parseRun(JSON.parse(readFileSync(path.resolve(resultsFile), "utf8")), resultsFile);
  const thresholds = ThresholdsSchema.parse(JSON.parse(readFileSync(path.resolve(thresholdsFile), "utf8")));
  const result = evaluateGate(run, thresholds);
  console.log(`Eval gate: ${resultsFile} against ${thresholdsFile}\n`);
  console.log(formatGate(result));
  process.exit(result.pass ? 0 : 1);
} catch (e) {
  console.error(`Eval gate could not run: ${(e as Error).message}`);
  process.exit(1);
}
