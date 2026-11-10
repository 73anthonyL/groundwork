/**
 * The waterfall engine. Pure: no database, no clock, no randomness.
 *
 * Given one owner payment and the approved pay applications it can fund, decide how much of each
 * subcontractor's work the payment covers, how much retainage to withhold, what to release, which
 * waiver to request, and when the money is legally due. Every number carries its basis.
 *
 * Allocation is on gross: the owner pays for work in place, and the contractor withholds retainage
 * from the subcontractor's share. If the payment covers everything, everyone is fully funded;
 * otherwise it is split pro-rata by remaining gross with largest-remainder rounding, so cents are
 * never created or lost.
 */
import type { StatutoryOverlay, StatuteId } from "../statutes";
import type { TimingType } from "../rules/schema";

export type WaiverFormId = "cp_8132" | "up_8134" | "cf_8136" | "uf_8138";

export type CandidateRules = {
  timingType: TimingType | null;
  timingDays: number | null;
  agreedInWriting: boolean | null;
  retainageBps: number | null;
  capBps: number | null;
};

export type Candidate = {
  payAppId: string;
  contractId: string;
  contractSumCents: number;
  isFinal: boolean;
  /** ISO date the application was approved (fixed-day clocks run from here). */
  approvedOn: string;
  /** Gross approved for this application: work this period + stored materials. */
  grossCents: number;
  /** Gross already funded by earlier owner payments against this application. */
  fundedGrossCents: number;
  /** Retainage held to date on this contract (before this event). */
  retainageHeldToDateCents: number;
  /** Backcharges / setoffs the contractor has pinned against this application. */
  offsetCents: number;
  rules: CandidateRules;
  overlay: StatutoryOverlay;
};

/** Retainage a certification has made releasable; paid out when the payer receives retention. */
export type RetentionCandidate = {
  certificationId: string;
  contractId: string;
  amountCents: number;
  isFinal: boolean;
  /** Contract's release period in days after the payer receives retention, if stated. */
  releaseDays: number | null;
  offsetCents: number;
  overlay: StatutoryOverlay;
};

export type OwnerPayment = {
  eventId: string;
  amountCents: number;
  /** Portion of `amountCents` that is the payer's own retention coming back, not progress funding. */
  retentionCents?: number;
  receivedAt: Date;
  periodThrough: string;
  includesRetention: boolean;
  /** Pay application ids the contractor excluded from this allocation. */
  exclusions: string[];
};

export type Warning = {
  code:
    | "retainage_clamped_by_statute"
    | "retainage_cap_reached"
    | "pay_if_paid_void_in_state"
    | "pay_if_paid_honored"
    | "pay_if_paid_uncertain"
    | "contract_days_capped_by_statute"
    | "no_prompt_pay_statute"
    | "no_statute_loaded"
    | "timing_silent_default"
    | "contract_days_override_default"
    | "partial_funding"
    | "overpayment"
    | "excluded"
    | "retention_released"
    | "retention_not_funded"
    | "retainage_rate_missing";
  payAppId?: string;
  contractId?: string;
  message: string;
  statutes: StatuteId[];
};

export type Basis = {
  rulePaths: string[];
  statutes: StatuteId[];
  math: { label: string; cents: number }[];
  notes: string[];
};

export type PlannedRelease = {
  kind: "progress" | "retention";
  /** Null for a retention release. */
  payAppId: string | null;
  certificationId: string | null;
  contractId: string;
  grossCents: number;
  retainageWithheldCents: number;
  offsetCents: number;
  releaseCents: number;
  awaitingOwnerCents: number;
  /** Retainage held from earlier periods that this (final) release pays out. */
  retentionReleasedCents: number;
  payByAt: Date | null;
  retentionByAt: Date | null;
  waiverForm: WaiverFormId;
  /** Governing state, so the waiver is drafted in that state's form. */
  state: string;
  basis: Basis;
};

