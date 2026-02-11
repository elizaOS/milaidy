import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { isPiAiEnabledFromEnv, registerPiAiRuntime } from "./pi-ai.js";

describe("pi-ai runtime registration", () => {
  it("detects enable flag from env", () => {
    expect(isPiAiEnabledFromEnv({})).toBe(false);
    expect(isPiAiEnabledFromEnv({ MILAIDY_USE_PI_AI: "1" })).toBe(true);
    expect(isPiAiEnabledFromEnv({ MILAIDY_USE_PI_AI: "true" })).toBe(true);
    expect(isPiAiEnabledFromEnv({ MILAIDY_USE_PI_AI: "yes" })).toBe(true);
    expect(isPiAiEnabledFromEnv({ MILAIDY_USE_PI_AI: "0" })).toBe(false);
  });

  it("registers model handlers using pi settings/auth files", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "milaidy-pi-ai-"));

    // Minimal pi auth/settings files.
    await fs.writeFile(
      path.join(tmp, "auth.json"),
      JSON.stringify(
        {
          anthropic: { type: "api_key", key: "sk-ant-test-key" },
        },
        null,
        2,
      ),
      "utf8",
    );

    await fs.writeFile(
      path.join(tmp, "settings.json"),
      JSON.stringify(
        {
          defaultProvider: "anthropic",
          defaultModel: "claude-sonnet-4-20250514",
        },
        null,
        2,
      ),
      "utf8",
    );

    const saved = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = tmp;

    try {
      const registerModel = vi.fn();
      const runtime = {
        registerModel,
      } as unknown as IAgentRuntime;

      const reg = await registerPiAiRuntime(runtime);
      expect(reg.modelSpec).toBe("anthropic/claude-sonnet-4-20250514");
      expect(registerModel).toHaveBeenCalled();
    } finally {
      if (saved === undefined) {
        delete process.env.PI_CODING_AGENT_DIR;
      } else {
        process.env.PI_CODING_AGENT_DIR = saved;
      }
    }
  });
});
