import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getEnvApiKey,
  getOAuthApiKey,
  type OAuthCredentials,
} from "@mariozechner/pi-ai";
import { getAccessToken, loadCredentials } from "../auth/credentials.js";
import type { SubscriptionProvider } from "../auth/types.js";

interface PiAuthApiKeyEntry {
  type: "api_key";
  key: string;
}

interface PiAuthOAuthEntry {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
}

type PiAuthEntry = PiAuthApiKeyEntry | PiAuthOAuthEntry;

type PiAuthFile = Record<string, PiAuthEntry>;

interface PiSettingsFile {
  defaultProvider?: string;
  defaultModel?: string;
}

const OPENAI_CODEX_DEFAULT_MODEL_SPEC = "openai-codex/gpt-5.1";
const ANTHROPIC_SUBSCRIPTION_DEFAULT_MODEL_SPEC =
  "anthropic/claude-sonnet-4-20250514";

function resolveSubscriptionProviderForPiProvider(
  provider: string,
): SubscriptionProvider | null {
  if (provider === "openai-codex") return "openai-codex";
  if (provider === "anthropic") return "anthropic-subscription";
  return null;
}

function resolvePiAgentDir(): string {
  return (
    process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent")
  );
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export interface PiCredentialProvider {
  /** Returns true if we have *some* credentials for this provider (env, api key, or oauth). */
  hasCredentials(provider: string): boolean;
  /** Resolve an API key/token that pi-ai providers accept as StreamOptions.apiKey. */
  getApiKey(provider: string): Promise<string | undefined>;
  /** Default provider/model from pi settings.json, if present. */
  getDefaultModelSpec(): Promise<string | undefined>;
}

/**
 * Best-effort import of pi's provider credentials.
 *
 * - Reads API keys + OAuth creds from: ~/.pi/agent/auth.json (or $PI_CODING_AGENT_DIR/auth.json)
 * - Reads defaults from: ~/.pi/agent/settings.json
 * - Falls back to Milady subscription credentials (e.g. openai-codex) when available
 */
export async function createPiCredentialProvider(): Promise<PiCredentialProvider> {
  const agentDir = resolvePiAgentDir();
  const authPath = path.join(agentDir, "auth.json");
  const settingsPath = path.join(agentDir, "settings.json");

  const auth = (await readJsonFile<PiAuthFile>(authPath)) ?? {};
  const settings = (await readJsonFile<PiSettingsFile>(settingsPath)) ?? {};

  // Keep a mutable OAuth credential map in-memory so refreshes are remembered.
  const oauthCreds: Record<string, OAuthCredentials> = {};

  for (const [provider, entry] of Object.entries(auth)) {
    if (entry.type === "oauth") {
      oauthCreds[provider] = {
        access: entry.access,
        refresh: entry.refresh,
        expires: entry.expires,
      };
    }
  }

  const hasMiladySubscriptionCredentials = (provider: string): boolean => {
    const subscriptionProvider = resolveSubscriptionProviderForPiProvider(
      provider,
    );
    if (!subscriptionProvider) return false;
    try {
      return loadCredentials(subscriptionProvider) !== null;
    } catch {
      return false;
    }
  };

  const getMiladySubscriptionApiKey = async (
    provider: string,
  ): Promise<string | undefined> => {
    const subscriptionProvider = resolveSubscriptionProviderForPiProvider(
      provider,
    );
    if (!subscriptionProvider) return undefined;
    try {
      return (await getAccessToken(subscriptionProvider)) ?? undefined;
    } catch {
      return undefined;
    }
  };

  return {
    hasCredentials: (provider: string) => {
      if (getEnvApiKey(provider)) return true;
      if (provider in auth) return true;
      return hasMiladySubscriptionCredentials(provider);
    },

    getApiKey: async (provider: string) => {
      // Environment takes precedence (matches pi-ai behavior).
      const envKey = getEnvApiKey(provider);
      if (envKey) return envKey;

      const entry = auth[provider];
      if (entry) {
        if (entry.type === "api_key") {
          return entry.key;
        }

        // OAuth: refresh if needed using pi-ai oauth helpers.
        try {
          const res = await getOAuthApiKey(provider, oauthCreds);
          if (!res) return undefined;

          // Update in-memory creds so subsequent calls use the refreshed token.
          oauthCreds[provider] = res.newCredentials;
          return res.apiKey;
        } catch {
          // Don't throw here; let the caller show a friendly error on actual model call.
          return entry.access;
        }
      }

      // Milady-managed subscription credentials fallback (e.g. openai-codex).
      return getMiladySubscriptionApiKey(provider);
    },

    getDefaultModelSpec: async () => {
      const provider = settings.defaultProvider;
      const model = settings.defaultModel;
      if (provider && model) {
        return `${provider}/${model}`;
      }

      // If pi settings are absent, fall back to Milady subscription defaults.
      if (hasMiladySubscriptionCredentials("openai-codex")) {
        return OPENAI_CODEX_DEFAULT_MODEL_SPEC;
      }
      if (hasMiladySubscriptionCredentials("anthropic")) {
        return ANTHROPIC_SUBSCRIPTION_DEFAULT_MODEL_SPEC;
      }
      return undefined;
    },
  };
}
