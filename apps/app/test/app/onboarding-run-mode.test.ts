import { describe, expect, it } from "vitest";
import { resolveEffectiveOnboardingRunMode } from "../../src/AppContext";

describe("resolveEffectiveOnboardingRunMode", () => {
  it("forces cloud in public app mode", () => {
    const mode = resolveEffectiveOnboardingRunMode({
      publicAppMode: true,
      requestedRunMode: "local-rawdog",
      setupMode: "quick",
      providerId: "pi-ai",
    });
    expect(mode).toBe("cloud");
  });

  it("forces local mode for quick setup when a local provider is selected", () => {
    const mode = resolveEffectiveOnboardingRunMode({
      publicAppMode: false,
      requestedRunMode: "cloud",
      setupMode: "quick",
      providerId: "pi-ai",
    });
    expect(mode).toBe("local-rawdog");
  });

  it("keeps cloud mode for quick setup when elizacloud is selected", () => {
    const mode = resolveEffectiveOnboardingRunMode({
      publicAppMode: false,
      requestedRunMode: "cloud",
      setupMode: "quick",
      providerId: "elizacloud",
    });
    expect(mode).toBe("cloud");
  });

  it("respects explicit advanced local-sandbox mode", () => {
    const mode = resolveEffectiveOnboardingRunMode({
      publicAppMode: false,
      requestedRunMode: "local-sandbox",
      setupMode: "advanced",
      providerId: "openai",
    });
    expect(mode).toBe("local-sandbox");
  });
});

