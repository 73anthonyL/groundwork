/**
 * Password accounts: signing up creates a general contractor's company and its first person;
 * signing in checks an email and password. Pages call `verifyCredentials` and then `createSession`
 * from src/server/auth.ts with the id it returns.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import type { PublicUser } from "@/db/schema";
import type { DbLike } from "@/server/db-types";
import { hashPassword, verifyAgainstDecoy, verifyPassword } from "@/server/passwords";

export type AccountField = "companyName" | "name" | "email" | "password";

/** A sign-up or invitation input a person can fix. `message` is safe to show; `field` says where. */
export class AccountError extends Error {
  constructor(
    message: string,
    readonly field?: AccountField,
  ) {
    super(message);
    this.name = "AccountError";
  }
}

export const PASSWORD_MIN_LENGTH = 10;
export const EMAIL_TAKEN_MESSAGE = "An account with that email already exists. Sign in instead.";

/**
 * Reserved top-level domains can never receive mail. The sample workspace's people live on
 * `.example`, so refusing these also keeps a real account from ever colliding with a seeded one.
 */
const RESERVED_TLDS = new Set(["example", "test", "invalid", "localhost", "local"]);

export const emailSchema = z
  .string("Enter your email address.")
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address.").max(254, "Enter a valid email address."))
  .refine((e) => !RESERVED_TLDS.has(e.slice(e.lastIndexOf(".") + 1)), "Enter a real email address.");

export const passwordSchema = z
  .string("Enter a password.")
  .min(PASSWORD_MIN_LENGTH, `Use a password of at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(200, "Use a password of at most 200 characters.");

export const personNameSchema = z.string("Enter your name.").trim().min(1, "Enter your name.").max(120, "That name is too long.");

const signUpSchema = z.object({
  companyName: z.string("Enter your company's name.").trim().min(1, "Enter your company's name.").max(120, "That company name is too long."),
  name: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

/** Parses with a schema and turns the first problem into an AccountError naming its field. */
export function parseAccountInput<T>(s: z.ZodType<T>, input: unknown): T {
  const r = s.safeParse(input);
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  const field = typeof issue.path[0] === "string" ? (issue.path[0] as AccountField) : undefined;
  throw new AccountError(issue.message, field);
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Postgres unique violation, however the driver wraps it. */
export function isUniqueViolation(e: unknown): boolean {
  for (let x = e as { code?: unknown; cause?: unknown } | undefined, i = 0; x && i < 4; x = x.cause as typeof x, i++) {
    if (x.code === "23505") return true;
  }
  return false;
}

export function toPublicUser<U extends { passwordHash: string | null }>(user: U): Omit<U, "passwordHash"> {
  const { passwordHash: _hash, ...rest } = user;
  void _hash;
  return rest;
}

export async function findUserByEmail(tx: DbLike, email: string) {
  return (await tx.query.users.findFirst({ where: eq(schema.users.email, email), with: { org: true } })) ?? null;
}

/**
 * Creates a general contractor's company and its first person, who is its admin.
 * Throws AccountError for input a person can fix, including an email that already has an account.
 */
export async function signUp(input: { companyName: string; name: string; email: string; password: string }): Promise<{ userId: string; orgId: string }> {
  const v = parseAccountInput(signUpSchema, input);
  const passwordHash = await hashPassword(v.password);
  const db = await getDb();
  const orgId = randomUUID();
  const userId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      if (await findUserByEmail(tx, v.email)) throw new AccountError(EMAIL_TAKEN_MESSAGE, "email");
      await tx.insert(schema.organizations).values({ id: orgId, kind: "gc", name: v.companyName.replace(/\s+/g, " "), slug: `${slugify(v.companyName) || "company"}-${orgId.slice(0, 6)}`, isDemo: false });
      await tx.insert(schema.users).values({ id: userId, orgId, name: v.name.replace(/\s+/g, " "), email: v.email, role: "admin", passwordHash });
    });
  } catch (e) {
    // Two sign-ups racing for one email: the unique index decides, and the loser gets the same message.
    if (isUniqueViolation(e)) throw new AccountError(EMAIL_TAKEN_MESSAGE, "email");
    throw e;
  }
  return { userId, orgId };
}

/**
 * The user for an email and password, or null. Null covers every failure alike (unknown email, wrong
 * password, a sample persona with no password) and takes the same time, so nothing about which
 * emails exist can be learned from it. Show one message for null: "Wrong email or password."
 */
export async function verifyCredentials(input: { email: string; password: string }): Promise<PublicUser | null> {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password.slice(0, 1024) : "";
  const db = await getDb();
  const [user] = email ? await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1) : [];
  if (!user?.passwordHash) return verifyAgainstDecoy(password).then(() => null);
  return (await verifyPassword(password, user.passwordHash)) ? toPublicUser(user) : null;
}