export type WaterfallPlan = {
  releases: PlannedRelease[];
  unfunded: { payAppId: string; contractId: string; remainingCents: number }[];
  unallocatedCents: number;
  warnings: Warning[];
};

const DAY_MS = 86_400_000;

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Business days skip Saturdays and Sundays (UTC). Holidays are not modelled. */
export function addBusinessDays(d: Date, days: number): Date {
  let out = d;
  for (let left = days; left > 0; ) {
    out = addDays(out, 1);
    const dow = out.getUTCDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return out;
}

/** Statutory periods run in the state's own unit; contract periods are calendar days. */
function addStatutory(d: Date, days: number, overlay: StatutoryOverlay): Date {
  return overlay.dayType === "business" ? addBusinessDays(d, days) : addDays(d, days);
}

const cite = (overlay: StatutoryOverlay, rule: "promptPay" | "retentionCap" | "retentionRelease" | "payIfPaid"): StatuteId[] => {
  const id = overlay.cites?.[rule] ?? (overlay.state === "CA" ? { promptPay: "CA_BPC_7108_5", retentionCap: "CA_CIV_8811", retentionRelease: "CA_CIV_8814", payIfPaid: "CA_CLARKE_V_SAFECO" }[rule] : undefined);
  return id ? [id] : [];
};

/** Split `amount` across `weights` proportionally, integer cents, largest-remainder rounding. */
export function allocateProRata(amountCents: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || amountCents <= 0) return weights.map(() => 0);
  if (amountCents >= total) return [...weights];
  const exact = weights.map((w) => (amountCents * w) / total);
  const floors = exact.map(Math.floor);
  let remainder = amountCents - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v), w: weights[i] }))
    .sort((a, b) => b.frac - a.frac || b.w - a.w || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    if (floors[i] < weights[i]) {
      floors[i] += 1;
      remainder -= 1;
    }
  }
  return floors;
}

function round(n: number): number {
  return Math.round(n);
}

