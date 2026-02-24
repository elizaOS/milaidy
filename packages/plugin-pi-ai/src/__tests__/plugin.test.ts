import { beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import { piAiPlugin, readRuntimeModelSpec } from "../plugin.ts";

describe("piAiPlugin", () => {
  beforeEach(() => {
    delete process.env.PI_CODING_AGENT_DIR;
    delete process.env.PI_AI_MODEL_SPEC;
    delete process.env.PI_AI_SMALL_MODEL_SPEC;
    delete process.env.PI_AI_LARGE_MODEL_SPEC;
    delete process.env.PI_AI_PRIORITY;
  });

  it("exposes expected plugin metadata", () => {
    expect(piAiPlugin.name).toBe("pi-ai");
    expect(piAiPlugin.description).toContain("pi-ai provider bridge");
  });

  it("extracts MODEL_PROVIDER when it is provider/model", () => {
    const runtime = {
      getSetting: () => "openai/gpt-5",
    } as unknown as IAgentRuntime;

    expect(readRuntimeModelSpec(runtime)).toBe("openai/gpt-5");
  });

  it("ignores MODEL_PROVIDER when it is not provider/model", () => {
    const runtime = {
      getSetting: () => "claude-sonnet-4",
    } as unknown as IAgentRuntime;

    expect(readRuntimeModelSpec(runtime)).toBeUndefined();
  });

  it("initializes and registers handlers", async () => {
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

    let calls = 0;
    const runtime = {
      registerModel: () => {
        calls += 1;
      },
      getSetting: () => "anthropic/claude-sonnet-4-20250514",
    } as unknown as IAgentRuntime;

    if (!piAiPlugin.init) {
      throw new Error("piAiPlugin.init missing");
    }

    await piAiPlugin.init(
      {
        PI_CODING_AGENT_DIR: tmp,
      },
      runtime,
    );

    expect(calls).toBeGreaterThan(0);
    expect(process.env.PI_CODING_AGENT_DIR).toBeUndefined();
  });

  it("throws config error for invalid priority", async () => {
    if (!piAiPlugin.init) {
      throw new Error("piAiPlugin.init missing");
    }

    const runtime = {
      registerModel: () => undefined,
      getSetting: () => undefined,
    } as unknown as IAgentRuntime;

    await expect(
      piAiPlugin.init(
        {
          PI_AI_PRIORITY: "0",
        },
        runtime,
      ),
    ).rejects.toThrow("configuration error");
  });
});
