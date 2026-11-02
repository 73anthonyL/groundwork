/**
 * Deterministic pay-application checks (G702/G703-shaped). Pure.
 * Every check names the rule or figure it relied on so the reviewer can see why it fired.
 */

export type CheckStatus = "pass" | "fail" | "warn";

export type Check = {
  id:
    | "rules_approved"
    | "line_math"
    | "sov_overbilling"
    | "previously_billed"
    | "retainage_rate"
    | "net_due_math"
    | "period_sequence"
    | "contract_sum";
  label: string;
  status: CheckStatus;
  detail: string;
  rulePath?: string;
  expectedCents?: number;
  actualCents?: number;
  deltaCents?: number;
  /** Values the contractor can apply with one click ("Correct to rule"). */
  correction?: { retainageCents: number; netDueCents: number };
};

export type PayAppInput = {
  number: number;
  periodThrough: string;
  isFinal: boolean;
  lines: { sovLineId: string; previouslyCompletedCents: number; thisPeriodCents: number; storedCents: number }[];
  workThisPeriodCents: number;
  storedMaterialsCents: number;
  previouslyBilledCents: number;
  retainageBilledCents: number;
  netDueBilledCents: number;
};

export type PayAppContext = {
  contractSumCents: number;
  sov: { id: string; lineNo: number; description: string; scheduledValueCents: number }[];
  /** Approved rule set values the checks cite. Null when the contract has no approved rules. */
  rules: { retainageBps: number | null; storedMaterialsAllowed: boolean | null } | null;
  /** Prior approved applications on this contract. */
  prior: { number: number; periodThrough: string; grossApprovedCents: number }[];
};

export type CheckResult = { checks: Check[]; grossCents: number; expectedRetainageCents: number; expectedNetDueCents: number; blocking: boolean };

