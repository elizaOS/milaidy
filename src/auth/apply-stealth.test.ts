import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mock the claude-code-stealth module
vi.mock("./claude-code-stealth", () => ({
  installClaudeCodeStealthFetchInterceptor: vi.fn(),
}));

const OPENAI_STEALTH_GUARD = Symbol.for("milady.openaiCodexStealthInstalled");

describe("applyClaudeCodeStealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  test("does nothing when ANTHROPIC_API_KEY is not set", async () => {
    const { applyClaudeCodeStealth } = await import("./apply-stealth");
    const { installClaudeCodeStealthFetchInterceptor } = await import(
      "./claude-code-stealth"
    );
    applyClaudeCodeStealth();
    expect(installClaudeCodeStealthFetchInterceptor).not.toHaveBeenCalled();
  });

  test("does nothing when ANTHROPIC_API_KEY is a standard key", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-api-key";
    const { applyClaudeCodeStealth } = await import("./apply-stealth");
    const { installClaudeCodeStealthFetchInterceptor } = await import(
      "./claude-code-stealth"
    );
    applyClaudeCodeStealth();
    expect(installClaudeCodeStealthFetchInterceptor).not.toHaveBeenCalled();
  });

  test("installs interceptor for subscription tokens (sk-ant-oat)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-oat01-test";
    const { applyClaudeCodeStealth } = await import("./apply-stealth");
    const { installClaudeCodeStealthFetchInterceptor } = await import(
      "./claude-code-stealth"
    );
    applyClaudeCodeStealth();
    expect(installClaudeCodeStealthFetchInterceptor).toHaveBeenCalledTimes(1);
  });
});

describe("findProjectRoot", () => {
  test("resolves project root by matching package name 'miladyai'", async () => {
    const { findProjectRoot } = await import("./apply-stealth");
    const result = findProjectRoot(__dirname);
    // Should walk up from src/auth/ and find the root package.json with name "miladyai"
    expect(result).not.toBe(__dirname);
    // The resolved root should contain a package.json
    const fs = await import("node:fs");
    const pkg = JSON.parse(fs.readFileSync(`${result}/package.json`, "utf-8"));
    expect(pkg.name.toLowerCase()).toBe("miladyai");
  });

  test("returns startDir when no matching package.json is found", async () => {
    const { findProjectRoot } = await import("./apply-stealth");
    // Use filesystem root — no package.json with name "miladyai" there
    const result = findProjectRoot("/tmp");
    expect(result).toBe("/tmp");
  });
});

describe("applyOpenAICodexStealth", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    // Clear the guard before each test
    delete (globalThis as Record<symbol, unknown>)[OPENAI_STEALTH_GUARD];
  });

  afterEach(() => {
    if (savedEnv.OPENAI_API_KEY !== undefined) {
      process.env.OPENAI_API_KEY = savedEnv.OPENAI_API_KEY;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    delete (globalThis as Record<symbol, unknown>)[OPENAI_STEALTH_GUARD];
  });

  test("does nothing when OPENAI_API_KEY is not set", async () => {
    const { applyOpenAICodexStealth } = await import("./apply-stealth");
    await applyOpenAICodexStealth();
    expect(
      (globalThis as Record<symbol, unknown>)[OPENAI_STEALTH_GUARD],
    ).toBeFalsy();
  });

  test("does nothing for standard API keys (sk-)", async () => {
    process.env.OPENAI_API_KEY = "sk-proj-test-key";
    const { applyOpenAICodexStealth } = await import("./apply-stealth");
    await applyOpenAICodexStealth();
    expect(
      (globalThis as Record<symbol, unknown>)[OPENAI_STEALTH_GUARD],
    ).toBeFalsy();
  });

  test("installs stealth and sets guard for JWT-style token", async () => {
    process.env.OPENAI_API_KEY = "eyJhbGciOiJSUzI1NiJ9.eyJ0ZXN0IjoxfQ.sig";
    const savedFetch = globalThis.fetch;

    try {
      const { applyOpenAICodexStealth } = await import("./apply-stealth");
      await applyOpenAICodexStealth();

      expect(
        (globalThis as Record<symbol, unknown>)[OPENAI_STEALTH_GUARD],
      ).toBe(true);
    } finally {
      // Restore fetch in case the stealth module patched it
      globalThis.fetch = savedFetch;
    }
  });

  test("symbol guard prevents double-installation", async () => {
    // Pre-set the guard
    (globalThis as Record<symbol, unknown>)[OPENAI_STEALTH_GUARD] = true;
    process.env.OPENAI_API_KEY = "eyJhbGciOiJSUzI1NiJ9.eyJ0ZXN0IjoxfQ.sig";
    const { applyOpenAICodexStealth } = await import("./apply-stealth");

    // Should return early without trying to import the .mjs file
    // (if it tried, it would throw since we're in a test environment)
    await applyOpenAICodexStealth();
    // Guard still set — function returned early
    expect((globalThis as Record<symbol, unknown>)[OPENAI_STEALTH_GUARD]).toBe(
      true,
    );
  });
});
