import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { detectRuntimeModel } from "./agent-model";

function makeRuntime(overrides: Partial<AgentRuntime>): AgentRuntime {
  return {
    plugins: [],
    ...overrides,
  } as unknown as AgentRuntime;
}

describe("detectRuntimeModel", () => {
  it("returns undefined when runtime is null", () => {
    expect(detectRuntimeModel(null)).toBeUndefined();
  });

  it("prefers explicit character.settings.model.primary", () => {
    const runtime = makeRuntime({
      character: {
        name: "Milady",
        settings: {
          model: {
            primary: "openai/gpt-5.2",
          },
        },
      } as AgentRuntime["character"],
      plugins: [{ name: "moonshot-kimi" }] as AgentRuntime["plugins"],
    });

    expect(detectRuntimeModel(runtime)).toBe("openai/gpt-5.2");
  });

  it("ignores placeholder character model and falls back to provider plugin", () => {
    const runtime = makeRuntime({
      character: {
        name: "Milady",
        settings: {
          model: {
            primary: "provided",
          },
        },
      } as AgentRuntime["character"],
      plugins: [
        { name: "@elizaos/plugin-openai-codex" },
      ] as AgentRuntime["plugins"],
    });

    expect(detectRuntimeModel(runtime)).toBe("@elizaos/plugin-openai-codex");
  });

  it("returns undefined when no model hints are available", () => {
    const runtime = makeRuntime({
      character: { name: "Milady" } as AgentRuntime["character"],
      plugins: [{ name: "plugin-random-feature" }] as AgentRuntime["plugins"],
    });

    expect(detectRuntimeModel(runtime)).toBeUndefined();
  });

  it("prefers config model.primary over plugin name scanning", () => {
    const runtime = makeRuntime({
      character: { name: "Milady" } as AgentRuntime["character"],
      plugins: [
        { name: "@elizaos/plugin-anthropic" },
      ] as AgentRuntime["plugins"],
    });
    const config = {
      agents: { defaults: { model: { primary: "openai/gpt-5.2" } } },
    };

    // Config says openai, plugin says anthropic — config should win
    expect(detectRuntimeModel(runtime, config)).toBe("openai/gpt-5.2");
  });

  it("falls back to plugin scanning when config model.primary is absent", () => {
    const runtime = makeRuntime({
      character: { name: "Milady" } as AgentRuntime["character"],
      plugins: [
        { name: "@elizaos/plugin-anthropic" },
      ] as AgentRuntime["plugins"],
    });

    expect(detectRuntimeModel(runtime, {})).toBe("@elizaos/plugin-anthropic");
  });
});
