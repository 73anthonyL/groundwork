/**
 * Payment rail adapter. Groundwork decides *when* and *why* money moves; the rail moves it.
 * `invoiceNumber` is always the release id, so every webhook maps to exactly one release.
 */
export type RailBillStatus = "created" | "held" | "released" | "paid" | "failed";

export type RailWebhookEvent = {
  externalEventId: string;
  type: "bill.paid" | "bill.failed";
  externalBillId: string;
  raw: unknown;
};

export interface PaymentRail {
  readonly name: string;
  createBill(input: {
    releaseId: string;
    amountCents: number;
    vendorName: string;
    invoiceNumber: string;
    memo: string;
  }): Promise<{ externalBillId: string; status: RailBillStatus }>;
  hold(externalBillId: string): Promise<void>;
  release(externalBillId: string): Promise<void>;
  attach(externalBillId: string, file: { filename: string; bytes: Uint8Array; mime: string }): Promise<void>;
  getStatus(externalBillId: string): Promise<RailBillStatus>;
  /** Returns null when the signature is invalid or the event is irrelevant. */
  parseWebhook(rawBody: string, headers: Headers): Promise<RailWebhookEvent | null>;
}
