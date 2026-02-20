import { describe, expect, it } from "vitest";
import { resolveTuiModelSpec } from "./model-spec";

describe("resolveTuiModelSpec", () => {
  it("prefers explicit model override when provider has credentials", () => {
    const modelSpec = resolveTuiModelSpec({
      modelOverride: "openai/gpt-5",
      runtimeModelSpec: "anthropic/claude-sonnet-4-20250514",
      piDefaultModelSpec: "anthropic/claude-sonnet-4-20250514",
      hasCredentials: (provider) => provider === "openai",
    });

    expect(modelSpec).toBe("openai/gpt-5");
  });

  it("uses config primary model before runtime MODEL_PROVIDER", () => {
    const modelSpec = resolveTuiModelSpec({
      configPrimaryModelSpec: "openai/gpt-5",
      runtimeModelSpec: "anthropic/claude-sonnet-4-20250514",
      piDefaultModelSpec: "anthropic/claude-sonnet-4-20250514",
      hasCredentials: () => true,
    });

    expect(modelSpec).toBe("openai/gpt-5");
  });

  it("uses config PI_AI_MODEL_SPEC when primary model is not set", () => {
    const modelSpec = resolveTuiModelSpec({
      configPiAiModelSpec: "openai/gpt-5",
      runtimeModelSpec: "anthropic/claude-sonnet-4-20250514",
      piDefaultModelSpec: "anthropic/claude-sonnet-4-20250514",
      hasCredentials: () => true,
    });

    expect(modelSpec).toBe("openai/gpt-5");
  });

  it("falls back to pi default when requested provider lacks credentials", () => {
    const modelSpec = resolveTuiModelSpec({
      runtimeModelSpec: "openai/gpt-5",
      piDefaultModelSpec: "anthropic/claude-sonnet-4-20250514",
      hasCredentials: (provider) => provider === "anthropic",
    });

    expect(modelSpec).toBe("anthropic/claude-sonnet-4-20250514");
  });

  it("ignores invalid requested/default specs and uses safe fallback", () => {
    const modelSpec = resolveTuiModelSpec({
      modelOverride: "not-a-model-spec",
      runtimeModelSpec: "also-invalid",
      piDefaultModelSpec: "bad-default",
      hasCredentials: () => false,
    });

    expect(modelSpec).toBe("anthropic/claude-sonnet-4-20250514");
  });
});
