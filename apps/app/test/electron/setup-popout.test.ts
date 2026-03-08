import { describe, expect, it, vi } from "vitest";

// Mock electron-is-dev before importing setup.ts — it throws outside Electron.
vi.mock("electron-is-dev", () => ({ default: false }));

import { hasPopoutParam } from "../../electron/src/setup";

describe("hasPopoutParam", () => {
  it("returns true for standard ?popout query param", () => {
    expect(hasPopoutParam("https://localhost:2138/?popout")).toBe(true);
  });

  it("returns true for ?popout with additional params", () => {
    expect(
      hasPopoutParam(
        "https://localhost:2138/?popout&apiBase=http%3A%2F%2Flocalhost%3A2138",
      ),
    ).toBe(true);
  });

  it("returns true for hash-based routing #/?popout", () => {
    expect(hasPopoutParam("capacitor-electron://-/#/?popout")).toBe(true);
  });

  it("returns true for hash-based routing with path and popout", () => {
    expect(hasPopoutParam("capacitor-electron://-/#/stream?popout")).toBe(true);
  });

  it("returns false when popout is absent", () => {
    expect(hasPopoutParam("https://localhost:2138/")).toBe(false);
  });

  it("returns false for hash route without popout", () => {
    expect(hasPopoutParam("capacitor-electron://-/#/chat")).toBe(false);
  });

  it("returns false for popout as a path segment (not a param)", () => {
    expect(hasPopoutParam("https://localhost:2138/popout")).toBe(false);
  });

  it("returns false for malformed URL", () => {
    expect(hasPopoutParam("not a valid url")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(hasPopoutParam("")).toBe(false);
  });
});
