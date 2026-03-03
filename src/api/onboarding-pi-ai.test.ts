import { afterEach, beforeEach, describe, expect, it } from "vitest";

type OnboardingLikeBody = {
  runMode?: string;
  provider?: string;
  primaryModel?: unknown;
};

type OnboardingLikeConfig = {
  env?: Record<string, unknown> & { vars?: Record<string, string> };
  agents?: {
    defaults?: Record<string, unknown>;
  };
};

/**
 * Mirrors the pi-ai onboarding branch in server.ts.
 */
function applyPiAiOnboarding(
  body: OnboardingLikeBody,
  config: OnboardingLikeConfig,
): void {
  if (!config.env) config.env = {};
  const envCfg = config.env;
  const vars = envCfg.vars ?? {};
  envCfg.vars = vars;

  const providerId = typeof body.provider === "string" ? body.provider : "";
  const runMode = body.runMode ?? "local";

  const clearPiAiFlag = () => {
    delete vars.MILAIDY_USE_PI_AI;
    delete envCfg.MILAIDY_USE_PI_AI;
    delete process.env.MILAIDY_USE_PI_AI;
  };

  if (runMode === "local" && providerId === "pi-ai") {
    vars.MILAIDY_USE_PI_AI = "1";
    process.env.MILAIDY_USE_PI_AI = "1";

    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    const defaults = config.agents.defaults;
    const modelConfig = (defaults.model ?? {}) as Record<string, unknown>;
    const primaryModel =
      typeof body.primaryModel === "string" ? body.primaryModel.trim() : "";

    if (primaryModel) {
      modelConfig.primary = primaryModel;
    } else {
      delete modelConfig.primary;
    }

    defaults.model = modelConfig;
  } else {
    clearPiAiFlag();
  }
}

describe("pi-ai onboarding configuration", () => {
  let savedPiAiEnv: string | undefined;

  beforeEach(() => {
    savedPiAiEnv = process.env.MILAIDY_USE_PI_AI;
    delete process.env.MILAIDY_USE_PI_AI;
  });

  afterEach(() => {
    if (savedPiAiEnv === undefined) {
      delete process.env.MILAIDY_USE_PI_AI;
    } else {
      process.env.MILAIDY_USE_PI_AI = savedPiAiEnv;
    }
  });

  it("enables MILAIDY_USE_PI_AI and stores primary model for local pi-ai", () => {
    const config: OnboardingLikeConfig = {};

    applyPiAiOnboarding(
      {
        runMode: "local",
        provider: "pi-ai",
        primaryModel: "anthropic/claude-sonnet-4-20250514",
      },
      config,
    );

    expect(process.env.MILAIDY_USE_PI_AI).toBe("1");
    expect(config.env?.vars?.MILAIDY_USE_PI_AI).toBe("1");
    expect(
      (config.agents?.defaults?.model as { primary?: string }).primary,
    ).toBe("anthropic/claude-sonnet-4-20250514");
  });

  it("clears primary model override when blank in pi-ai mode", () => {
    const config: OnboardingLikeConfig = {
      agents: {
        defaults: {
          model: { primary: "openai/gpt-5" },
        },
      },
    };

    applyPiAiOnboarding(
      {
        runMode: "local",
        provider: "pi-ai",
        primaryModel: "   ",
      },
      config,
    );

    expect(
      (config.agents?.defaults?.model as { primary?: string }).primary,
    ).toBe(undefined);
  });

  it("clears MILAIDY_USE_PI_AI when provider is not pi-ai", () => {
    const config: OnboardingLikeConfig = {
      env: {
        vars: { MILAIDY_USE_PI_AI: "1" },
      },
    };
    process.env.MILAIDY_USE_PI_AI = "1";

    applyPiAiOnboarding(
      {
        runMode: "local",
        provider: "openai",
      },
      config,
    );

    expect(process.env.MILAIDY_USE_PI_AI).toBeUndefined();
    expect(config.env?.vars?.MILAIDY_USE_PI_AI).toBeUndefined();
  });

  it("clears MILAIDY_USE_PI_AI for cloud mode", () => {
    const config: OnboardingLikeConfig = {
      env: {
        vars: { MILAIDY_USE_PI_AI: "1" },
      },
    };
    process.env.MILAIDY_USE_PI_AI = "1";

    applyPiAiOnboarding(
      {
        runMode: "cloud",
        provider: "pi-ai",
      },
      config,
    );

    expect(process.env.MILAIDY_USE_PI_AI).toBeUndefined();
    expect(config.env?.vars?.MILAIDY_USE_PI_AI).toBeUndefined();
  });
});
