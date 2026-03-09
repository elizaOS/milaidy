import { describe, expect, it } from "vitest";
import { sanitizeLinkHref } from "./ui-renderer";

describe("sanitizeLinkHref", () => {
  it("blocks executable protocols", () => {
    expect(sanitizeLinkHref("javascript:alert(1)")).toBe("#");
    expect(sanitizeLinkHref(" data:text/html,<svg/onload=alert(1)>")).toBe("#");
    expect(sanitizeLinkHref("VBSCRIPT:msgbox(1)")).toBe("#");
  });

  it("preserves safe links", () => {
    expect(sanitizeLinkHref("https://example.com")).toBe("https://example.com");
    expect(sanitizeLinkHref("mailto:test@example.com")).toBe(
      "mailto:test@example.com",
    );
    expect(sanitizeLinkHref("/settings")).toBe("/settings");
    expect(sanitizeLinkHref("#section")).toBe("#section");
  });

  it("falls back safely for blank values", () => {
    expect(sanitizeLinkHref("")).toBe("#");
    expect(sanitizeLinkHref(undefined)).toBe("#");
  });
});
