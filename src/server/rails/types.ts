/**
 * Payment rail adapter. Groundwork decides *when* and *why* money moves; the rail moves it.
 *
 * Groundwork is the hold: a bill is created on the rail only after the release is cleared (signed
 * conditional waiver whose amount matches). Rails that also support an explicit hold/release
 * (e.g. the simulated rail) implement the optional methods; Ramp's Developer API does not expose
 * bill approval or hold, so its adapter omits them and schedules payment by `payByDate` instead.
 * `invoiceNumber` is always the release id, so every webhook maps to exactly one release.
 */
export type RailBillStatus = "created" | "held" | "released" | "paid" | "failed";

export type RailWebhookEvent = {
  externalEventId: string;
  type: "bill.paid" | "bill.failed";
  externalBillId: string;
  raw: unknown;
};

/** A rail-level handshake (e.g. Ramp's webhooks.verification) rather than a payment event. */
export type RailWebhookChallenge = { challenge: string; raw: unknown };

export type CreateBillInput = {
  releaseId: string;
  amountCents: number;
  /** Our org id for the sub; the rail maps it to its own vendor record. */
  subOrgId: string;
  vendorName: string;
  invoiceNumber: string;
  memo: string;
  /** The statutory pay-by date (B&P §7108.5 clock), YYYY-MM-DD. */
  payByDate: string;
};

export interface PaymentRail {
  readonly name: string;
  createBill(input: CreateBillInput): Promise<{ externalBillId: string; status: RailBillStatus }>;
  hold?(externalBillId: string): Promise<void>;
  release?(externalBillId: string): Promise<void>;
  attach(externalBillId: string, file: { filename: string; bytes: Uint8Array; mime: string }): Promise<void>;
  getStatus(externalBillId: string): Promise<RailBillStatus>;
  /** Returns null when the signature is invalid or the event is irrelevant. */
  parseWebhook(rawBody: string, headers: Headers): Promise<RailWebhookEvent | RailWebhookChallenge | null>;
}

export function isChallenge(e: RailWebhookEvent | RailWebhookChallenge | null): e is RailWebhookChallenge {
  return !!e && "challenge" in e;
}
