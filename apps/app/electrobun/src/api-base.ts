/**
 * API Base Resolution for Electrobun
 *
 * Resolves the external API base URL from environment variables and provides
 * utilities to inject it into the webview via RPC messages.
 */

type ExternalApiBaseEnvKey =
  | "MILADY_DESKTOP_TEST_API_BASE"
  | "MILADY_DESKTOP_API_BASE"
  | "MILADY_API_BASE_URL"
  | "MILADY_API_BASE"
  | "MILADY_ELECTRON_API_BASE"
  | "MILADY_ELECTRON_TEST_API_BASE";

export type DesktopRuntimeMode = "local" | "external" | "disabled";

const EXTERNAL_API_BASE_ENV_KEYS: readonly ExternalApiBaseEnvKey[] = [
  "MILADY_DESKTOP_TEST_API_BASE",
  "MILADY_DESKTOP_API_BASE",
  "MILADY_ELECTRON_TEST_API_BASE",
  "MILADY_ELECTRON_API_BASE",
  "MILADY_API_BASE_URL",
  "MILADY_API_BASE",
];

export interface ExternalApiBaseResolution {
  base: string | null;
  source: ExternalApiBaseEnvKey | null;
  invalidSources: ExternalApiBaseEnvKey[];
}

export interface DesktopRuntimeModeResolution {
  mode: DesktopRuntimeMode;
  externalApi: ExternalApiBaseResolution;
}

export function normalizeApiBase(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolveExternalApiBase(
  env: Record<string, string | undefined>,
): ExternalApiBaseResolution {
  const invalidSources: ExternalApiBaseEnvKey[] = [];

  for (const key of EXTERNAL_API_BASE_ENV_KEYS) {
    const rawValue = env[key]?.trim();
    if (!rawValue) continue;

    const normalized = normalizeApiBase(rawValue);
    if (normalized) {
      return { base: normalized, source: key, invalidSources };
    }
    invalidSources.push(key);
  }

  return { base: null, source: null, invalidSources };
}

function isEnabledFlag(raw: string | undefined): boolean {
  const normalized = raw?.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

export function resolveDesktopRuntimeMode(
  env: Record<string, string | undefined>,
): DesktopRuntimeModeResolution {
  const externalApi = resolveExternalApiBase(env);
  if (externalApi.base) {
    return { mode: "external", externalApi };
  }

  if (isEnabledFlag(env.MILADY_DESKTOP_SKIP_EMBEDDED_AGENT)) {
    return { mode: "disabled", externalApi };
  }

  return { mode: "local", externalApi };
}

export function resolveInitialApiBase(
  env: Record<string, string | undefined>,
): string | null {
  const resolution = resolveDesktopRuntimeMode(env);
  if (resolution.mode === "external") {
    return resolution.externalApi.base;
  }

  const agentPort = Number(env.MILADY_PORT) || 2138;
  return `http://127.0.0.1:${agentPort}`;
}

/**
 * Push the API base URL (and optional token) to the renderer via typed
 * RPC message instead of evaluating arbitrary JS (CSP-safe).
 *
 * The renderer-side bridge registers a handler for `apiBaseUpdate`
 * that writes the values to `window.__MILADY_API_BASE__` and
 * `window.__MILADY_API_TOKEN__`.
 */
/**
 * Structural type for the send proxy on an Electrobun RPC instance.
 * Scoped to only the message this module needs to send.
 */
type ApiBaseUpdateRpc = {
  send?: {
    apiBaseUpdate?: (payload: { base: string; token?: string }) => void;
  };
};

export function pushApiBaseToRenderer(
  win: { webview: { rpc?: unknown } },
  base: string,
  apiToken?: string,
): void {
  const trimmedToken = apiToken?.trim();
  const payload = { base, token: trimmedToken || undefined };
  try {
    const rpcSend = (win.webview?.rpc as ApiBaseUpdateRpc | undefined)?.send;
    rpcSend?.apiBaseUpdate?.(payload);
  } catch (err) {
    console.warn(`[ApiBase] Push failed:`, err);
  }
}
