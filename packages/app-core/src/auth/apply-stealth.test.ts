import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mock the claude-code-stealth module
vi.mock("@elizaos/agent/auth/claude-code-stealth", () => ({
  installClaudeCodeStealthFetchInterceptor: vi.fn(),
}));

describe("applyClaudeCodeStealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  test("does nothing when ANTHROPIC_API_KEY is not set", async () => {
    const { applyClaudeCodeStealth } = await import(
      "@elizaos/agent/auth/apply-stealth"
    );
    const { installClaudeCodeStealthFetchInterceptor } = await import(
      "@elizaos/agent/auth/claude-code-stealth"
    );
    applyClaudeCodeStealth();
    expect(installClaudeCodeStealthFetchInterceptor).not.toHaveBeenCalled();
  });

  test("does nothing when ANTHROPIC_API_KEY is a standard key", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-api-key";
    const { applyClaudeCodeStealth } = await import(
      "@elizaos/agent/auth/apply-stealth"
    );
    const { installClaudeCodeStealthFetchInterceptor } = await import(
      "@elizaos/agent/auth/claude-code-stealth"
    );
    applyClaudeCodeStealth();
    expect(installClaudeCodeStealthFetchInterceptor).not.toHaveBeenCalled();
  });

  test("installs interceptor for subscription tokens (sk-ant-oat)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-oat01-test";
    const { applyClaudeCodeStealth } = await import(
      "@elizaos/agent/auth/apply-stealth"
    );
    const { installClaudeCodeStealthFetchInterceptor } = await import(
      "@elizaos/agent/auth/claude-code-stealth"
    );
    applyClaudeCodeStealth();
    expect(installClaudeCodeStealthFetchInterceptor).toHaveBeenCalledTimes(1);
  });
});

describe("findProjectRoot", () => {
  let tempRoot: string | undefined;

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { force: true, recursive: true });
      tempRoot = undefined;
    }
  });

  test("returns project root when package name matches 'elizaos'", async () => {
    const { findProjectRoot } = await import(
      "@elizaos/agent/auth/apply-stealth"
    );
    tempRoot = mkdtempSync(path.join(tmpdir(), "apply-stealth-root-"));
    const nestedDir = path.join(tempRoot, "packages", "agent", "src", "auth");
    writeFileSync(
      path.join(tempRoot, "package.json"),
      JSON.stringify({ name: "elizaos" }),
      "utf8",
    );
    const result = findProjectRoot(nestedDir);
    const expectedRoot = tempRoot;
    expect(result).toBe(expectedRoot);
  });

  test("returns startDir when no matching package.json is found", async () => {
    const { findProjectRoot } = await import(
      "@elizaos/agent/auth/apply-stealth"
    );
    // Use filesystem root — no package.json with name "elizaai" there
    const result = findProjectRoot("/tmp");
    expect(result).toBe("/tmp");
  });
});
