// Dev tool: checks the default theme's color pairs against WCAG 2 contrast minimums.
//   node scripts/contrast.mjs
// Reads the oklch() tokens from the :root block of src/app/globals.css, converts them to sRGB and
// prints each pair's ratio. Body text needs 4.5:1; large text, icons and chart marks need 3:1.
// Exits 1 if any pair is under its minimum or any token falls outside the sRGB gamut.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("\n}\n", css.indexOf(":root {")));
const tokens = {};
for (const m of root.matchAll(/--([a-z0-9-]+):\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)\s*;/g)) tokens[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];

function toLinear([L, C, H]) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const inGamut = (rgb) => rgb.every((v) => v >= -0.002 && v <= 1.002);
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((v) => Math.min(1, Math.max(0, v)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const hex = (rgb) =>
  "#" +
  rgb
    .map((v) => {
      const c = Math.min(1, Math.max(0, v));
      const e = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
      return Math.round(e * 255).toString(16).padStart(2, "0");
    })
    .join("");
const ratio = (a, b) => {
  const [x, y] = [luminance(toLinear(tokens[a])), luminance(toLinear(tokens[b]))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** [foreground, background, minimum, what it is] */
const PAIRS = [
  ["foreground", "background", 4.5, "body text on the page"],
  ["foreground", "card", 4.5, "body text on a panel"],
  ["foreground", "sidebar", 4.5, "navigation text on the sidebar"],
  ["foreground", "sidebar-accent", 4.5, "current navigation item"],
  ["muted-foreground", "background", 4.5, "secondary text on the page"],
  ["muted-foreground", "card", 4.5, "secondary text on a panel"],
  ["muted-foreground", "muted", 4.5, "secondary text on a hovered row"],
  ["muted-foreground", "sidebar", 4.5, "secondary text on the sidebar"],
  ["muted-foreground", "sidebar-accent", 4.5, "secondary text on a hovered navigation item"],
  ["foreground", "secondary", 4.5, "neutral badge, hovered secondary button"],
  ["muted-foreground", "secondary", 4.5, "neutral badge text"],
  ["primary-foreground", "primary", 4.5, "primary button label"],
  ["link", "card", 4.5, "link text"],
  ["link", "background", 4.5, "link text on the page"],
  ["link", "link-soft", 4.5, "link text on its tint"],
  ["link", "background", 3, "focus outline on the page"],
  ["money", "card", 4.5, "clock / in-motion text"],
  ["money", "background", 4.5, "in-motion text on the page"],
  ["money", "money-soft", 4.5, "in-motion badge"],
  ["settled", "card", 4.5, "paid text"],
  ["settled", "background", 4.5, "paid text on the page"],
  ["settled", "settled-soft", 4.5, "paid badge"],
  ["hold", "card", 4.5, "held text"],
  ["hold", "background", 4.5, "held text on the page"],
  ["hold", "hold-soft", 4.5, "held badge"],
  ["destructive", "card", 4.5, "error text"],
  ["destructive", "background", 4.5, "error text on the page"],
  ["destructive", "destructive-soft", 4.5, "failed badge"],
  ["signal-foreground", "signal", 4.5, "ink on the orange mark"],
  ["signal", "stage", 3, "orange mark on the dark section"],
  ["stage-foreground", "stage", 4.5, "headline on the dark section"],
  ["stage-muted", "stage", 4.5, "secondary text on the dark section"],
  ["stage-muted", "stage-deep", 4.5, "secondary text on the deep dark"],
  ["flow-moving", "card", 3, "chart mark: on its way"],
  ["flow-paid", "card", 3, "chart mark: paid"],
  ["flow-held", "card", 3, "chart mark: held"],
  ["flow-setoff", "card", 3, "chart mark: set off"],
];

let bad = 0;
for (const [name, v] of Object.entries(tokens)) {
  if (!inGamut(toLinear(v))) {
    console.log(`out of sRGB gamut: --${name} oklch(${v.join(" ")})`);
    bad++;
  }
}
for (const [fg, bg, min, what] of PAIRS) {
  if (!tokens[fg] || !tokens[bg]) {
    console.log(`missing  ${fg} / ${bg}`);
    bad++;
    continue;
  }
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)}:1  (min ${min})  ${what}  [${fg} ${hex(toLinear(tokens[fg]))} on ${bg} ${hex(toLinear(tokens[bg]))}]`);
}
console.log(bad ? `\n${bad} problem${bad === 1 ? "" : "s"}` : "\nall pairs pass");
process.exit(bad ? 1 : 0);