export function planWaterfall(payment: OwnerPayment, candidates: Candidate[], retention: RetentionCandidate[] = []): WaterfallPlan {
  const warnings: Warning[] = [];
  const releases: PlannedRelease[] = [];
  const unfunded: WaterfallPlan["unfunded"] = [];

  const eligible = candidates.filter((c) => {
    if (payment.exclusions.includes(c.payAppId)) {
      warnings.push({
        code: "excluded",
        payAppId: c.payAppId,
        contractId: c.contractId,
        message: "Excluded from this allocation by the contractor.",
        statutes: [],
      });
      return false;
    }
    return c.grossCents - c.fundedGrossCents > 0;
  });

  const remaining = eligible.map((c) => c.grossCents - c.fundedGrossCents);
  const totalRemaining = remaining.reduce((a, b) => a + b, 0);
  // Retention the payer got back is not progress funding; only the rest is allocated to applications.
  const retentionPortion = Math.min(Math.max(0, payment.retentionCents ?? 0), payment.amountCents);
  const progressPool = payment.amountCents - retentionPortion;
  const shares = allocateProRata(progressPool, remaining);
  const allocated = shares.reduce((a, b) => a + b, 0);
  const unallocatedCents = progressPool - allocated;

  if (progressPool < totalRemaining) {
    warnings.push({
      code: "partial_funding",
      message: `Owner paid ${progressPool} of ${totalRemaining} cents outstanding; funded pro-rata by remaining gross.`,
      statutes: [],
    });
  }
  if (unallocatedCents > 0) {
    warnings.push({
      code: "overpayment",
      message: `${unallocatedCents} cents could not be matched to an approved application and stay unallocated.`,
      statutes: [],
    });
  }

  eligible.forEach((c, i) => {
    const fundedGross = shares[i];
    if (fundedGross <= 0) {
      unfunded.push({ payAppId: c.payAppId, contractId: c.contractId, remainingCents: remaining[i] });
      return;
    }
    const basis: Basis = { rulePaths: [], statutes: [], math: [], notes: [] };
    const { overlay, rules } = c;

    // ── Retainage rate: contract rate, clamped by statute if the cap applies.
    let rateBps = rules.retainageBps ?? 0;
    if (rules.retainageBps === null) {
      warnings.push({
        code: "retainage_rate_missing",
        payAppId: c.payAppId,
        contractId: c.contractId,
        message: "No retainage rate in the approved rules; withholding nothing.",
        statutes: [],
      });
      basis.notes.push("retainage.percent_bps not found → 0%");
    } else {
      basis.rulePaths.push("retainage.percent_bps");
    }
    if (overlay.retentionCapBps !== null && rateBps > overlay.retentionCapBps) {
      warnings.push({
        code: "retainage_clamped_by_statute",
        payAppId: c.payAppId,
        contractId: c.contractId,
        message: overlay.retentionCapBps === 0 ? `${overlay.state} does not allow retainage to be withheld; withholding nothing.` : `Contract retainage ${rateBps / 100}% exceeds the statutory cap of ${overlay.retentionCapBps / 100}%; withholding at the cap.`,
        statutes: cite(overlay, "retentionCap"),
      });
      basis.statutes.push(...cite(overlay, "retentionCap"));
      basis.notes.push(`retainage clamped ${rateBps}→${overlay.retentionCapBps} bps (statutory cap)`);
      rateBps = overlay.retentionCapBps;
    }

    let retainage = c.isFinal ? 0 : round((fundedGross * rateBps) / 10_000);
    if (rules.capBps !== null && !c.isFinal) {
      basis.rulePaths.push("retainage.cap_bps");
      const capCents = round((c.contractSumCents * rules.capBps) / 10_000);
      const room = Math.max(0, capCents - c.retainageHeldToDateCents);
      if (retainage > room) {
        warnings.push({
          code: "retainage_cap_reached",
          payAppId: c.payAppId,
          contractId: c.contractId,
          message: `Retainage cap of ${rules.capBps / 100}% of the subcontract sum reached; withholding ${room} cents instead of ${retainage}.`,
          statutes: [],
        });
        basis.notes.push(`cap room ${room} cents`);
        retainage = room;
      }
    }

    // ── Offsets never exceed what is left after retainage.
    const offset = Math.min(c.offsetCents, Math.max(0, fundedGross - retainage));
    if (offset > 0) basis.rulePaths.push("offsets.backcharge_setoff");

    // ── Final application: pay out retainage held to date (only when the owner released retention).
    let retentionReleased = 0;
    if (c.isFinal) {
      if (payment.includesRetention) {
        retentionReleased = c.retainageHeldToDateCents;
        basis.rulePaths.push("retainage.release_condition");
      } else {
        basis.notes.push("final application funded without retention; retainage stays held until the owner releases it");
      }
    }

    const release = fundedGross - retainage - offset + retentionReleased;
    const awaitingOwner = remaining[i] - fundedGross;

    // ── Timing: when is this money due?
    const { payByAt, retentionByAt } = computeDeadlines(payment, c, warnings, basis);

    basis.math.push(
      { label: "gross funded by this payment", cents: fundedGross },
      { label: `retainage withheld (${rateBps / 100}%)`, cents: -retainage },
      ...(offset ? [{ label: "offsets / backcharges", cents: -offset }] : []),
      ...(retentionReleased ? [{ label: "retainage released", cents: retentionReleased }] : []),
      { label: "release to subcontractor", cents: release },
      ...(awaitingOwner ? [{ label: "awaiting owner", cents: awaitingOwner }] : []),
    );

    releases.push({
      kind: "progress",
      payAppId: c.payAppId,
      certificationId: null,
      contractId: c.contractId,
      grossCents: fundedGross,
      retainageWithheldCents: retainage,
      offsetCents: offset,
      releaseCents: release,
      awaitingOwnerCents: awaitingOwner,
      retentionReleasedCents: retentionReleased,
      payByAt,
      retentionByAt,
      waiverForm: c.isFinal ? "cf_8136" : "cp_8132",
      state: overlay.state,
      basis,
    });
  });

  planRetention(payment, retention, releases, warnings);

  return { releases, unfunded, unallocatedCents, warnings };
}

