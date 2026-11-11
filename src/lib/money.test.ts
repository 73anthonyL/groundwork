import { describe, expect, it } from "vitest";
import { dollars, formatBps, formatCents, formatCentsCompact, parseDollars } from "./money";

describe("parseDollars", () => {
  it("reads plain decimal amounts into integer cents", () => {
    expect(parseDollars("1250.50")).toBe(125_050);
    expect(parseDollars("$1,250.50")).toBe(125_050);
    expect(parseDollars(" 45,000 ")).toBe(4_500_000);
    expect(parseDollars(".5")).toBe(50);
    expect(parseDollars("12.")).toBe(1_200);
    expect(parseDollars("0")).toBe(0);
    expect(parseDollars("-20.25")).toBe(-2_025);
  });

  it("never drifts by a cent on amounts binary floating point cannot hold exactly", () => {
    for (const [text, cents] of [["0.07", 7], ["0.29", 29], ["1.15", 115], ["4.35", 435], ["19.99", 1_999], ["1005.01", 100_501], ["8192.30", 819_230], ["1234567.89", 123_456_789]] as const) {
      expect(parseDollars(text), text).toBe(cents);
    }
    for (let c = 0; c < 20_000; c += 7) expect(parseDollars(`${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`)).toBe(c);
  });

  it("is NaN for anything that is not a decimal amount", () => {
    for (const bad of ["", "   ", "abc", "12abc", "1.2.3", "--5", "Infinity", "NaN", null, undefined]) expect(parseDollars(bad), String(bad)).toBeNaN();
  });

  it("does not read hexadecimal, binary or exponent notation as money", () => {
    // Number("0x10") is 16 and Number("1e5") is 100000: a slip of the keyboard must not become a payment.
    for (const bad of ["0x10", "0b11", "0o17", "1e5", "2E3", "1e-2"]) expect(parseDollars(bad), bad).toBeNaN();
  });
});

describe("formatting", () => {
  it("formats cents as dollars", () => {
    expect(formatCents(4_500_000)).toBe("$45,000.00");
    expect(formatCents(-2_025)).toBe("-$20.25");
    expect(formatCents(1)).toBe("$0.01");
    expect(formatCentsCompact(4_500_000)).toBe("$45,000");
    expect(formatCentsCompact(4_500_050)).toBe("$45,000.50");
  });

  it("formats basis points as a percent without trailing zeros", () => {
    expect(formatBps(1000)).toBe("10%");
    expect(formatBps(550)).toBe("5.5%");
    expect(formatBps(525)).toBe("5.25%");
    expect(formatBps(0)).toBe("0%");
  });

  it("dollars() rounds to whole cents", () => {
    expect(dollars(125_000)).toBe(12_500_000);
    expect(dollars(0.1 + 0.2)).toBe(30);
    expect(Number.isInteger(dollars(19.99))).toBe(true);
  });
});
