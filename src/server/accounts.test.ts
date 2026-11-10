/** Password accounts: signing up, signing in, and what never works. */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ID, seedBaseline } from "@/db/seed";
import { AccountError, signUp, verifyCredentials } from "@/server/actions/accounts";
import { hashPassword, verifyPassword } from "@/server/passwords";
import { isSampleWorkspace } from "@/server/auth";

const PASSWORD = "correct horse battery";
const ada = () => ({ companyName: "  Lovelace   Construction ", name: " Ada Lovelace ", email: "  Ada@Lovelace-Construction.COM ", password: PASSWORD });

beforeAll(async () => {
  await seedBaseline(await getDb());
});

describe("password hashing", () => {
  it("salts every hash, verifies the right password and refuses the wrong one or a malformed hash", async () => {
    const [a, b] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(await verifyPassword(PASSWORD, a)).toBe(true);
    expect(await verifyPassword(PASSWORD + "!", a)).toBe(false);
    expect(await verifyPassword(PASSWORD, "not a hash")).toBe(false);
    expect(await verifyPassword(PASSWORD, "scrypt$3$8$1$c2FsdA$a2V5a2V5a2V5a2V5a2V5a2V5")).toBe(false);
  });
});

describe("signing up", () => {
  let userId: string, orgId: string;

  it("creates a general contractor's company and its first person as admin, with a clean email", async () => {
    ({ userId, orgId } = await signUp(ada()));
    const db = await getDb();
    const org = (await db.query.organizations.findFirst({ where: eq(schema.organizations.id, orgId) }))!;
    expect(org).toMatchObject({ kind: "gc", name: "Lovelace Construction", isDemo: false });
    expect(isSampleWorkspace(org)).toBe(false);
    const user = (await db.query.users.findFirst({ where: eq(schema.users.id, userId) }))!;
    expect(user).toMatchObject({ orgId, name: "Ada Lovelace", email: "ada@lovelace-construction.com", role: "admin" });
    // Stored as a salted hash, never the password.
    expect(user.passwordHash).toMatch(/^scrypt\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
  });

  it("refuses a second account for the same email, however it is typed", async () => {
    const orgs = (await (await getDb()).query.organizations.findMany()).length;
    const again = signUp({ ...ada(), companyName: "Other Co", email: "ADA@lovelace-construction.com" });
    await expect(again).rejects.toThrow(AccountError);
    await expect(again).rejects.toMatchObject({ field: "email", message: expect.stringMatching(/already exists/) });
    expect((await (await getDb()).query.organizations.findMany()).length).toBe(orgs);
  });

  it("says which field is wrong", async () => {
    await expect(signUp({ ...ada(), email: "not-an-email" })).rejects.toMatchObject({ field: "email" });
    await expect(signUp({ ...ada(), email: "grace@hopper.example" })).rejects.toMatchObject({ field: "email", message: "Enter a real email address." });
    await expect(signUp({ ...ada(), email: "grace@hopper.com", password: "too short" })).rejects.toMatchObject({ field: "password", message: expect.stringMatching(/at least 10/) });
    await expect(signUp({ ...ada(), email: "grace@hopper.com", name: "   " })).rejects.toMatchObject({ field: "name" });
    await expect(signUp({ ...ada(), email: "grace@hopper.com", companyName: "" })).rejects.toMatchObject({ field: "companyName" });
    expect(await (await getDb()).query.users.findFirst({ where: eq(schema.users.email, "grace@hopper.com") })).toBeUndefined();
  });

  it("signs in with the right password and never returns the hash", async () => {
    const user = await verifyCredentials({ email: " ADA@lovelace-construction.com", password: PASSWORD });
    expect(user).toMatchObject({ id: userId, orgId, email: "ada@lovelace-construction.com" });
    expect(user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(user)).not.toContain("scrypt");
  });

  it("answers null alike for a wrong password, an unknown email and empty input", async () => {
    expect(await verifyCredentials({ email: "ada@lovelace-construction.com", password: "wrong horse battery" })).toBeNull();
    expect(await verifyCredentials({ email: "nobody@nowhere.com", password: PASSWORD })).toBeNull();
    expect(await verifyCredentials({ email: "", password: "" })).toBeNull();
  });

  it("a sample persona has no password and cannot sign in with one", async () => {
    const db = await getDb();
    const priya = (await db.query.users.findFirst({ where: eq(schema.users.id, ID.user.priya), with: { org: true } }))!;
    expect(priya.passwordHash).toBeNull();
    expect(isSampleWorkspace(priya.org)).toBe(true);
    for (const password of ["", "null", PASSWORD]) expect(await verifyCredentials({ email: priya.email, password })).toBeNull();
  });
});
