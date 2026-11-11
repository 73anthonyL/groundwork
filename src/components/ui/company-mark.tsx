/**
 * CompanyMark: a small monogram tile for a company or a project, so a name in a table has something
 * to recognise it by. The color is picked from the name and is always the same for that name.
 *
 *   <CompanyMark name="Ironline Steel" />            // "IS" on a tinted tile, 24px
 *   <CompanyMark name="Bayview Clinic TI" size={32} />
 *
 * Decorative: always shown beside the name in text. The tints are the palette's pigments, light.
 */
const HUES = [168, 262, 80, 12, 42, 215, 130];

export function CompanyMark({ name, size = 24, className = "" }: { name: string; size?: number; className?: string }) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = ((words[0]?.[0] ?? "") + (words.length > 1 ? words[1][0] : "")).toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = HUES[h % HUES.length];
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-semibold tracking-[0.01em] ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), lineHeight: 1, background: `oklch(0.9 0.05 ${hue})`, color: `oklch(0.36 0.09 ${hue})` }}
    >
      {initials}
    </span>
  );
}
