import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { centsToDecimal, RampRail, rampBillBody, verifyRampSignature } from "./ramp";

const SECRET = "whsec_test";
const sign = (body: string, enc: "hex" | "base64" = "hex") => createHmac("sha256", SECRET).update(body).digest(enc);
const headers = (sig?: string) => new Headers(sig ? { "x-ramp-signature": sig } : {});

afterEach(() => vi.unstubAllEnvs());

describe("centsToDecimal", () => {
  it.each([
    [0, "0.00"],
    [5, "0.05"],
    [12_345_67, "12345.67"],
    [-250, "-2.50"],
  ])("%i → %s", (c, s) => expect(centsToDecimal(c)).toBe(s));
});

describe("rampBillBody", () => {
  it("maps the sub to its Ramp vendor and schedules the statutory pay-by date", () => {
    vi.stubEnv("RAMP_VENDOR_MAP", JSON.stringify({ "org-ironline": "ven_1" }));
    vi.stubEnv("RAMP_ENTITY_ID", "ent_1");
    const body = rampBillBody(
      { releaseId: "rel-1", amountCents: 9_000_000, subOrgId: "org-ironline", vendorName: "Ironline", invoiceNumber: "rel-1", memo: "m", payByDate: "2026-11-11" },
      "2026-11-04",
    );
    expect(body).toMatchObject({ vendor_id: "ven_1", entity_id: "ent_1", invoice_number: "rel-1", invoice_currency: "USD", issued_at: "2026-11-04", due_at: "2026-11-11", remote_id: "rel-1" });
    expect(body.line_items).toEqual([{ amount: "90000.00", memo: "m" }]);
  });

  it("refuses to pay a sub with no mapped vendor", () => {
    vi.stubEnv("RAMP_VENDOR_MAP", "{}");
    expect(() => rampBillBody({ releaseId: "r", amountCents: 1, subOrgId: "x", vendorName: "X", invoiceNumber: "r", memo: "", payByDate: "2026-11-11" }, "2026-11-04")).toThrow(/no Ramp vendor/);
  });
});

describe("verifyRampSignature", () => {
  const body = '{"id":"evt_1"}';
  it("accepts hex and base64 HMAC-SHA256 of the raw body", () => {
    expect(verifyRampSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyRampSignature(body, sign(body, "base64"), SECRET)).toBe(true);
  });
  it("rejects a tampered body, a wrong signature, and a missing one", () => {
    expect(verifyRampSignature(body + " ", sign(body), SECRET)).toBe(false);
    expect(verifyRampSignature(body, "00".repeat(32), SECRET)).toBe(false);
    expect(verifyRampSignature(body, null, SECRET)).toBe(false);
  });
  it("fails closed when no secret is configured", () => {
    expect(verifyRampSignature(body, sign(body), undefined)).toBe(false);
  });
});

describe("RampRail.parseWebhook", () => {
  const rail = () => new RampRail();
  const paid = JSON.stringify({ id: "evt_9", type: "bills.paid", created_at: "2026-11-04T00:00:00Z", business_id: "b", object: { id: "bill_7" } });

  it("maps a signed bills.paid to bill.paid on object.id", async () => {
    vi.stubEnv("RAMP_WEBHOOK_SECRET", SECRET);
    expect(await rail().parseWebhook(paid, headers(sign(paid)))).toMatchObject({ externalEventId: "evt_9", type: "bill.paid", externalBillId: "bill_7" });
  });
  it("drops unsigned or forged events, and everything when no secret is set", async () => {
    vi.stubEnv("RAMP_WEBHOOK_SECRET", SECRET);
    expect(await rail().parseWebhook(paid, headers())).toBeNull();
    expect(await rail().parseWebhook(paid, headers("ab".repeat(32)))).toBeNull();
    vi.stubEnv("RAMP_WEBHOOK_SECRET", "");
    expect(await rail().parseWebhook(paid, headers(sign(paid)))).toBeNull();
  });
  it("ignores other bill events", async () => {
    vi.stubEnv("RAMP_WEBHOOK_SECRET", SECRET);
    const updated = JSON.stringify({ id: "e", type: "bills.updated", object: { id: "b" } });
    expect(await rail().parseWebhook(updated, headers(sign(updated)))).toBeNull();
  });
  it("surfaces the registration challenge", async () => {
    const v = JSON.stringify({ type: "webhooks.verification", challenge: "abc" });
    expect(await rail().parseWebhook(v, headers())).toMatchObject({ challenge: "abc" });
  });
});
