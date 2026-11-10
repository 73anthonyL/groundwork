/** Small formatters shared by the subcontractor, owner and no-account signing pages. */
import { statute } from "@/domain/statutes";

export const isPaid = (status: string) => status === "paid" || status === "settled";

/** Money still owed on a payment: not landed, and not a zero-amount hold. */
export const isOnItsWay = (r: { status: string; releaseCents: number }) => !isPaid(r.status) && r.releaseCents > 0;

/** "Nov 14" */
export const shortDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** "Nov 14, 2026" */
export const fullDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "Friday, November 14" */
export const longDay = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

/** A YYYY-MM-DD date column as "Oct 31, 2026", without shifting it across a time zone. */
export const isoDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "in 3 days", "today", "6 days ago". */
export function relativeDays(to: Date, from: Date): string {
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** Where a payment deadline comes from, in words: the statutes the engine cited, or the subcontract. */
export function deadlineSource(basis: unknown): string {
  const ids = [...new Set((basis as { statutes?: string[] } | null)?.statutes ?? [])];
  const cites = ids.map((id) => statute(id).cite).filter(Boolean);
  return cites.length ? `your subcontract and ${cites.join(", ")}` : "your subcontract";
}

/** Retainage still held on a payment: what was withheld less what a later certification released. */
export const retainageHeld = (r: { retainageWithheldCents: number; basis: unknown }) =>
  r.retainageWithheldCents - ((r.basis as { retentionReleasedCents?: number } | null)?.retentionReleasedCents ?? 0);

/** "conditional" or "unconditional" from a waiver form id. */
export const isConditional = (form: string) => form.startsWith("c");
