import { beforeEach, describe, expect, test, vi } from "vitest";

// Mock the claude-code-stealth module
vi.mock("@elizaos/autonomous/auth/claude-code-stealth", () => ({
  installClaudeCodeStealthFetchInterceptor: vi.fn(),
}));

describe("applyClaudeCodeStealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  test("does nothing when ANTHROPIC_API_KEY is not set", async () => {
    const { applyClaudeCodeStealth } = await import(
      "@elizaos/autonomous/auth/apply-stealth"
    );
    const { installClaudeCodeStealthFetchInterceptor } = await import(
      "@elizaos/autonomous/auth/claude-code-stealth"
    );
    applyClaudeCodeStealth();
    expect(installClaudeCodeStealthFetchInterceptor).not.toHaveBeenCalled();
  });

  test("does nothing when ANTHROPIC_API_KEY is a standard key", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-api-key";
    const { applyClaudeCodeStealth } = await import(
      "@elizaos/autonomous/auth/apply-stealth"
    );
    const { installClaudeCodeStealthFetchInterceptor } = await import(
      "@elizaos/autonomous/auth/claude-code-stealth"
    );
    applyClaudeCodeStealth();
    expect(installClaudeCodeStealthFetchInterceptor).not.toHaveBeenCalled();
  });

  test("installs interceptor for subscription tokens (sk-ant-oat)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-oat01-test";
    const { applyClaudeCodeStealth } = await import(
      "@elizaos/autonomous/auth/apply-stealth"
    );
    const { installClaudeCodeStealthFetchInterceptor } = await import(
      "@elizaos/autonomous/auth/claude-code-stealth"
    );
    applyClaudeCodeStealth();
    expect(installClaudeCodeStealthFetchInterceptor).toHaveBeenCalledTimes(1);
  });
});

describe("findProjectRoot", () => {
  test("returns startDir when package name does not match 'elizaos'", async () => {
    const { findProjectRoot } = await import(
      "@elizaos/autonomous/auth/apply-stealth"
    );
    // The milady repo has package name "miladyai", not "elizaos",
    // so findProjectRoot should fall back to startDir.
    const result = findProjectRoot(__dirname);
    expect(result).toBe(__dirname);
  });

  test("returns startDir when no matching package.json is found", async () => {
    const { findProjectRoot } = await import(
      "@elizaos/autonomous/auth/apply-stealth"
    );
    // Use filesystem root — no package.json with name "miladyai" there
    const result = findProjectRoot("/tmp");
    expect(result).toBe("/tmp");
  });
});
