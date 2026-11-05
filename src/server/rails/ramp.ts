/**
 * Ramp Bill Pay adapter, per docs.ramp.com (checked Nov 4 2026):
 *   token        POST /developer/v1/token  (client_credentials, Basic auth, scopes bills:read bills:write)
 *   createBill   POST /developer/v1/bills  — requires an existing vendor_id and entity_id; bills created
 *                via the API are auto-approved, so we only create one once Groundwork has cleared the
 *                release, and schedule it for the statutory pay-by date.
 *   attach       POST /developer/v1/bills/{id}/attachments (multipart, attachment_type)
 *   webhook      bills.paid, HMAC-SHA256 of the raw body in X-Ramp-Signature; payload.object.id is the bill.
 * There is no hold/release or bills.failed in the Developer API, so this adapter implements neither.
 *
 * Config: RAMP_CLIENT_ID, RAMP_CLIENT_SECRET, RAMP_ENTITY_ID, RAMP_VENDOR_MAP (JSON {subOrgId: vendorId}),
 * RAMP_WEBHOOK_SECRET, optional RAMP_API_BASE (default sandbox), RAMP_PAYMENT_METHOD (default ACH).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CreateBillInput, PaymentRail, RailBillStatus, RailWebhookChallenge, RailWebhookEvent } from "./types";

export function rampVendorId(subOrgId: string): string {
  let map: Record<string, string> = {};
  try {
    map = JSON.parse(process.env.RAMP_VENDOR_MAP ?? "{}");
  } catch {
    throw new Error("RAMP_VENDOR_MAP is not valid JSON");
  }
  const id = map[subOrgId];
  if (!id) throw new Error(`no Ramp vendor mapped for sub ${subOrgId}; add it to RAMP_VENDOR_MAP`);
  return id;
}

/** Ramp's line-item amount unit is not documented; we send a decimal dollar string. */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function rampBillBody(input: CreateBillInput, today: string) {
  return {
    vendor_id: rampVendorId(input.subOrgId),
    entity_id: process.env.RAMP_ENTITY_ID,
    invoice_number: input.invoiceNumber,
    invoice_currency: "USD",
    issued_at: today,
    due_at: input.payByDate,
    memo: input.memo,
    remote_id: input.releaseId,
    payment_method: process.env.RAMP_PAYMENT_METHOD ?? "ACH",
    use_default_payment_method: true,
    line_items: [{ amount: centsToDecimal(input.amountCents), memo: input.memo }],
  };
}

export function verifyRampSignature(rawBody: string, sig: string | null, secret: string | undefined): boolean {
  if (!secret || !sig) return false; // fail closed: no secret configured means nothing is trusted
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = /^[0-9a-f]{64}$/i.test(sig) ? Buffer.from(sig, "hex") : Buffer.from(sig, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export class RampRail implements PaymentRail {
  readonly name = "ramp";
  private base = process.env.RAMP_API_BASE ?? "https://demo-api.ramp.com";
  private token: { value: string; expiresAt: number } | null = null;

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const basic = Buffer.from(`${process.env.RAMP_CLIENT_ID}:${process.env.RAMP_CLIENT_SECRET}`).toString("base64");
    const res = await fetch(`${this.base}/developer/v1/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: "bills:read bills:write vendors:read" }),
    });
    if (!res.ok) throw new Error(`ramp token: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`ramp ${path}: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  async createBill(input: CreateBillInput) {
    const today = new Date().toISOString().slice(0, 10);
    const bill = await this.call<{ id: string }>("/developer/v1/bills", { method: "POST", body: JSON.stringify(rampBillBody(input, today)) });
    return { externalBillId: bill.id, status: "released" as RailBillStatus };
  }

  async attach(id: string, file: { filename: string; bytes: Uint8Array; mime: string }) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(file.bytes)] as BlobPart[], { type: file.mime }), file.filename);
    form.append("attachment_type", "FILE");
    const res = await fetch(`${this.base}/developer/v1/bills/${id}/attachments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await this.accessToken()}` },
      body: form,
    });
    if (!res.ok) throw new Error(`ramp attach: ${res.status} ${await res.text()}`);
  }

  async getStatus(id: string): Promise<RailBillStatus> {
    const bill = await this.call<{ status?: string; status_summary?: string }>(`/developer/v1/bills/${id}`);
    if (bill.status === "PAID" || bill.status_summary === "PAYMENT_COMPLETED") return "paid";
    if (bill.status_summary === "PAYMENT_ERROR") return "failed";
    if (bill.status_summary === "ON_HOLD" || bill.status_summary === "HELD_BY_PROVIDER") return "held";
    return "released";
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<RailWebhookEvent | RailWebhookChallenge | null> {
    let body: { id?: string; type?: string; challenge?: string; object?: { id?: string } };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }
    // Registration handshake: echoed back through POST /webhooks/{id}/verify, so it proves nothing by itself.
    if (body.type === "webhooks.verification" && typeof body.challenge === "string") return { challenge: body.challenge, raw: body };
    if (!verifyRampSignature(rawBody, headers.get("x-ramp-signature"), process.env.RAMP_WEBHOOK_SECRET)) return null;
    if (body.type !== "bills.paid" || !body.id || !body.object?.id) return null;
    return { externalEventId: body.id, type: "bill.paid", externalBillId: body.object.id, raw: body };
  }
}
