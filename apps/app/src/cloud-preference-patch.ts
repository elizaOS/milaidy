import type { client as appClient } from "@elizaos/app-core/api";
import {
  normalizeOnboardingProviderId,
  ONBOARDING_PROVIDER_CATALOG,
} from "@elizaos/autonomous/contracts/onboarding";

const PATCH_STATE = Symbol.for("milady.cloudPreferencePatch");

type ClientLike = Pick<typeof appClient, "getCloudStatus" | "getConfig"> & {
  getCloudCredits?: typeof appClient.getCloudCredits;
} & Record<string | symbol, unknown>;

type StorageConfig = Record<string, unknown>;

type PatchState = {
  getConfig: ClientLike["getConfig"];
  getCloudStatus: ClientLike["getCloudStatus"];
  getCloudCredits?: ClientLike["getCloudCredits"];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(
  source: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = source?.[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readBoolean(
  source: Record<string, unknown> | null | undefined,
  key: string,
): boolean | null {
  const value = source?.[key];
  return typeof value === "boolean" ? value : null;
}

function readEnvString(config: StorageConfig | null | undefined, key: string) {
  const env = asRecord(config?.env);
  const vars = asRecord(env?.vars);
  return readString(vars, key) ?? readString(env, key);
}

function isTruthyEnvFlag(value: string | null): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized !== "0" && normalized !== "false" && normalized !== "no";
}

function isPiAiEnabled(config: StorageConfig | null | undefined): boolean {
  return (
    isTruthyEnvFlag(readEnvString(config, "ELIZA_USE_PI_AI")) ||
    isTruthyEnvFlag(readEnvString(config, "MILADY_USE_PI_AI"))
  );
}

function resolveConfiguredLocalProvider(
  config: StorageConfig | null | undefined,
): string | null {
  const agents = asRecord(config?.agents);
  const defaults = asRecord(agents?.defaults);
  const subscriptionProvider = normalizeOnboardingProviderId(
    readString(defaults, "subscriptionProvider"),
  );
  if (subscriptionProvider && subscriptionProvider !== "elizacloud") {
    return subscriptionProvider;
  }

  if (isPiAiEnabled(config)) {
    return "pi-ai";
  }

  for (const provider of ONBOARDING_PROVIDER_CATALOG) {
    if (provider.id === "elizacloud" || !provider.envKey) {
      continue;
    }
    if (readEnvString(config, provider.envKey)) {
      return provider.id;
    }
  }

  return null;
}

function hasRemoteConnection(
  config: StorageConfig | null | undefined,
): boolean {
  const cloud = asRecord(config?.cloud);
  return Boolean(
    readString(cloud, "remoteApiBase") ||
      readString(cloud, "remoteAccessToken"),
  );
}

function cloudHandlesInference(
  config: StorageConfig | null | undefined,
): boolean {
  const cloud = asRecord(config?.cloud);
  if (readBoolean(cloud, "enabled") !== true) {
    return false;
  }
  const services = asRecord(cloud?.services);
  const inferenceToggle = services?.inference !== false;
  const inferenceMode = readString(cloud, "inferenceMode") ?? "cloud";
  return inferenceMode === "cloud" && inferenceToggle;
}

function hasInactiveCloudSignals(
  config: StorageConfig | null | undefined,
): boolean {
  const cloud = asRecord(config?.cloud);
  const models = asRecord(config?.models);
  return Boolean(
    readString(cloud, "apiKey") ||
      normalizeOnboardingProviderId(readString(cloud, "provider")) ===
        "elizacloud" ||
      readString(cloud, "inferenceMode") === "cloud" ||
      readString(models, "small") ||
      readString(models, "large"),
  );
}

export function shouldPreferLocalProviderConfig(
  config: StorageConfig | null | undefined,
): boolean {
  return Boolean(
    resolveConfiguredLocalProvider(config) &&
      !hasRemoteConnection(config) &&
      !cloudHandlesInference(config) &&
      hasInactiveCloudSignals(config),
  );
}

export function normalizeConfigForLocalProviderPreference(
  config: StorageConfig | null | undefined,
): StorageConfig | null | undefined {
  if (!config || !shouldPreferLocalProviderConfig(config)) {
    return config;
  }

  const cloud = asRecord(config.cloud) ?? {};
  const models = asRecord(config.models);
  const nextCloud: Record<string, unknown> = { ...cloud };
  delete nextCloud.apiKey;

  if (
    normalizeOnboardingProviderId(readString(cloud, "provider")) ===
    "elizacloud"
  ) {
    delete nextCloud.provider;
  }

  if (readString(cloud, "inferenceMode") === "cloud") {
    nextCloud.inferenceMode = "byok";
  }

  const services = asRecord(cloud.services);
  if (services) {
    nextCloud.services = { ...services, inference: false };
  }
  nextCloud.enabled = false;

  const nextConfig: StorageConfig = { ...config, cloud: nextCloud };

  if (models) {
    const nextModels: Record<string, unknown> = { ...models };
    delete nextModels.small;
    delete nextModels.large;
    if (Object.keys(nextModels).length > 0) {
      nextConfig.models = nextModels;
    } else {
      delete nextConfig.models;
    }
  }

  return nextConfig;
}

export function shouldMaskInactiveCloudStatus(args: {
  config: StorageConfig | null | undefined;
  status: unknown;
}): boolean {
  if (!shouldPreferLocalProviderConfig(args.config)) {
    return false;
  }

  const status = asRecord(args.status);
  if (!status) {
    return false;
  }

  if (readString(status, "userId") || readString(status, "organizationId")) {
    return false;
  }

  return status.connected === true || status.hasApiKey === true;
}

export function installLocalProviderCloudPreferencePatch(
  client: ClientLike,
): () => void {
  const existingPatch = client[PATCH_STATE] as PatchState | undefined;
  if (existingPatch) {
    return () => {};
  }

  const originalGetConfig = client.getConfig.bind(client);
  const originalGetCloudStatus = client.getCloudStatus.bind(client);
  const originalGetCloudCredits =
    typeof client.getCloudCredits === "function"
      ? client.getCloudCredits.bind(client)
      : null;

  client[PATCH_STATE] = {
    getConfig: client.getConfig,
    getCloudStatus: client.getCloudStatus,
    getCloudCredits: client.getCloudCredits,
  } satisfies PatchState;

  client.getConfig = async () => {
    const config = (await originalGetConfig()) as
      | StorageConfig
      | null
      | undefined;
    return normalizeConfigForLocalProviderPreference(config);
  };

  client.getCloudStatus = async () => {
    const [status, config] = await Promise.all([
      originalGetCloudStatus(),
      originalGetConfig().catch(() => null),
    ]);

    if (shouldMaskInactiveCloudStatus({ config, status })) {
      return {
        ...status,
        connected: false,
        enabled: false,
        hasApiKey: false,
        reason: "inactive_local_provider",
      };
    }

    return status;
  };

  if (originalGetCloudCredits) {
    client.getCloudCredits = async () => {
      const [status, config] = await Promise.all([
        originalGetCloudStatus().catch(() => null),
        originalGetConfig().catch(() => null),
      ]);

      if (shouldMaskInactiveCloudStatus({ config, status })) {
        return { balance: null, connected: false };
      }

      return originalGetCloudCredits();
    };
  }

  return () => {
    const patchState = client[PATCH_STATE] as PatchState | undefined;
    if (!patchState) {
      return;
    }
    client.getConfig = patchState.getConfig;
    client.getCloudStatus = patchState.getCloudStatus;
    if (patchState.getCloudCredits) {
      client.getCloudCredits = patchState.getCloudCredits;
    } else {
      delete client.getCloudCredits;
    }
    delete client[PATCH_STATE];
  };
}
