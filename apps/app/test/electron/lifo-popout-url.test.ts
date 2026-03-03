import { describe, expect, it } from "vitest";

/**
 * `isLifoPopoutUrl` lives inside `ElectronCapacitorApp.init()` in setup.ts and
 * cannot be imported. We replicate the exact logic here for unit testing.
 */

const LIFO_POPOUT_VALUES = new Set(["", "1", "true", "lifo"]);

function isLifoPopoutFlag(value: string | null): boolean {
  if (value == null) return false;
  const normalized = value.trim().toLowerCase();
  return LIFO_POPOUT_VALUES.has(normalized);
}

function getPopoutValueFromHash(hash: string): string | null {
  if (!hash) return null;
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  const queryIndex = normalized.indexOf("?");
  if (queryIndex < 0) return null;
  return new URLSearchParams(normalized.slice(queryIndex + 1)).get("popout");
}

function isLifoPopoutUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    const searchValue = new URLSearchParams(parsed.search).get("popout");
    const hashValue = getPopoutValueFromHash(parsed.hash);
    if (!isLifoPopoutFlag(searchValue ?? hashValue)) return false;

    const hashPath = (
      parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash
    )
      .split("?")[0]
      .toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    return pathname.endsWith("/lifo") || hashPath.endsWith("/lifo");
  } catch {
    return false;
  }
}

describe("isLifoPopoutUrl", () => {
  it("returns true for http://localhost:3000/lifo?popout=lifo", () => {
    expect(isLifoPopoutUrl("http://localhost:3000/lifo?popout=lifo")).toBe(
      true,
    );
  });

  it("returns true for capacitor-electron://-#/lifo?popout=lifo", () => {
    expect(isLifoPopoutUrl("capacitor-electron://-#/lifo?popout=lifo")).toBe(
      true,
    );
  });

  it("returns true for file:///app/index.html#/lifo?popout=true", () => {
    expect(isLifoPopoutUrl("file:///app/index.html#/lifo?popout=true")).toBe(
      true,
    );
  });

  it("returns false for http://localhost:3000/stream?popout=stream (no /lifo path)", () => {
    expect(isLifoPopoutUrl("http://localhost:3000/stream?popout=stream")).toBe(
      false,
    );
  });

  it("returns false for http://localhost:3000/lifo (no popout param)", () => {
    expect(isLifoPopoutUrl("http://localhost:3000/lifo")).toBe(false);
  });

  it("returns false for http://localhost:3000?popout=lifo (no /lifo path)", () => {
    expect(isLifoPopoutUrl("http://localhost:3000?popout=lifo")).toBe(false);
  });

  it("returns false for javascript:alert(1) (catches invalid URLs)", () => {
    expect(isLifoPopoutUrl("javascript:alert(1)")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isLifoPopoutUrl("")).toBe(false);
  });
});
