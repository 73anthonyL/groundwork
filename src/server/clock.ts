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