export function runPayAppChecks(app: PayAppInput, ctx: PayAppContext): CheckResult {
  const checks: Check[] = [];
  const gross = app.workThisPeriodCents + app.storedMaterialsCents;
  const rateBps = ctx.rules?.retainageBps ?? null;
  const expectedRetainage = app.isFinal ? 0 : rateBps === null ? app.retainageBilledCents : Math.round((gross * rateBps) / 10_000);
  const expectedNet = gross - expectedRetainage;

  // 1. Approved rules exist
  checks.push(
    ctx.rules
      ? { id: "rules_approved", label: "Payment rules approved", status: "pass", detail: "An approved rule set governs this contract." }
      : {
          id: "rules_approved",
          label: "Payment rules approved",
          status: "fail",
          detail: "This contract has no approved payment rules. Compile and approve the subcontract first.",
        },
  );

  // 2. Line math
  const sumThis = app.lines.reduce((s, l) => s + l.thisPeriodCents, 0);
  const sumStored = app.lines.reduce((s, l) => s + l.storedCents, 0);
  const lineOk = sumThis === app.workThisPeriodCents && sumStored === app.storedMaterialsCents;
  checks.push({
    id: "line_math",
    label: "Line items add up",
    status: lineOk ? "pass" : "fail",
    detail: lineOk
      ? "Schedule-of-values lines total the amounts billed this period."
      : `Lines total ${sumThis} + stored ${sumStored} cents, but the application states ${app.workThisPeriodCents} + ${app.storedMaterialsCents}.`,
    expectedCents: sumThis + sumStored,
    actualCents: app.workThisPeriodCents + app.storedMaterialsCents,
  });

  // 3. Over-billing against scheduled value
  const over = app.lines
    .map((l) => {
      const sov = ctx.sov.find((s) => s.id === l.sovLineId);
      const total = l.previouslyCompletedCents + l.thisPeriodCents + l.storedCents;
      return sov && total > sov.scheduledValueCents ? { sov, total } : null;
    })
    .filter((x): x is { sov: PayAppContext["sov"][number]; total: number } => x !== null);
  checks.push(
    over.length === 0
      ? { id: "sov_overbilling", label: "No line billed past its scheduled value", status: "pass", detail: "Every line stays within its scheduled value." }
      : {
          id: "sov_overbilling",
          label: "No line billed past its scheduled value",
          status: "fail",
          detail: over.map((o) => `Line ${o.sov.lineNo} (${o.sov.description}) totals ${o.total} of ${o.sov.scheduledValueCents} cents.`).join(" "),
        },
  );

  // 4. Previously billed matches approved history
  const priorGross = ctx.prior.reduce((s, p) => s + p.grossApprovedCents, 0);
  checks.push({
    id: "previously_billed",
    label: "Previously billed matches approved history",
    status: priorGross === app.previouslyBilledCents ? "pass" : "fail",
    detail:
      priorGross === app.previouslyBilledCents
        ? `Previously billed equals the ${ctx.prior.length} approved application(s) on file.`
        : `Application states ${app.previouslyBilledCents} cents previously billed; approved history totals ${priorGross}.`,
    expectedCents: priorGross,
    actualCents: app.previouslyBilledCents,
    deltaCents: app.previouslyBilledCents - priorGross,
  });

  // 5. Retainage at the contract rate
  if (rateBps === null) {
    checks.push({
      id: "retainage_rate",
      label: "Retainage withheld at the contract rate",
      status: "warn",
      detail: "No retainage rate in the approved rules; the billed retainage is accepted as stated.",
      rulePath: "retainage.percent_bps",
    });
  } else {
    const ok = app.retainageBilledCents === expectedRetainage;
    checks.push({
      id: "retainage_rate",
      label: "Retainage withheld at the contract rate",
      status: ok ? "pass" : "fail",
      detail: ok
        ? `Retainage billed at ${rateBps / 100}%, as the subcontract requires.`
        : `Retainage billed is ${app.retainageBilledCents} cents (${pct(app.retainageBilledCents, gross)}); the subcontract requires ${rateBps / 100}% = ${expectedRetainage} cents. Net due is overstated by ${expectedRetainage - app.retainageBilledCents} cents.`,
      rulePath: "retainage.percent_bps",
      expectedCents: expectedRetainage,
      actualCents: app.retainageBilledCents,
      deltaCents: app.retainageBilledCents - expectedRetainage,
      correction: ok ? undefined : { retainageCents: expectedRetainage, netDueCents: expectedNet },
    });
  }

  // 6. Net due arithmetic (as billed)
  const netOk = app.netDueBilledCents === gross - app.retainageBilledCents;
  checks.push({
    id: "net_due_math",
    label: "Net due equals gross less retainage",
    status: netOk ? "pass" : "fail",
    detail: netOk ? "Net due is computed correctly from the billed figures." : `Net due ${app.netDueBilledCents} ≠ ${gross} − ${app.retainageBilledCents}.`,
    expectedCents: gross - app.retainageBilledCents,
    actualCents: app.netDueBilledCents,
  });

  // 7. Period and numbering sequence
  const last = ctx.prior.reduce<PayAppContext["prior"][number] | null>((m, p) => (!m || p.number > m.number ? p : m), null);
  const seqOk = (!last || (app.number === last.number + 1 && app.periodThrough > last.periodThrough)) && app.number >= 1;
  checks.push({
    id: "period_sequence",
    label: "Application number and period follow the last one",
    status: seqOk ? "pass" : "fail",
    detail: seqOk
      ? last
        ? `Follows application #${last.number} through ${last.periodThrough}.`
        : "First application on this contract."
      : `Expected #${(last?.number ?? 0) + 1} with a period after ${last?.periodThrough ?? "the start"}.`,
  });

  // 8. Contract sum not exceeded
  const toDate = priorGross + gross;
  checks.push({
    id: "contract_sum",
    label: "Total billed stays within the subcontract sum",
    status: toDate <= ctx.contractSumCents ? "pass" : "fail",
    detail: `${toDate} cents of ${ctx.contractSumCents} cents billed to date.`,
    expectedCents: ctx.contractSumCents,
    actualCents: toDate,
  });

  const blocking = checks.some((c) => c.status === "fail");
  return { checks, grossCents: gross, expectedRetainageCents: expectedRetainage, expectedNetDueCents: expectedNet, blocking };
}

function pct(part: number, whole: number): string {
  if (whole === 0) return "0%";
  const p = (part / whole) * 100;
  return `${Number.isInteger(p) ? p : p.toFixed(1)}%`;
}
