import { describe, expect, it } from "vitest";
import { RULE_FIELDS, StrictRuleSetSchema } from "@/domain/rules/schema";
import { fromWire, type WireRuleSet } from "./extractRuleSet";

const entry = (path: (typeof RULE_FIELDS)[number], value: string, found = true) => ({
  path,
  found,
  value: found ? value : "",
  quote: found ? `clause for ${path}` : "",
  page: found ? 3 : 0,
  confidence: "high" as const,
  rationale: found ? "Stated plainly." : "Not stated.",
});

const wire = (over: Partial<Record<(typeof RULE_FIELDS)[number], ReturnType<typeof entry> | null>> = {}): WireRuleSet => {
  const base: Record<string, ReturnType<typeof entry>> = {
    "parties.contractor": entry("parties.contractor", "Meridian Builders"),
    "parties.subcontractor": entry("parties.subcontractor", "Ironline Steel"),
    "parties.owner": entry("parties.owner", "Bayview Health"),
    "parties.project": entry("parties.project", "Bayview Clinic TI"),
    governing_law_state: entry("governing_law_state", "ca"),
    "timing.type": entry("timing.type", "pay_when_paid"),
    "timing.days": entry("timing.days", "7"),
    "timing.agreed_in_writing": entry("timing.agreed_in_writing", "true"),
    "retainage.percent_bps": entry("retainage.percent_bps", "1,000"),
    "retainage.cap_bps": entry("retainage.cap_bps", "", false),
    "retainage.reduction_trigger": entry("retainage.reduction_trigger", "", false),
    "retainage.release_condition": entry("retainage.release_condition", "Final Completion"),
    "retainage.release_days": entry("retainage.release_days", "10"),
    "waivers.conditional_before_progress": entry("waivers.conditional_before_progress", "yes"),
    "waivers.unconditional_after_payment": entry("waivers.unconditional_after_payment", "true"),
    "waivers.lower_tier_required": entry("waivers.lower_tier_required", "false"),
    "waivers.statutory_form_required": entry("waivers.statutory_form_required", "true"),
    "offsets.joint_check": entry("offsets.joint_check", "", false),
    "offsets.backcharge_setoff": entry("offsets.backcharge_setoff", "true"),
    "offsets.withhold_defective": entry("offsets.withhold_defective", "true"),
    stored_materials: entry("stored_materials", "", false),
  };
  for (const [k, v] of Object.entries(over)) {
    if (v === null) delete base[k];
    else base[k] = v;
  }
  return { fields: Object.values(base), anomalies: [{ field: "general", description: "No audit clause.", quote: "", page: 0 }] };
};

describe("fromWire", () => {
  it("parses text values into the typed domain shape and passes the strict range checks", () => {
    const r = fromWire(wire());
    expect(StrictRuleSetSchema.safeParse(r).success).toBe(true);
    expect(r.timing.days.value).toBe(7);
    expect(r.retainage.percent_bps.value).toBe(1000);
    expect(r.waivers.conditional_before_progress.value).toBe(true);
    expect(r.waivers.lower_tier_required.value).toBe(false);
    expect(r.governing_law_state.value).toBe("CA");
    expect(r.timing.type.evidence).toMatchObject({ quote: "clause for timing.type", page: 3 });
  });

  it("treats silent and omitted fields as not found, never as a default", () => {
    const r = fromWire(wire({ "timing.days": null, "timing.type": { ...entry("timing.type", "silent"), quote: "" } }));
    expect(r.retainage.cap_bps).toEqual({ value: null, evidence: null, not_found: true });
    expect(r.timing.days.not_found).toBe(true);
    expect(r.timing.type.not_found).toBe(true);
    expect(r.anomalies[0].evidence).toBeNull();
  });

  it("keeps a value that came without a quote, with no evidence, so review escalates it", () => {
    const r = fromWire(wire({ "retainage.percent_bps": { ...entry("retainage.percent_bps", "500"), quote: " " } }));
    expect(r.retainage.percent_bps).toMatchObject({ value: 500, evidence: null, not_found: false });
  });

  it("rejects a value that does not parse instead of guessing", () => {
    expect(() => fromWire(wire({ "timing.days": entry("timing.days", "seven") }))).toThrow(/not a number/);
    expect(() => fromWire(wire({ stored_materials: entry("stored_materials", "maybe") }))).toThrow(/not true or false/);
    expect(() => fromWire(wire({ "timing.type": entry("timing.type", "net_30") }))).toThrow();
  });
});
