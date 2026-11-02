import { describe, expect, it } from "vitest";
import { normalizeForMatch, similarity, verifyQuote } from "./quote";

const pages = [
  "ARTICLE 5 — PROGRESS PAYMENTS\n5.1 Subject to the other provisions of this Subcontract, Contractor shall pay Subcontractor, within seven (7) days after Contractor receives payment from Owner on account of the Subcontract Work covered by Subcontractor's application, the amount approved.",
  "ARTICLE 6 — RETENTION\n6.1 Contractor shall withhold from each progress payment retention equal to ten percent (10%) of the amount other-\nwise due to Subcontractor. Retention is not held in a separate account.",
];

describe("verifyQuote", () => {
  it("finds an exact quote on the claimed page", () => {
    const r = verifyQuote(pages, "within seven (7) days after Contractor receives payment from Owner", 1);
    expect(r).toMatchObject({ status: "exact", page: 1, score: 1 });
  });
  it("corrects the page when the quote is on the adjacent page", () => {
    const r = verifyQuote(pages, "retention equal to ten percent (10%)", 1);
    expect(r).toMatchObject({ status: "exact", page: 2 });
  });
  it("normalizes curly quotes, dashes, whitespace and line-break hyphenation", () => {
    expect(normalizeForMatch("the amount other-\nwise due")).toBe("the amount otherwise due");
    const r = verifyQuote(pages, "ten  percent (10%) of the amount otherwise due to Subcontractor", 2);
    expect(r.status).toBe("exact");
    const curly = verifyQuote(pages, "covered by Subcontractor’s application, the amount approved", 1);
    expect(curly.status).toBe("exact");
  });
  it("accepts a near miss as fuzzy and rejects a fabrication", () => {
    const near = verifyQuote(pages, "Contractor shall withhold from each progress payment retention equal to ten percent (10%) of the amount due to Subcontractor", 2);
    expect(near.status).toBe("fuzzy");
    expect(near.score!).toBeGreaterThanOrEqual(0.9);
    const fake = verifyQuote(pages, "Contractor shall pay Subcontractor within thirty (30) days regardless of payment by Owner, with interest at 12%", 1);
    expect(fake.status).toBe("unverified");
  });
  it("similarity is symmetric-ish and bounded", () => {
    expect(similarity("abc", "abc")).toBe(1);
    expect(similarity("abc", "abd")).toBeCloseTo(2 / 3);
    expect(similarity("", "abc")).toBe(0);
  });
});
