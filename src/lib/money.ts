const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "$45,000.00" */
export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** "$45,000" when there are no cents, otherwise "$45,000.50". */
export function formatCentsCompact(cents: number): string {
  return cents % 100 === 0 ? usdWhole.format(cents / 100) : usd.format(cents / 100);
}

/** 1000 bps → "10%", 550 → "5.5%". */
export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0+$/, "")}%`;
}

export function dollars(n: number): number {
  return Math.round(n * 100);
}

/**
 * "$1,250.50" → 125050. NaN when the text is not a plain decimal amount. Negative amounts are allowed.
 * Only digits with an optional decimal point: Number() alone would read "0x10" as 16 and "1e5" as 100000.
 */
export function parseDollars(raw: FormDataEntryValue | string | null | undefined): number {
  const s = String(raw ?? "").replace(/[$,\s]/g, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
