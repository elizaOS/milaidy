import { describe, expect, it } from "vitest";
import type { MiladyConfig } from "../config/config.js";
import { resolveAgentModelLabel } from "./server.js";

type RuntimeModelSource = Parameters<typeof resolveAgentModelLabel>[0];

function runtimeStub(opts?: {
  modelSetting?: unknown;
  plugins?: string[];
}): RuntimeModelSource {
  const modelSetting = opts?.modelSetting;
  const plugins = (opts?.plugins ?? []).map((name) => ({ name }));
  return {
    getSetting: (key: string) =>
      key === "MODEL_PROVIDER" ? modelSetting : undefined,
    plugins: plugins as RuntimeModelSource extends null
      ? never
      : NonNullable<RuntimeModelSource>["plugins"],
  } as RuntimeModelSource;
}

describe("resolveAgentModelLabel", () => {
  it("prefers runtime MODEL_PROVIDER setting when available", () => {
    const runtime = runtimeStub({
      modelSetting: "openrouter/deepseek/deepseek-chat",
      plugins: ["@elizaos/plugin-openai"],
    });
    const config = {
      agents: { defaults: { model: { primary: "anthropic/claude-sonnet-4" } } },
    } as MiladyConfig;

    expect(resolveAgentModelLabel(runtime, config)).toBe(
      "openrouter/deepseek/deepseek-chat",
    );
  });

  it("falls back to config defaults model when runtime setting is placeholder", () => {
    const runtime = runtimeStub({
      modelSetting: "provided",
      plugins: ["@elizaos/plugin-openai"],
    });
    const config = {
      agents: { defaults: { model: { primary: "anthropic/claude-sonnet-4" } } },
    } as MiladyConfig;

    expect(resolveAgentModelLabel(runtime, config)).toBe(
      "anthropic/claude-sonnet-4",
    );
  });

  it("falls back to cloud model selection from config when defaults model is absent", () => {
    const runtime = runtimeStub();
    const config = {
      models: { large: "openai/gpt-5" },
      cloud: { provider: "elizacloud" },
    } as MiladyConfig;

    expect(resolveAgentModelLabel(runtime, config)).toBe("openai/gpt-5");
  });

  it("maps runtime plugin aliases to supported provider ids", () => {
    const geminiRuntime = runtimeStub({
      plugins: ["@elizaos/plugin-google-genai"],
    });
    const xaiRuntime = runtimeStub({
      plugins: ["@elizaos/plugin-xai"],
    });

    expect(resolveAgentModelLabel(geminiRuntime, {} as MiladyConfig)).toBe(
      "gemini",
    );
    expect(resolveAgentModelLabel(xaiRuntime, {} as MiladyConfig)).toBe("grok");
  });

  it("returns undefined when neither runtime nor config provides model info", () => {
    const runtime = runtimeStub({ plugins: ["@elizaos/plugin-discord"] });

    expect(resolveAgentModelLabel(runtime, {} as MiladyConfig)).toBeUndefined();
  });
});