/**
 * Certified retainage is paid out when the payer receives retention from upstream. The money comes
 * from retainage already held (allocation is on gross), so the trigger is the receipt, not its size.
 * The deadline is the shorter of the contract's release period and the statutory pass-through.
 */
function planRetention(payment: OwnerPayment, retention: RetentionCandidate[], releases: PlannedRelease[], warnings: Warning[]) {
  for (const c of retention) {
    if (c.amountCents <= 0) continue;
    if (!payment.includesRetention) {
      warnings.push({
        code: "retention_not_funded",
        contractId: c.contractId,
        message: `${c.amountCents} cents of retainage is certified for release and waits for the owner's retention payment.`,
        statutes: [],
      });
      continue;
    }
    const basis: Basis = { rulePaths: ["retainage.release_condition"], statutes: [], math: [], notes: [] };
    const statutory = c.overlay.retentionPassThroughDays;
    const days = statutory !== null && c.releaseDays !== null ? Math.min(statutory, c.releaseDays) : (statutory ?? c.releaseDays);
    if (c.releaseDays !== null) basis.rulePaths.push("retainage.release_days");
    if (statutory !== null && (c.releaseDays === null || statutory <= c.releaseDays)) basis.statutes.push(...cite(c.overlay, "retentionRelease"));
    const dueAt = days === null ? null : addDays(payment.receivedAt, days);
    const offset = Math.min(c.offsetCents, c.amountCents);
    if (offset > 0) basis.rulePaths.push("offsets.backcharge_setoff");
    const release = c.amountCents - offset;
    basis.math.push(
      { label: "retainage certified for release", cents: c.amountCents },
      ...(offset ? [{ label: "offsets / backcharges", cents: -offset }] : []),
      { label: "release to subcontractor", cents: release },
    );
    basis.notes.push(c.isFinal ? "final retention release" : "partial retention release on certification");
    warnings.push({
      code: "retention_released",
      contractId: c.contractId,
      message: `${c.amountCents} cents of certified retainage released on receipt of retention.`,
      statutes: basis.statutes,
    });
    releases.push({
      kind: "retention",
      payAppId: null,
      certificationId: c.certificationId,
      contractId: c.contractId,
      grossCents: 0,
      retainageWithheldCents: 0,
      offsetCents: offset,
      releaseCents: release,
      awaitingOwnerCents: 0,
      retentionReleasedCents: c.amountCents,
      payByAt: dueAt,
      retentionByAt: dueAt,
      waiverForm: c.isFinal ? "cf_8136" : "cp_8132",
      state: c.overlay.state,
      basis,
    });
  }
}

