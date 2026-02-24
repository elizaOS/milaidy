import process from "node:process";
import type { IAgentRuntime } from "@elizaos/core";
import { registerPiAiModelHandler } from "./model-handler.js";
import {
  DEFAULT_PI_MODEL_SPEC,
  getPiModel,
  parseModelSpec,
} from "./model-utils.js";
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
  /** Legacy override: provider/modelId for both TEXT_SMALL and TEXT_LARGE. */
  modelSpec?: string;
  /** Optional model spec to use for TEXT_SMALL. */
  smallModelSpec?: string;
  /** Optional model spec to use for TEXT_LARGE. */
  largeModelSpec?: string;
  /** Optional handler registration priority. */
  priority?: number;
  /** Optional override for pi credentials/settings directory. */
  agentDir?: string;
};

export async function registerPiAiRuntime(
  runtime: IAgentRuntime,
  opts: RegisterPiAiRuntimeOptions = {},
): Promise<{ modelSpec: string; provider: string; id: string }> {
  const piCreds = await createPiCredentialProvider(opts.agentDir);

  const toValidModelSpec = (spec?: string): string | undefined => {
    if (!spec) return undefined;
    try {
      parseModelSpec(spec);
      return spec;
    } catch {
      return undefined;
    }
  };

  const defaultSpec =
    toValidModelSpec(await piCreds.getDefaultModelSpec()) ??
    DEFAULT_PI_MODEL_SPEC;

  const validatedModelSpec = (() => {
    const candidate = toValidModelSpec(opts.modelSpec);
    if (!candidate) return undefined;
    return piCreds.hasCredentials(parseModelSpec(candidate).provider)
      ? candidate
      : undefined;
  })();

  const largeSpec =
    toValidModelSpec(opts.largeModelSpec) ?? validatedModelSpec ?? defaultSpec;
  const smallSpec =
    toValidModelSpec(opts.smallModelSpec) ?? validatedModelSpec ?? largeSpec;

  const { provider: largeProvider, id: largeId } = parseModelSpec(largeSpec);
  const { provider: smallProvider, id: smallId } = parseModelSpec(smallSpec);

  const largeModel = getPiModel(largeProvider, largeId);
  const smallModel = getPiModel(smallProvider, smallId);

  const aliases = Array.from(new Set([largeSpec, smallSpec]));

  registerPiAiModelHandler(runtime, {
    largeModel,
    smallModel,
    providerName: "pi-ai",
    providerAliases: aliases,
    priority: opts.priority ?? 10000,
    getApiKey: (provider) => piCreds.getApiKey(provider),
    forceStreaming: true,
  });

  return { modelSpec: largeSpec, provider: largeProvider, id: largeId };
}
