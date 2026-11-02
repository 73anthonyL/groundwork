import { createHash } from "node:crypto";

/** Groundwork namespace for deterministic (v5) ids so seeded demo URLs are stable across resets. */
const NAMESPACE = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

function hexToBytes(hex: string): Buffer {
  return Buffer.from(hex.replace(/-/g, ""), "hex");
}

/** RFC 4122 v5 UUID from a name within the Groundwork namespace. */
export function stableId(name: string): string {
  const hash = createHash("sha1").update(hexToBytes(NAMESPACE)).update(name, "utf8").digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // variant
  const h = hash.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function sha256Hex(input: string | Buffer | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}
