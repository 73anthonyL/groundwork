/** Shared plumbing for the read-only JSON API under /api/v1. */
import { auth, type Session } from "@/server/auth";

export const API_VERSION = "v1";

export function json(data: unknown, init: { status?: number } = {}) {
  return Response.json({ data, meta: { version: API_VERSION, generatedAt: new Date().toISOString() } }, { status: init.status ?? 200, headers: { "cache-control": "no-store" } });
}

export function fail(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status, headers: { "cache-control": "no-store" } });
}

/** Session or a 401 response. The API never redirects. */
export async function apiSession(): Promise<Session | Response> {
  const session = await auth();
  return session ?? fail(401, "unauthenticated", "Sign in first; the API uses the same session cookie as the app.");
}
