import { describe, expect, it } from "vitest";
import type { IAgentRuntime } from "@elizaos/core";
import { SUMMARY_CHAR_LIMIT } from "../../contracts/awareness";
import { builtinContributors } from "./index";

function fakeRuntime(overrides: Record<string, unknown> = {}): IAgentRuntime {
  return {
    plugins: overrides.plugins ?? [],
    character: overrides.character ?? { settings: { model: "claude-opus-4-6" } },
    getSetting: (key: string) =>
      (overrides.settings as Record<string, string>)?.[key] ?? null,
    clients: overrides.clients ?? [],
    ...overrides,
  } as unknown as IAgentRuntime;
}

describe("built-in contributors", () => {
  it("exports exactly 9 contributors", () => {
    expect(builtinContributors).toHaveLength(9);
  });

  it("all have unique IDs", () => {
    const ids = builtinContributors.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all are marked trusted", () => {
    for (const c of builtinContributors) {
      expect(c.trusted).toBe(true);
    }
  });

  it("all summaries return <= 80 chars", async () => {
    const runtime = fakeRuntime();
    for (const c of builtinContributors) {
      const summary = await c.summary(runtime);
      expect(
        summary.length,
        `${c.id} summary is ${summary.length} chars: "${summary}"`,
      ).toBeLessThanOrEqual(SUMMARY_CHAR_LIMIT);
    }
  });

  it("all summaries return plain text without secrets", async () => {
    const runtime = fakeRuntime({
      settings: {
        ANTHROPIC_API_KEY: "sk-ant-test123456",
        EVM_PRIVATE_KEY: "0x" + "a".repeat(64),
      },
    });
    for (const c of builtinContributors) {
      const summary = await c.summary(runtime);
      expect(summary).not.toMatch(/sk-ant/);
      expect(summary).not.toMatch(/private.?key/i);
      expect(summary).not.toMatch(/0x[a-f0-9]{64}/i);
    }
  });

  it("positions are in expected order", () => {
    const ids = builtinContributors
      .sort((a, b) => a.position - b.position)
      .map((c) => c.id);
    expect(ids).toEqual([
      "runtime",
      "permissions",
      "wallet",
      "opinion",
      "provider",
      "pluginHealth",
      "connectors",
      "cloud",
      "features",
    ]);
  });

  it("each contributor has invalidateOn events", () => {
    for (const c of builtinContributors) {
      expect(c.invalidateOn, `${c.id} missing invalidateOn`).toBeDefined();
      expect(c.invalidateOn!.length).toBeGreaterThan(0);
    }
  });
});
