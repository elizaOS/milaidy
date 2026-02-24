import { describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import { isPiAiEnabledFromEnv, registerPiAiRuntime } from "../runtime.ts";

describe("pi-ai runtime registration", () => {
  it("detects enable flag from env", () => {
    expect(isPiAiEnabledFromEnv({})).toBe(false);
    expect(isPiAiEnabledFromEnv({ MILAIDY_USE_PI_AI: "1" })).toBe(true);
    expect(isPiAiEnabledFromEnv({ MILAIDY_USE_PI_AI: "true" })).toBe(true);
    expect(isPiAiEnabledFromEnv({ MILAIDY_USE_PI_AI: "yes" })).toBe(true);
    expect(isPiAiEnabledFromEnv({ MILAIDY_USE_PI_AI: "0" })).toBe(false);
  });

  it("registers model handlers using pi settings/auth files", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-pi-ai-"));

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

    const registerModel = () => undefined;
    const runtime = {
      registerModel,
    } as unknown as IAgentRuntime;

    const reg = await registerPiAiRuntime(runtime, { agentDir: tmp });
    expect(reg.modelSpec).toBe("anthropic/claude-sonnet-4-20250514");
    expect(reg.provider).toBe("anthropic");
  });

  it("falls back to pi settings default when modelSpec provider has no credentials", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-pi-ai-"));

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

    const runtime = {
      registerModel: () => undefined,
    } as unknown as IAgentRuntime;

    const reg = await registerPiAiRuntime(runtime, {
      modelSpec: "openai-codex/gpt-5.3-codex",
      agentDir: tmp,
    });

    expect(reg.modelSpec).toBe("anthropic/claude-sonnet-4-20250514");
    expect(reg.provider).toBe("anthropic");
  });

  it("uses modelSpec when provider has valid credentials", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-pi-ai-"));

    await fs.writeFile(
      path.join(tmp, "auth.json"),
      JSON.stringify(
        {
          anthropic: { type: "api_key", key: "sk-ant-test-key" },
          "openai-codex": { type: "api_key", key: "sk-codex-test" },
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

    const runtime = {
      registerModel: () => undefined,
    } as unknown as IAgentRuntime;

    const reg = await registerPiAiRuntime(runtime, {
      modelSpec: "openai-codex/gpt-5.3-codex",
      agentDir: tmp,
    });

    expect(reg.modelSpec).toBe("openai-codex/gpt-5.3-codex");
    expect(reg.provider).toBe("openai-codex");
  });
});
