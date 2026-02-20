import { DEFAULT_PI_MODEL_SPEC, parseModelSpec } from "../utils/pi-ai.js";

export interface ResolveTuiModelSpecParams {
  modelOverride?: string;
  /** Primary model from milady.json (agents.defaults.model.primary). */
  configPrimaryModelSpec?: string;
  /** Optional pi-ai plugin model override from milady config env vars. */
  configPiAiModelSpec?: string;
  runtimeModelSpec?: string;
  piDefaultModelSpec?: string;
  hasCredentials: (provider: string) => boolean;
}

function toValidModelSpec(spec?: string): string | undefined {
  if (!spec) return undefined;

  const normalized = spec.trim();
  if (!normalized) return undefined;

  try {
    parseModelSpec(normalized);
    return normalized;
  } catch {
    return undefined;
  }
}

/**
 * Select the model spec used by the TUI pi-ai bridge.
 *
 * Priority:
 * 1) explicit CLI override (--model)
 * 2) milady config primary model (agents.defaults.model.primary)
 * 3) milady config PI_AI_MODEL_SPEC
 * 4) runtime MODEL_PROVIDER
 * 5) pi settings default (settings.json)
 * 6) built-in safe default
 *
 * Candidate specs are only used when credentials exist for the provider.
 */
export function resolveTuiModelSpec(params: ResolveTuiModelSpecParams): string {
  const defaultSpec =
    toValidModelSpec(params.piDefaultModelSpec) ?? DEFAULT_PI_MODEL_SPEC;

  const candidates = [
    params.modelOverride,
    params.configPrimaryModelSpec,
    params.configPiAiModelSpec,
    params.runtimeModelSpec,
  ];

  for (const candidate of candidates) {
    const spec = toValidModelSpec(candidate);
    if (!spec) continue;

    const { provider } = parseModelSpec(spec);
    if (params.hasCredentials(provider)) {
      return spec;
    }
  }

  return defaultSpec;
}
