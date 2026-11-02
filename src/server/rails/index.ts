import type { PaymentRail } from "./types";
import { SimulatedRail } from "./simulated";

export function railName(): string {
  return process.env.PAYMENT_RAIL === "ramp" && process.env.RAMP_CLIENT_ID ? "ramp" : "simulated";
}

export async function getRail(name = railName()): Promise<PaymentRail> {
  if (name === "ramp") {
    const { RampRail } = await import("./ramp");
    return new RampRail();
  }
  return new SimulatedRail();
}
