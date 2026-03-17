import type http from "node:http";
import {
  type CloudRouteState as AutonomousCloudRouteState,
  handleCloudRoute as handleAutonomousCloudRoute,
} from "@elizaos/autonomous/api/cloud-routes";
import type { CloudManager } from "@elizaos/autonomous/cloud/cloud-manager";
import type { AgentRuntime } from "@elizaos/core";
import type { MiladyConfig } from "../config/config";
import { saveMiladyConfig } from "../config/config";
import { createIntegrationTelemetrySpan } from "../diagnostics/integration-observability";

// ── Sealed secret store ─────────────────────────────────────────────────────
// The upstream @elizaos/autonomous handler writes cloud credentials to
// process.env where they are visible to every module, child process, and
// environment dump.  We scrub them after each request and keep them in a
// frozen, non-enumerable object instead.
const _cloudSecrets: Record<string, string | undefined> = Object.create(null);

Object.defineProperty(_cloudSecrets, Symbol.toStringTag, {
  value: "CloudSecrets",
  enumerable: false,
});

/**
 * Read a cloud secret without exposing it in process.env.
 * Falls back to process.env for backwards compatibility with code that
 * sets the key before this module loads (e.g. docker entrypoints).
 */
export function getCloudSecret(
  key: "ELIZAOS_CLOUD_API_KEY" | "ELIZAOS_CLOUD_ENABLED",
): string | undefined {
  return _cloudSecrets[key] ?? process.env[key];
}

/** Scrub cloud secrets from process.env and capture into the sealed store. */
function scrubCloudSecretsFromEnv(): void {
  for (const key of [
    "ELIZAOS_CLOUD_API_KEY",
    "ELIZAOS_CLOUD_ENABLED",
  ] as const) {
    if (process.env[key] !== undefined) {
      _cloudSecrets[key] = process.env[key];
      delete process.env[key];
    }
  }
}

export interface CloudRouteState {
  config: MiladyConfig;
  cloudManager: CloudManager | null;
  /** The running agent runtime — needed to persist cloud credentials to the DB. */
  runtime: AgentRuntime | null;
}

function toAutonomousState(state: CloudRouteState): AutonomousCloudRouteState {
  return {
    ...state,
    saveConfig: saveMiladyConfig,
    createTelemetrySpan: createIntegrationTelemetrySpan,
  };
}

export async function handleCloudRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: CloudRouteState,
): Promise<boolean> {
  const result = await handleAutonomousCloudRoute(
    req,
    res,
    pathname,
    method,
    toAutonomousState(state),
  );

  // The upstream handler writes secrets to process.env — scrub them
  // immediately so they don't leak to child processes or env dumps.
  scrubCloudSecretsFromEnv();

  return result;
}
