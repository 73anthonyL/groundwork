/**
 * Ramp Bills adapter (stretch). Maps the engine's primitives onto Ramp's developer API:
 *   createBill → POST /developer/v1/bills (bills are auto-approved, so we hold immediately)
 *   hold/release → POST /developer/v1/bills/{id}/hold | /release
 *   attach → POST /developer/v1/bills/{id}/attachments
 *   webhook → bills.paid (HMAC-signed)
 * Not exercised unless PAYMENT_RAIL=ramp and sandbox credentials exist.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentRail, RailBillStatus, RailWebhookEvent } from "./types";

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
      body: new URLSearchParams({ grant_type: "client_credentials", scope: "bills:read bills:write" }),
    });
    if (!res.ok) throw new Error(`ramp token: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`ramp ${path}: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  async createBill(input: { releaseId: string; amountCents: number; vendorName: string; invoiceNumber: string; memo: string }) {
    const bill = await this.call<{ id: string }>("/developer/v1/bills", {
      method: "POST",
      body: JSON.stringify({
        invoice_number: input.invoiceNumber,
        amount: { amount: input.amountCents, currency_code: "USD" },
        memo: input.memo,
        vendor_name: input.vendorName,
      }),
    });
    return { externalBillId: bill.id, status: "created" as RailBillStatus };
  }
  async hold(id: string) {
    await this.call(`/developer/v1/bills/${id}/hold`, { method: "POST", body: "{}" });
  }
  async release(id: string) {
    await this.call(`/developer/v1/bills/${id}/release`, { method: "POST", body: "{}" });
  }
  async attach(id: string, file: { filename: string; bytes: Uint8Array; mime: string }) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(file.bytes)] as BlobPart[], { type: file.mime }), file.filename);
    const res = await fetch(`${this.base}/developer/v1/bills/${id}/attachments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await this.accessToken()}` },
      body: form,
    });
    if (!res.ok) throw new Error(`ramp attach: ${res.status}`);
  }
  async getStatus(id: string): Promise<RailBillStatus> {
    const bill = await this.call<{ status: string }>(`/developer/v1/bills/${id}`);
    const s = bill.status.toLowerCase();
    if (s.includes("paid")) return "paid";
    if (s.includes("hold")) return "held";
    if (s.includes("fail") || s.includes("reject")) return "failed";
    return "released";
  }
  async parseWebhook(rawBody: string, headers: Headers): Promise<RailWebhookEvent | null> {
    const secret = process.env.RAMP_WEBHOOK_SECRET;
    const sig = headers.get("ramp-signature") ?? headers.get("x-ramp-signature");
    if (secret && sig) {
      const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
      const a = Buffer.from(expected);
      const b = Buffer.from(sig);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    } else if (secret) {
      return null;
    }
    const body = JSON.parse(rawBody) as { id: string; type: string; data?: { id?: string } };
    if (body.type !== "bills.paid" && body.type !== "bills.failed") return null;
    return {
      externalEventId: body.id,
      type: body.type === "bills.paid" ? "bill.paid" : "bill.failed",
      externalBillId: body.data?.id ?? "",
      raw: body,
    };
  }
}
