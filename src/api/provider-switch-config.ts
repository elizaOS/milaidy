import { SUBSCRIPTION_PROVIDER_MAP } from "../auth/types";
import type { MiladyConfig } from "../config/types.milady";
import {
  getOnboardingProviderOption,
  getStoredOnboardingProviderId,
  isCloudManagedConnection,
  isLocalProviderConnection,
  isRemoteProviderConnection,
  normalizeOnboardingProviderId,
  normalizeSubscriptionProviderSelectionId,
  ONBOARDING_PROVIDER_CATALOG,
  type OnboardingConnection,
  type OnboardingLocalProviderId,
  type SubscriptionProviderSelectionId,
} from "../contracts/onboarding";

const DIRECT_PROVIDER_ENV_KEYS = new Map(
  ONBOARDING_PROVIDER_CATALOG.filter((provider) => provider.envKey).map(
    (provider) => [provider.id, provider.envKey as string],
  ),
);

function ensureAgentDefaults(
  config: Partial<MiladyConfig>,
): NonNullable<NonNullable<MiladyConfig["agents"]>["defaults"]> {
  config.agents ??= {};
  config.agents.defaults ??= {};
  return config.agents.defaults;
}

function ensureCloudConfig(
  config: Partial<MiladyConfig>,
): NonNullable<MiladyConfig["cloud"]> {
  config.cloud ??= {};
  return config.cloud;
}

