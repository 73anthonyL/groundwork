/**
 * Password hashing: scrypt from node:crypto, a random salt per password, constant-time comparison.
 * The stored value is one self-describing string, so the cost can be raised later without a migration:
 *   scrypt$<N>$<r>$<p>$<salt base64url>$<key base64url>
 * Hashes never leave the server and are never logged.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const N = 32768; // 2^15: about 32 MB and tens of milliseconds per hash
const R = 8;
const P = 1;
const KEY_BYTES = 64;
const SALT_BYTES = 16;

function derive(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, keylen, { ...opts, maxmem: 256 * (opts.N ?? N) * (opts.r ?? R) }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, KEY_BYTES, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** False for a wrong password and for anything that is not a well-formed hash. Never throws. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  // Bound the parameters so a corrupted row cannot ask for unbounded memory.
  if (![n, r, p].every(Number.isInteger) || n < 2 || n > 2 ** 17 || (n & (n - 1)) !== 0 || r < 1 || r > 16 || p < 1 || p > 8) return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (!salt.length || expected.length < 16 || expected.length > 128) return false;
  try {
    const key = await derive(password, salt, expected.length, { N: n, r, p });
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

let decoy: Promise<string> | undefined;

/**
 * Burns the same work as a real check and always answers false. Used when there is no hash to check
 * (unknown email, or a sample persona without a password) so the response time does not say which.
 */
export async function verifyAgainstDecoy(password: string): Promise<false> {
  decoy ??= hashPassword(randomBytes(24).toString("base64url"));
  await verifyPassword(password, await decoy);
  return false;
}
