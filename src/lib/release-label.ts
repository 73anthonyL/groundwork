/** "Pay app #2" for a progress release, "Retention release" for retainage paid out on a certification. */
export function releaseLabel(r: { kind?: string | null; payApplication?: { number: number } | null }, opts: { lower?: boolean } = {}): string {
  const s = r.payApplication ? `Pay app #${r.payApplication.number}` : r.kind === "retention" ? "Retention release" : "Release";
  return opts.lower ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
