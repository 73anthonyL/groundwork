/** Wall clock, overridable for demos (DEMO_NOW=2026-11-10T18:00:00Z freezes countdowns). */
export function now(): Date {
  const fixed = process.env.DEMO_NOW;
  if (fixed) {
    const d = new Date(fixed);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** True for a real calendar date written YYYY-MM-DD ("2026-02-30" and "2026-13-01" are not). */
export function isCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && isoDate(d) === s;
}
