import process from "node:process";
import type { IAgentRuntime } from "@elizaos/core";
import {
  DEFAULT_PI_MODEL_SPEC,
  getPiModel,
  parseModelSpec,
} from "../utils/pi-ai.js";
import { registerPiAiModelHandler } from "./pi-ai-model-handler.js";
import { createPiCredentialProvider } from "./pi-credentials.js";

export function isPiAiEnabledFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.MILAIDY_USE_PI_AI;
  if (!raw) return false;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export type RegisterPiAiRuntimeOptions = {
  /**
   * Legacy override: pi-ai model spec, format: provider/modelId
   * (e.g. anthropic/claude-sonnet-4-20250514).
   *
   * When provided, this is used for both TEXT_SMALL and TEXT_LARGE unless
   * smallModelSpec/largeModelSpec are also provided.
   */
  modelSpec?: string;
  /** Optional: model spec to use for TEXT_SMALL. */
  smallModelSpec?: string;
  /** Optional: model spec to use for TEXT_LARGE. */
  largeModelSpec?: string;
  /** Register handler priority (higher wins over plugin providers). Default: 10000. */
  priority?: number;
};

export async function registerPiAiRuntime(
  runtime: IAgentRuntime,
  opts: RegisterPiAiRuntimeOptions = {},
): Promise<{ modelSpec: string; provider: string; id: string }> {
  const piCreds = await createPiCredentialProvider();

  const defaultSpec =
    (await piCreds.getDefaultModelSpec()) ?? DEFAULT_PI_MODEL_SPEC;

  const largeSpec = opts.largeModelSpec ?? opts.modelSpec ?? defaultSpec;
  const smallSpec = opts.smallModelSpec ?? opts.modelSpec ?? largeSpec;

  const { provider: largeProvider, id: largeId } = parseModelSpec(largeSpec);
  const { provider: smallProvider, id: smallId } = parseModelSpec(smallSpec);

  const largeModel = getPiModel(largeProvider, largeId);
  const smallModel = getPiModel(smallProvider, smallId);

  const aliases = Array.from(new Set([largeSpec, smallSpec]));

  registerPiAiModelHandler(runtime, {
    largeModel,
    smallModel,
    providerName: "pi-ai",
    // Also register under full model specs so callers that treat MODEL_PROVIDER
    // as a modelSpec (provider/model) still route here.
    providerAliases: aliases,
    priority: opts.priority ?? 10000,
    getApiKey: (p) => piCreds.getApiKey(p),
    // The UI/API-server path typically does not request streaming, but we still
    // want to use the streaming API internally for parity with the TUI and
    // to avoid provider-specific non-streaming edge cases.
    forceStreaming: true,
  });

  // Return the selected large model as the primary reference.
  return { modelSpec: largeSpec, provider: largeProvider, id: largeId };
}
