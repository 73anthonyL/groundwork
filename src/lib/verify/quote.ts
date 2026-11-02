/**
 * Quote verification: is the clause Claude quoted actually in the PDF?
 *
 * Both sides are normalized (NFKC, lowercase, whitespace collapsed, quotes/dashes unified, soft
 * hyphens stripped, line-break hyphenation undone). Exact match on the claimed page → "exact";
 * on an adjacent page → "exact" with the page corrected; elsewhere in the document → "exact" with
 * the page corrected and a note; otherwise a fuzzy search over windows of the quote's length with
 * normalized Levenshtein similarity ≥ 0.90 → "fuzzy"; else "unverified".
 */
import type { Verification } from "@/domain/rules/schema";

export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/­/g, "") // soft hyphen
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/(\w)-\s*\n\s*(\w)/g, "$1$2") // de-hyphenate line breaks
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

export type LocateResult = Verification & { note?: string };

export function verifyQuote(pageTexts: string[], quote: string, claimedPage: number | null): LocateResult {
  const q = normalizeForMatch(quote);
  if (!q) return { status: "none", page: null, score: null };
  const pages = pageTexts.map(normalizeForMatch);
  const idx = claimedPage !== null && claimedPage >= 1 ? claimedPage - 1 : -1;

  const exactOn = (i: number) => i >= 0 && i < pages.length && pages[i].includes(q);
  if (exactOn(idx)) return { status: "exact", page: idx + 1, score: 1 };
  for (const i of [idx - 1, idx + 1]) if (exactOn(i)) return { status: "exact", page: i + 1, score: 1, note: "page corrected" };
  for (let i = 0; i < pages.length; i++) {
    if (exactOn(i)) return { status: "exact", page: i + 1, score: 1, note: `found on page ${i + 1}, not ${claimedPage ?? "?"}` };
  }

  // Fuzzy: search the claimed page first, then the rest.
  const order = [idx, idx - 1, idx + 1, ...pages.map((_, i) => i)].filter((i, k, arr) => i >= 0 && i < pages.length && arr.indexOf(i) === k);
  let best: { page: number; score: number } | null = null;
  for (const i of order) {
    const score = bestWindowSimilarity(pages[i], q);
    if (!best || score > best.score) best = { page: i + 1, score };
    if (score >= 0.97) break;
  }
  if (best && best.score >= 0.9) return { status: "fuzzy", page: best.page, score: round3(best.score) };
  return { status: "unverified", page: null, score: best ? round3(best.score) : null };
}

/** Highest normalized similarity between `needle` and any window of similar length in `hay`. */
export function bestWindowSimilarity(hay: string, needle: string): number {
  const n = needle.length;
  if (n === 0 || hay.length === 0) return 0;
  if (hay.length <= n) return similarity(hay, needle);
  // Seed candidate positions with the rarest 3-gram of the needle, then refine around each hit.
  const grams = new Map<string, number>();
  for (let i = 0; i + 3 <= n; i++) grams.set(needle.slice(i, i + 3), (grams.get(needle.slice(i, i + 3)) ?? 0) + 1);
  const seeds = [...grams.keys()].sort((a, b) => count(hay, a) - count(hay, b)).slice(0, 3);
  const starts = new Set<number>();
  for (const g of seeds) {
    const offset = needle.indexOf(g);
    let at = hay.indexOf(g);
    let guard = 0;
    while (at !== -1 && guard++ < 200) {
      for (const delta of [-8, -4, 0, 4, 8]) {
        const s = at - offset + delta;
        if (s >= 0 && s + n <= hay.length + 8) starts.add(Math.max(0, Math.min(s, hay.length - 1)));
      }
      at = hay.indexOf(g, at + 1);
    }
  }
  if (starts.size === 0) return 0;
  let best = 0;
  for (const s of starts) {
    for (const len of [n, Math.round(n * 1.08), Math.round(n * 0.92)]) {
      const win = hay.slice(s, s + len);
      const sc = similarity(win, needle);
      if (sc > best) best = sc;
    }
  }
  return best;
}

function count(hay: string, g: string): number {
  let c = 0;
  let at = hay.indexOf(g);
  while (at !== -1 && c < 1000) {
    c++;
    at = hay.indexOf(g, at + 1);
  }
  return c;
}

/** 1 − levenshtein / max(len). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return 1 - prev[n] / Math.max(m, n);
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
