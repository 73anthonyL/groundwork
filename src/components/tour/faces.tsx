/**
 * Face: a drawn cartoon portrait for each person in the sample workspace. Flat shapes, one stroke
 * weight, verdigris, vermilion and Prussian blue from the palette, plus natural skin and hair tones.
 *
 *   <Face name="Priya Natarajan" size={88} />
 *
 * A person without a drawn face gets one assembled from their name, so the picker never shows a gap.
 * The eyes blink when an ancestor has `data-face-live` and is hovered, focused or selected
 * (see `.face-eyes` in globals.css). Decorative: always pair it with the person's name in text.
 */
type Hair = "bun" | "long" | "bob" | "short" | "curly" | "side" | "none";
type Spec = {
  skin: string;
  hair: string;
  style: Hair;
  bg: string;
  shirt: string;
  glasses?: boolean;
  beard?: boolean;
  hardHat?: boolean;
  earrings?: boolean;
};

const GREEN = "oklch(0.55 0.1 170)";
const GREEN_DEEP = "oklch(0.36 0.06 165)";
const ORANGE = "oklch(0.72 0.17 45)";
const ORANGE_DEEP = "oklch(0.58 0.14 42)";
const STONE = "oklch(0.36 0.06 252)";
const CREAM = "oklch(0.92 0.03 95)";
const INK = "oklch(0.2 0.01 40)";

const SPECS: Record<string, Spec> = {
  dana: { skin: "oklch(0.86 0.05 60)", hair: "oklch(0.55 0.09 60)", style: "bob", bg: STONE, shirt: CREAM, earrings: true },
  priya: { skin: "oklch(0.66 0.08 60)", hair: "oklch(0.22 0.02 40)", style: "bun", bg: GREEN, shirt: ORANGE },
  rosa: { skin: "oklch(0.74 0.08 55)", hair: "oklch(0.3 0.04 40)", style: "long", bg: ORANGE_DEEP, shirt: GREEN_DEEP, glasses: true },
  tom: { skin: "oklch(0.82 0.06 75)", hair: "oklch(0.24 0.01 60)", style: "short", bg: STONE, shirt: GREEN, hardHat: true },
  jamal: { skin: "oklch(0.48 0.07 50)", hair: "oklch(0.2 0.01 40)", style: "curly", bg: ORANGE, shirt: STONE, beard: true },
  grant: { skin: "oklch(0.84 0.05 50)", hair: "oklch(0.72 0.01 75)", style: "side", bg: GREEN_DEEP, shirt: CREAM, glasses: true },
  marisol: { skin: "oklch(0.72 0.09 60)", hair: "oklch(0.34 0.07 35)", style: "long", bg: GREEN, shirt: CREAM, earrings: true },
};

const SKINS = ["oklch(0.86 0.05 60)", "oklch(0.74 0.08 55)", "oklch(0.62 0.08 55)", "oklch(0.48 0.07 50)"];
const HAIRS = ["oklch(0.22 0.02 40)", "oklch(0.34 0.07 35)", "oklch(0.55 0.09 60)", "oklch(0.72 0.01 75)"];
const STYLES: Hair[] = ["short", "bob", "curly", "side", "long", "bun"];
const BGS = [GREEN, STONE, ORANGE_DEEP, GREEN_DEEP];

function specFor(name: string): Spec {
  const key = name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (SPECS[key]) return SPECS[key];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { skin: SKINS[h % 4], hair: HAIRS[(h >> 2) % 4], style: STYLES[(h >> 4) % 6], bg: BGS[(h >> 7) % 4], shirt: CREAM, glasses: (h >> 9) % 3 === 0 };
}

/** Hair drawn behind the head: the long styles. */
function HairBack({ s }: { s: Spec }) {
  if (s.style === "long") return <path d="M25 44c-3-20 8-31 23-31s26 11 23 31c-1 12 1 22 4 30H21c3-8 5-18 4-30z" fill={s.hair} />;
  if (s.style === "bob") return <path d="M25 42c-2-18 9-28 23-28s25 10 23 28c-1 8 0 14 2 19H23c2-5 3-11 2-19z" fill={s.hair} />;
  if (s.style === "bun") return <circle cx="48" cy="13" r="8" fill={s.hair} />;
  return null;
}

