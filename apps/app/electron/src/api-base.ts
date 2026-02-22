type ExternalApiBaseEnvKey =
  | "MILADY_API_BASE_URL"
  | "MILADY_API_BASE"
  | "MILADY_ELECTRON_API_BASE"
  | "MILADY_ELECTRON_TEST_API_BASE";

const EXTERNAL_API_BASE_ENV_KEYS: readonly ExternalApiBaseEnvKey[] = [
  // Test override must win so e2e runs are deterministic regardless of host env.
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

interface ApiBaseInjectionTarget {
  isDestroyed: () => boolean;
  executeJavaScript: (script: string) => Promise<unknown>;
}

interface CreateApiBaseInjectorOptions {
  getApiToken?: () => string | undefined;
  onInjected?: () => void;
  onInjectionError?: (error: unknown) => void;
}

export interface ApiBaseInjector {
  inject: (base: string | null) => Promise<boolean>;
  getLastInjectedBase: () => string | null;
}

function readEnvValue(
  env: Record<string, string | undefined>,
  key: ExternalApiBaseEnvKey,
): string | undefined {
  const value = env[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
    const rawValue = readEnvValue(env, key);
    if (!rawValue) continue;

    const normalized = normalizeApiBase(rawValue);
    if (normalized) {
      return {
        base: normalized,
        source: key,
        invalidSources,
      };
    }

    invalidSources.push(key);
  }

  return {
    base: null,
    source: null,
    invalidSources,
  };
}

export function createApiBaseInjectionScript(
  base: string,
  apiToken?: string,
): string {
  const trimmedToken = apiToken?.trim();
  const tokenSnippet = trimmedToken
    ? `window.__MILADY_API_TOKEN__ = ${JSON.stringify(trimmedToken)};`
    : "";
  const baseSnippet = `window.__MILADY_API_BASE__ = ${JSON.stringify(base)};`;
  return `${baseSnippet}${tokenSnippet}`;
}

export function createApiBaseInjector(
  target: ApiBaseInjectionTarget,
  options: CreateApiBaseInjectorOptions = {},
): ApiBaseInjector {
  let lastInjectedBase: string | null = null;

  return {
    async inject(base: string | null): Promise<boolean> {
      if (!base || target.isDestroyed()) return false;
      const script = createApiBaseInjectionScript(
        base,
        options.getApiToken?.(),
      );

      try {
        await target.executeJavaScript(script);
        lastInjectedBase = base;
        options.onInjected?.();
        return true;
      } catch (err) {
        options.onInjectionError?.(err);
        return false;
      }
    },

    getLastInjectedBase(): string | null {
      return lastInjectedBase;
    },
  };
}
