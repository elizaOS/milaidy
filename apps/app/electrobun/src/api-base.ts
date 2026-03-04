/**
 * API Base Resolution for Electrobun
 *
 * Resolves the external API base URL from environment variables and provides
 * utilities to inject it into the webview via RPC messages.
 */

type ExternalApiBaseEnvKey =
  | "MILADY_API_BASE_URL"
  | "MILADY_API_BASE"
  | "MILADY_ELECTRON_API_BASE"
  | "MILADY_ELECTRON_TEST_API_BASE";

const EXTERNAL_API_BASE_ENV_KEYS: readonly ExternalApiBaseEnvKey[] = [
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

export function createApiBaseInjectionScript(
  base: string,
  apiToken?: string,
): string {
  const trimmedToken = apiToken?.trim();
  const tokenSnippet = trimmedToken
    ? `window.__MILADY_API_TOKEN__ = ${JSON.stringify(trimmedToken)};`
    : "";
  return `window.__MILADY_API_BASE__ = ${JSON.stringify(base)};${tokenSnippet}`;
}
