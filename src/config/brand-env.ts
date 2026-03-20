/**
 * Shared brand-env aliasing — single source of truth for Milady ↔ Eliza
 * environment variable mirroring.
 */

export const BRAND_ENV_ALIASES = [
  // From api/server.ts
  ["MILADY_API_TOKEN", "ELIZA_API_TOKEN"],
  ["MILADY_API_BIND", "ELIZA_API_BIND"],
  ["MILADY_PAIRING_DISABLED", "ELIZA_PAIRING_DISABLED"],
  ["MILADY_ALLOWED_ORIGINS", "ELIZA_ALLOWED_ORIGINS"],
  ["MILADY_ALLOW_NULL_ORIGIN", "ELIZA_ALLOW_NULL_ORIGIN"],
  ["MILADY_ALLOW_WS_QUERY_TOKEN", "ELIZA_ALLOW_WS_QUERY_TOKEN"],
  ["MILADY_WALLET_EXPORT_TOKEN", "ELIZA_WALLET_EXPORT_TOKEN"],
  ["MILADY_TERMINAL_RUN_TOKEN", "ELIZA_TERMINAL_RUN_TOKEN"],
  ["MILADY_STATE_DIR", "ELIZA_STATE_DIR"],
  ["MILADY_CONFIG_PATH", "ELIZA_CONFIG_PATH"],
  // From runtime/eliza.ts
  ["MILADY_USE_PI_AI", "ELIZA_USE_PI_AI"],
  ["MILADY_CLOUD_TTS_DISABLED", "ELIZA_CLOUD_TTS_DISABLED"],
  ["MILADY_CLOUD_MEDIA_DISABLED", "ELIZA_CLOUD_MEDIA_DISABLED"],
  ["MILADY_CLOUD_EMBEDDINGS_DISABLED", "ELIZA_CLOUD_EMBEDDINGS_DISABLED"],
  ["MILADY_CLOUD_RPC_DISABLED", "ELIZA_CLOUD_RPC_DISABLED"],
  ["MILADY_DISABLE_LOCAL_EMBEDDINGS", "ELIZA_DISABLE_LOCAL_EMBEDDINGS"],
  // Port aliases
  ["MILADY_PORT", "ELIZA_PORT"],
  ["MILADY_API_PORT", "ELIZA_API_PORT"],
  ["MILADY_GATEWAY_PORT", "ELIZA_GATEWAY_PORT"],
  ["MILADY_BRIDGE_PORT", "ELIZA_BRIDGE_PORT"],
] as const;

const miladyMirroredEnvKeys = new Set<string>();
const elizaMirroredEnvKeys = new Set<string>();

export function syncMiladyEnvToEliza(): void {
  for (const [miladyKey, elizaKey] of BRAND_ENV_ALIASES) {
    const value = process.env[miladyKey];
    if (typeof value === "string") {
      process.env[elizaKey] = value;
      elizaMirroredEnvKeys.add(elizaKey);
    } else if (elizaMirroredEnvKeys.has(elizaKey)) {
      delete process.env[elizaKey];
      elizaMirroredEnvKeys.delete(elizaKey);
    }
  }
}

export function syncElizaEnvToMilady(): void {
  for (const [miladyKey, elizaKey] of BRAND_ENV_ALIASES) {
    const value = process.env[elizaKey];
    if (typeof value === "string") {
      process.env[miladyKey] = value;
      miladyMirroredEnvKeys.add(miladyKey);
    } else if (miladyMirroredEnvKeys.has(miladyKey)) {
      delete process.env[miladyKey];
      miladyMirroredEnvKeys.delete(miladyKey);
    }
  }
}