/** Hair drawn over the forehead. */
function HairFront({ s }: { s: Spec }) {
  if (s.hardHat || s.style === "none") return null;
  switch (s.style) {
    case "curly":
      return (
        <g fill={s.hair}>
          {[
            [31, 30, 6.5],
            [38, 23, 7],
            [48, 20, 7.5],
            [58, 23, 7],
            [65, 30, 6.5],
            [29, 38, 4.5],
            [67, 38, 4.5],
          ].map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
          ))}
        </g>
      );
    case "side":
      return <path d="M28 40c-2-15 7-23 20-23 14 0 22 9 20 23-2-6-6-10-11-11-8 4-19 4-25 1-2 2-3 6-4 10z" fill={s.hair} />;
    case "long":
    case "bob":
      return <path d="M28 41c-1-14 8-23 20-23s21 9 20 23c-3-8-9-13-17-14-6 6-15 8-20 7-2 2-3 4-3 7z" fill={s.hair} />;
    default:
      return <path d="M28 40c-2-15 8-23 20-23s22 8 20 23c-3-7-9-11-20-11s-17 4-20 11z" fill={s.hair} />;
  }
}

export function Face({ name, size = 72, className }: { name: string; size?: number; className?: string }) {
  const s = specFor(name);
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} aria-hidden focusable="false" className={className} style={{ borderRadius: "9999px", flexShrink: 0 }}>
      <circle cx="48" cy="48" r="48" fill={s.bg} />
      <HairBack s={s} />
      {/* Shoulders and neck. */}
      <path d="M12 98c2-19 17-27 36-27s34 8 36 27z" fill={s.shirt} />
      <path d="M41 58h14v12c0 4-3 7-7 7s-7-3-7-7z" fill={s.skin} />
      <path d="M41 62c4 3 10 3 14 0v4c-4 3-10 3-14 0z" fill={INK} opacity="0.14" />
      {/* Ears and head. */}
      <circle cx="28.5" cy="44" r="4" fill={s.skin} />
      <circle cx="67.5" cy="44" r="4" fill={s.skin} />
      <ellipse cx="48" cy="42" rx="19.5" ry="22" fill={s.skin} />
      {s.earrings && (
        <g fill={ORANGE}>
          <circle cx="28" cy="50" r="1.8" />
          <circle cx="68" cy="50" r="1.8" />
        </g>
      )}
      {s.beard && <path d="M30 46c1 14 8 20 18 20s17-6 18-20c-3 6-8 8-12 6-3-2-9-2-12 0-4 2-9 0-12-6z" fill={s.hair} />}
      <HairFront s={s} />
      {s.hardHat && (
        <g>
          <path d="M27 36c0-13 9-21 21-21s21 8 21 21z" fill={ORANGE} />
          <path d="M44 15h8v12h-8z" fill={ORANGE_DEEP} />
          <rect x="22" y="34" width="52" height="5" rx="2.5" fill={ORANGE_DEEP} />
        </g>
      )}
      {/* Brows, eyes, mouth. */}
      <g stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.75">
        <path d="M36.5 37.5q3.5-2 7 0" />
        <path d="M52.5 37.5q3.5-2 7 0" />
      </g>
      <g className="face-eyes" fill={INK}>
        <ellipse cx="40" cy="43.5" rx="2.2" ry="2.8" />
        <ellipse cx="56" cy="43.5" rx="2.2" ry="2.8" />
      </g>
      {s.glasses && (
        <g stroke={INK} strokeWidth="1.6" fill="none">
          <rect x="33" y="38.5" width="13" height="10" rx="4" />
          <rect x="50" y="38.5" width="13" height="10" rx="4" />
          <path d="M46 43h4" />
        </g>
      )}
      <path d="M41 53.5q7 6 14 0" stroke={s.beard ? CREAM : INK} strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
