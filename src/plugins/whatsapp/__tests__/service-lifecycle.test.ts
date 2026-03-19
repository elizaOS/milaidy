import { describe, it, expect } from "vitest";

describe("S6: Phone number E.164 validation", () => {
  const E164_RE = /^\+?[1-9]\d{1,14}$/;

  it("accepts valid E.164 numbers", () => {
    expect(E164_RE.test("+14155552671")).toBe(true);
    expect(E164_RE.test("14155552671")).toBe(true);
    expect(E164_RE.test("+442071234567")).toBe(true);
    expect(E164_RE.test("81312345678")).toBe(true);
    expect(E164_RE.test("+12")).toBe(true); // minimum valid: + leading digit + 1 more
    expect(E164_RE.test("12")).toBe(true); // without + prefix
  });

  it("rejects numbers starting with 0", () => {
    expect(E164_RE.test("+0123456789")).toBe(false);
    expect(E164_RE.test("0123456789")).toBe(false);
  });

  it("rejects non-numeric input", () => {
    expect(E164_RE.test("abc12345678")).toBe(false);
    expect(E164_RE.test("not-a-number")).toBe(false);
    expect(E164_RE.test("")).toBe(false);
  });

  it("rejects numbers that are too long", () => {
    expect(E164_RE.test("+1234567890123456")).toBe(false); // 16 digits
    expect(E164_RE.test("12345678901234567")).toBe(false); // 17 digits
  });

  it("rejects numbers that are too short", () => {
    expect(E164_RE.test("+1")).toBe(false); // only 1 char after +
  });
});
