import { describe, expect, it } from "vitest";
import {
  isInsufficientCreditsError,
  isInsufficientCreditsMessage,
} from "./credit-detection";

describe("isInsufficientCreditsMessage", () => {
  const shouldMatch = [
    "insufficient credits",
    "insufficient_credits",
    "insufficient quota",
    "insufficient_quota",
    "out of credits",
    "max usage reached",
    "quota exceeded",
    "rate_limit_exceeded",
    "billing is disabled",
    "payment required for this request",
    "account suspended due to billing",
    "spending limit reached",
    "budget exceeded for this month",
    "no api credits remaining",
    "credit balance zero",
  ];

  for (const msg of shouldMatch) {
    it(`matches: "${msg}"`, () => {
      expect(isInsufficientCreditsMessage(msg)).toBe(true);
    });
  }

  const shouldNotMatch = [
    "request failed",
    "internal server error",
    "model not found",
    "connection timeout",
    "invalid api key",
  ];

  for (const msg of shouldNotMatch) {
    it(`does not match: "${msg}"`, () => {
      expect(isInsufficientCreditsMessage(msg)).toBe(false);
    });
  }
});

describe("isInsufficientCreditsError", () => {
  it("detects error with matching message", () => {
    expect(isInsufficientCreditsError(new Error("insufficient credits"))).toBe(
      true,
    );
  });

  it("detects HTTP 402 Payment Required", () => {
    const err = Object.assign(new Error("Payment Required"), { status: 402 });
    expect(isInsufficientCreditsError(err)).toBe(true);
  });

  it("detects HTTP 429 with billing keyword", () => {
    const err = Object.assign(new Error("quota limit reached"), {
      status: 429,
    });
    expect(isInsufficientCreditsError(err)).toBe(true);
  });

  it("does NOT match plain 429 rate limit (no billing keyword)", () => {
    const err = Object.assign(new Error("too many requests"), { status: 429 });
    expect(isInsufficientCreditsError(err)).toBe(false);
  });

  it("detects structured error body with type insufficient_quota", () => {
    const err = {
      message: "request failed",
      error: { type: "insufficient_quota", message: "You exceeded your quota" },
    };
    expect(isInsufficientCreditsError(err)).toBe(true);
  });

  it("detects structured error body with credit-related code", () => {
    const err = {
      message: "request failed",
      error: { code: "insufficient_credits" },
    };
    expect(isInsufficientCreditsError(err)).toBe(true);
  });

  it("does not false-positive on regular errors", () => {
    expect(isInsufficientCreditsError(new Error("network timeout"))).toBe(
      false,
    );
    expect(isInsufficientCreditsError(new Error("invalid api key"))).toBe(
      false,
    );
    expect(isInsufficientCreditsError({ status: 500 })).toBe(false);
  });

  it("handles string errors", () => {
    expect(isInsufficientCreditsError("insufficient_quota")).toBe(true);
    expect(isInsufficientCreditsError("unknown error")).toBe(false);
  });

  it("handles null/undefined safely", () => {
    expect(isInsufficientCreditsError(null)).toBe(false);
    expect(isInsufficientCreditsError(undefined)).toBe(false);
  });
});