function ensureEnvVars(config: Partial<MiladyConfig>): Record<string, string> {
  config.env ??= {};
  const envConfig = config.env as Record<string, unknown>;
  const vars =
    envConfig.vars && typeof envConfig.vars === "object"
      ? (envConfig.vars as Record<string, string>)
      : {};
  envConfig.vars = vars;
  return vars;
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function setEnvVar(
  config: Partial<MiladyConfig>,
  key: string,
  value: string,
): void {
  const vars = ensureEnvVars(config);
  vars[key] = value;
  (config.env as Record<string, unknown>)[key] = value;
  process.env[key] = value;
}

function clearEnvVar(config: Partial<MiladyConfig>, key: string): void {
  if (config.env && typeof config.env === "object") {
    delete (config.env as Record<string, unknown>)[key];
    const vars = (config.env as Record<string, unknown>).vars;
    if (vars && typeof vars === "object") {
      delete (vars as Record<string, unknown>)[key];
    }
  }
  delete process.env[key];
}

function clearPiAi(config: Partial<MiladyConfig>): void {
  clearEnvVar(config, "MILADY_USE_PI_AI");
}

function setCloudInferenceEnabled(
  config: Partial<MiladyConfig>,
  enabled: boolean,
): void {
  const cloud = ensureCloudConfig(config);
  const cloudConfig = cloud as Record<string, unknown>;
  cloudConfig.inferenceMode = enabled ? "cloud" : "byok";
  const services =
    cloudConfig.services && typeof cloudConfig.services === "object"
      ? (cloudConfig.services as Record<string, unknown>)
      : {};
  services.inference = enabled;
  cloudConfig.services = services;
  if (enabled) {
    cloud.enabled = true;
  }
}

function clearDirectProviderKeys(
  config: Partial<MiladyConfig>,
  keep: string[] = [],
): void {
  const keepSet = new Set(keep);
  for (const envKey of DIRECT_PROVIDER_ENV_KEYS.values()) {
    if (keepSet.has(envKey)) continue;
    clearEnvVar(config, envKey);
  }
}

function setPrimaryModel(
  config: Partial<MiladyConfig>,
  primaryModel: string | null | undefined,
): void {
  const defaults = ensureAgentDefaults(config);
  const modelConfig = { ...(defaults.model ?? {}) };
  const trimmed = trimToNull(primaryModel);
  if (trimmed) {
    modelConfig.primary = trimmed;
    defaults.model = modelConfig;
    return;
  }
  delete modelConfig.primary;
  if (Object.keys(modelConfig).length > 0) {
    defaults.model = modelConfig;
  } else {
    delete defaults.model;
  }
}

async function clearSubscriptionCredentials(
  keep: SubscriptionProviderSelectionId | null = null,
): Promise<void> {
  const { deleteCredentials } = await import("../auth/index");
  if (keep !== "anthropic-subscription") {
    deleteCredentials("anthropic-subscription");
  }
  if (keep !== "openai-subscription") {
    deleteCredentials("openai-codex");
  }
}

function resolveSubscriptionSelectionId(
  provider: string,
): SubscriptionProviderSelectionId | null {
  return normalizeSubscriptionProviderSelectionId(provider);
}

/**
 * Apply subscription provider configuration to the config object.
 *
 * Sets `agents.defaults.subscriptionProvider` and `agents.defaults.model.primary`
 * so the runtime auto-detects the correct provider on restart.
 *
 * Mutates `config` in place.
 */
export function applySubscriptionProviderConfig(
  config: Partial<MiladyConfig>,
  provider: string,
): void {
  const defaults = ensureAgentDefaults(config);
  const normalizedProvider =
    getStoredOnboardingProviderId(provider) ??
    (provider === "openai-subscription" ? "openai-codex" : provider);
  const modelProvider =
    SUBSCRIPTION_PROVIDER_MAP[
      normalizedProvider as keyof typeof SUBSCRIPTION_PROVIDER_MAP
    ];

  if (modelProvider) {
    defaults.subscriptionProvider = normalizedProvider;
    defaults.model = { ...defaults.model, primary: modelProvider };
  }
}

/**
 * Clear subscription provider configuration from the config object.
 *
 * Removes `agents.defaults.subscriptionProvider` so the runtime
 * doesn't try to auto-detect a subscription provider on restart.
 *
 * Mutates `config` in place.
 */
export function clearSubscriptionProviderConfig(
  config: Partial<MiladyConfig>,
): void {
  const defaults = ensureAgentDefaults(config);
  delete defaults.subscriptionProvider;
}

export function normalizeOnboardingConnection(
  value: unknown,
): OnboardingConnection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const connection = value as Record<string, unknown>;
  switch (connection.kind) {
    case "cloud-managed": {
      return {
        kind: "cloud-managed",
        cloudProvider: "elizacloud",
        apiKey:
          typeof connection.apiKey === "string" ? connection.apiKey : undefined,
        smallModel:
          typeof connection.smallModel === "string"
            ? connection.smallModel
            : undefined,
        largeModel:
          typeof connection.largeModel === "string"
            ? connection.largeModel
            : undefined,
      };
    }
    case "local-provider": {
      const provider = normalizeOnboardingProviderId(connection.provider);
      if (!provider || provider === "elizacloud") {
        return null;
      }
      return {
        kind: "local-provider",
        provider,
        apiKey:
          typeof connection.apiKey === "string" ? connection.apiKey : undefined,
        primaryModel:
          typeof connection.primaryModel === "string"
            ? connection.primaryModel
            : undefined,
      };
    }
    case "remote-provider": {
      const provider = normalizeOnboardingProviderId(connection.provider);
      return {
        kind: "remote-provider",
        remoteApiBase:
          typeof connection.remoteApiBase === "string"
            ? connection.remoteApiBase
            : "",
        remoteAccessToken:
          typeof connection.remoteAccessToken === "string"
            ? connection.remoteAccessToken
            : undefined,
        provider: provider && provider !== "elizacloud" ? provider : undefined,
        apiKey:
          typeof connection.apiKey === "string" ? connection.apiKey : undefined,
        primaryModel:
          typeof connection.primaryModel === "string"
            ? connection.primaryModel
            : undefined,
      };
    }
    default:
      return null;
  }
}

