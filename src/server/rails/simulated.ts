/**
 * In-process rail for demos and tests. State lives in our `payments` table; the rail itself is
 * stateless and deterministic. "Settle at bank" posts a synthetic bill.paid webhook through the same
 * route a real rail would use.
 */
import type { PaymentRail, RailBillStatus, RailWebhookEvent } from "./types";

export class SimulatedRail implements PaymentRail {
  readonly name = "simulated";

  async createBill(input: { releaseId: string }) {
    return { externalBillId: `sim_${input.releaseId}`, status: "created" as RailBillStatus };
  }
  async hold() {}
  async release() {}
  async attach() {}
  async getStatus(): Promise<RailBillStatus> {
    return "held";
  }
  async parseWebhook(rawBody: string): Promise<RailWebhookEvent | null> {
    try {
      const body = JSON.parse(rawBody) as Partial<RailWebhookEvent>;
      if (!body.externalEventId || !body.externalBillId || (body.type !== "bill.paid" && body.type !== "bill.failed")) return null;
      return { externalEventId: body.externalEventId, type: body.type, externalBillId: body.externalBillId, raw: body };
    } catch {
      return null;
    }
  }
}
