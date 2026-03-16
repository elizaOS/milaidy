import { describe, test, expect } from "vitest";
import { formatUptime } from "../AgentHealthCard";

describe("AgentHealthCard", () => {
  describe("formatUptime", () => {
    test("returns dash for undefined", () => {
      expect(formatUptime(undefined)).toBe("\u2014");
    });
    test("returns dash for zero", () => {
      expect(formatUptime(0)).toBe("\u2014");
    });
    test("formats seconds", () => {
      expect(formatUptime(5000)).toBe("5s");
    });
    test("formats minutes and seconds", () => {
      expect(formatUptime(125000)).toBe("2m 5s");
    });
    test("formats hours and minutes", () => {
      expect(formatUptime(3_660_000)).toBe("1h 1m");
    });
    test("formats days and hours", () => {
      expect(formatUptime(90_000_000)).toBe("1d 1h");
    });
  });
});