async function applyLocalProviderConfig(
  config: Partial<MiladyConfig>,
  providerId: OnboardingLocalProviderId,
  apiKey?: string,
  primaryModel?: string,
): Promise<void> {
  clearPiAi(config);
  setCloudInferenceEnabled(config, false);

  const subscriptionSelection = resolveSubscriptionSelectionId(providerId);
  if (subscriptionSelection) {
    const keepEnvKeys =
      subscriptionSelection === "anthropic-subscription" &&
      trimToNull(apiKey)?.startsWith("sk-ant-")
        ? "ANTHROPIC_API_KEY"
        : null;
    clearDirectProviderKeys(config, keepEnvKeys ? [keepEnvKeys] : []);
    applySubscriptionProviderConfig(config, providerId);
    await clearSubscriptionCredentials(subscriptionSelection);

    if (
      subscriptionSelection === "anthropic-subscription" &&
      trimToNull(apiKey)?.startsWith("sk-ant-")
    ) {
      setEnvVar(config, "ANTHROPIC_API_KEY", trimToNull(apiKey) as string);
    }

    const { applySubscriptionCredentials } = await import("../auth/index");
    await applySubscriptionCredentials(config);
    return;
  }

  await clearSubscriptionCredentials();
  clearSubscriptionProviderConfig(config);

  if (providerId === "pi-ai") {
    setEnvVar(config, "MILADY_USE_PI_AI", "1");
    setPrimaryModel(config, primaryModel);
    clearDirectProviderKeys(config);
    return;
  }

  clearDirectProviderKeys(config);
  const providerOption = getOnboardingProviderOption(providerId);
  if (!providerOption) {
    return;
  }

  if (providerOption.envKey) {
    const trimmedApiKey = trimToNull(apiKey);
    if (trimmedApiKey) {
      setEnvVar(config, providerOption.envKey, trimmedApiKey);
    } else {
      clearEnvVar(config, providerOption.envKey);
    }
  }

  if (
    providerId === "openrouter" ||
    providerOption.supportsPrimaryModelOverride
  ) {
    setPrimaryModel(config, primaryModel);
  } else if (primaryModel) {
    setPrimaryModel(config, primaryModel);
  }
}

export async function applyOnboardingConnectionConfig(
  config: Partial<MiladyConfig>,
  connection: OnboardingConnection,
): Promise<void> {
  if (isCloudManagedConnection(connection)) {
    await clearSubscriptionCredentials();
    clearSubscriptionProviderConfig(config);
    clearPiAi(config);
    clearDirectProviderKeys(config);
    setCloudInferenceEnabled(config, true);

    const cloud = ensureCloudConfig(config);
    cloud.provider = connection.cloudProvider;
    const trimmedApiKey = trimToNull(connection.apiKey);
    if (trimmedApiKey) {
      cloud.apiKey = trimmedApiKey;
      process.env.ELIZAOS_CLOUD_API_KEY = trimmedApiKey;
    }

    config.models ??= {};
    config.models.small =
      trimToNull(connection.smallModel) ?? "openai/gpt-5-mini";
    config.models.large =
      trimToNull(connection.largeModel) ?? "anthropic/claude-sonnet-4.5";
    setPrimaryModel(config, null);
    return;
  }

  if (isRemoteProviderConnection(connection)) {
    if (connection.provider) {
      await applyLocalProviderConfig(
        config,
        connection.provider,
        connection.apiKey,
        connection.primaryModel,
      );
    }
    return;
  }

  if (isLocalProviderConnection(connection)) {
    await applyLocalProviderConfig(
      config,
      connection.provider,
      connection.apiKey,
      connection.primaryModel,
    );
  }
}

export function createProviderSwitchConnection(args: {
  provider: string;
  apiKey?: string;
}): OnboardingConnection | null {
  const normalizedProvider = normalizeOnboardingProviderId(args.provider);
  if (!normalizedProvider) {
    return null;
  }

  if (normalizedProvider === "elizacloud") {
    return {
      kind: "cloud-managed",
      cloudProvider: "elizacloud",
      apiKey: args.apiKey,
    };
  }

  return {
    kind: "local-provider",
    provider: normalizedProvider,
    apiKey: args.apiKey,
  };
}