function computeDeadlines(
  payment: OwnerPayment,
  c: Candidate,
  warnings: Warning[],
  basis: Basis,
): { payByAt: Date | null; retentionByAt: Date | null } {
  const { overlay, rules } = c;
  const common = { payAppId: c.payAppId, contractId: c.contractId };
  let type = rules.timingType ?? "silent";
  basis.rulePaths.push("timing.type");

  if (type === "pay_if_paid") {
    if (overlay.payIfPaidVoid) {
      warnings.push({
        ...common,
        code: "pay_if_paid_void_in_state",
        message: `The subcontract makes owner payment a condition of paying the sub. That clause is unenforceable in ${overlay.state === "CA" ? "California" : overlay.state}; it is read as pay-when-paid and the prompt-payment clock runs.`,
        statutes: [...cite(overlay, "payIfPaid"), ...cite(overlay, "promptPay")],
      });
      basis.statutes.push(...cite(overlay, "payIfPaid"));
      basis.notes.push("pay-if-paid read as pay-when-paid (void in state)");
    } else if (overlay.payIfPaid === "limited" || overlay.payIfPaid === "unsettled") {
      warnings.push({
        ...common,
        code: "pay_if_paid_uncertain",
        message: `Pay-if-paid is ${overlay.payIfPaid} in ${overlay.state}. The clause is honored for the funded amount; confirm it can be relied on before withholding for owner non-payment.`,
        statutes: cite(overlay, "payIfPaid"),
      });
      basis.statutes.push(...cite(overlay, "payIfPaid"));
    } else {
      warnings.push({
        ...common,
        code: "pay_if_paid_honored",
        message: "Pay-if-paid clause: this owner payment satisfies the condition for the funded amount.",
        statutes: [],
      });
    }
    type = "pay_when_paid";
  }

  let payByAt: Date | null = null;
  const contractDays = rules.agreedInWriting && rules.timingDays !== null ? rules.timingDays : null;

  if (type === "fixed_days") {
    const days = rules.timingDays ?? 0;
    basis.rulePaths.push("timing.days");
    payByAt = addDays(new Date(`${c.approvedOn}T00:00:00Z`), days);
    basis.notes.push(`fixed ${days} days from approval ${c.approvedOn}`);
  } else if (overlay.loaded && overlay.progressPaymentDaysDefault !== null) {
    const statutory = overlay.progressPaymentDaysDefault;
    const byStatute = addStatutory(payment.receivedAt, statutory, overlay);
    const pp = cite(overlay, "promptPay");
    basis.statutes.push(...pp);
    if (contractDays !== null) {
      basis.rulePaths.push("timing.days", "timing.agreed_in_writing");
      const byContract = addDays(payment.receivedAt, contractDays);
      if (overlay.progressPaymentOverridable === false && byContract > byStatute) {
        // The statute sets a ceiling the contract cannot lengthen.
        payByAt = byStatute;
        warnings.push({ ...common, code: "contract_days_capped_by_statute", message: `Contract sets ${contractDays} days, but ${overlay.state} law requires payment within ${statutory}${overlay.dayType === "business" ? " business" : ""} days and the contract cannot lengthen that.`, statutes: pp });
        basis.notes.push(`contract ${contractDays} days capped at statutory ${statutory}`);
      } else {
        payByAt = byContract;
        if (contractDays !== statutory) {
          warnings.push({ ...common, code: "contract_days_override_default", message: `Contract sets ${contractDays} days, agreed in writing; the statutory default of ${statutory} does not apply.`, statutes: pp });
        }
      }
    } else {
      payByAt = byStatute;
      if (type === "silent" || rules.timingDays === null) {
        warnings.push({ ...common, code: "timing_silent_default", message: `The subcontract does not fix a payment period; the statutory ${statutory}-day clock applies.`, statutes: pp });
      }
    }
  } else {
    warnings.push(
      overlay.loaded
        ? { ...common, code: "no_prompt_pay_statute", message: `${overlay.state} has no private prompt-payment deadline for subcontractors; using contract terms only.`, statutes: [] }
        : { ...common, code: "no_statute_loaded", message: `No statutory overlay loaded for ${overlay.state}; using contract terms only.`, statutes: [] },
    );
    if (rules.timingDays !== null) {
      basis.rulePaths.push("timing.days");
      payByAt = addDays(payment.receivedAt, rules.timingDays);
    }
  }

  let retentionByAt: Date | null = null;
  if (payment.includesRetention && overlay.retentionPassThroughDays !== null) {
    retentionByAt = addDays(payment.receivedAt, overlay.retentionPassThroughDays);
    basis.statutes.push(...cite(overlay, "retentionRelease"));
  }
  return { payByAt, retentionByAt };
}
