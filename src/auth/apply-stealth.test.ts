import { beforeEach, describe, expect, test, vi } from "vitest";

// Mock the claude-code-stealth module
vi.mock("@miladyai/autonomous/auth/claude-code-stealth", () => ({
  installClaudeCodeStealthFetchInterceptor: vi.fn(),
}));

describe("applyClaudeCodeStealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  test("does nothing when ANTHROPIC_API_KEY is not set", async () => {
    const { applyClaudeCodeStealth } = await import(
      "@miladyai/autonomous/auth/apply-stealth"
    );
    const { installClaudeCodeStealthFetchInterceptor } = await import(
      "@miladyai/autonomous/auth/claude-code-stealth"
    );
    applyClaudeCodeStealth();
    expect(installClaudeCodeStealthFetchInterceptor).not.toHaveBeenCalled();
  });

  test("does nothing when ANTHROPIC_API_KEY is a standard key", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-api-key";
    const { applyClaudeCodeStealth } = await import(
      "@miladyai/autonomous/auth/apply-stealth"
    );
    const { installClaudeCodeStealthFetchInterceptor } = await import(
      "@miladyai/autonomous/auth/claude-code-stealth"
    );
    applyClaudeCodeStealth();
    expect(installClaudeCodeStealthFetchInterceptor).not.toHaveBeenCalled();
  });

  test("installs interceptor for subscription tokens (sk-ant-oat)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-oat01-test";
    const { applyClaudeCodeStealth } = await import(
      "@miladyai/autonomous/auth/apply-stealth"
    );
    const { installClaudeCodeStealthFetchInterceptor } = await import(
      "@miladyai/autonomous/auth/claude-code-stealth"
    );
    applyClaudeCodeStealth();
    expect(installClaudeCodeStealthFetchInterceptor).toHaveBeenCalledTimes(1);
  });
});

describe("findProjectRoot", () => {
  test("resolves project root by matching package name 'miladyai'", async () => {
    const { findProjectRoot } = await import(
      "@miladyai/autonomous/auth/apply-stealth"
    );
    const result = findProjectRoot(__dirname);
    // Should walk up from src/auth/ and find the root package.json with name "miladyai"
    expect(result).not.toBe(__dirname);
    // The resolved root should contain a package.json
    const fs = await import("node:fs");
    const pkg = JSON.parse(fs.readFileSync(`${result}/package.json`, "utf-8"));
    expect(pkg.name.toLowerCase()).toBe("miladyai");
  });

  test("returns startDir when no matching package.json is found", async () => {
    const { findProjectRoot } = await import(
      "@miladyai/autonomous/auth/apply-stealth"
    );
    // Use filesystem root — no package.json with name "miladyai" there
    const result = findProjectRoot("/tmp");
    expect(result).toBe("/tmp");
  });
});
