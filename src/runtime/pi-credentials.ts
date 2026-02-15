import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getEnvApiKey,
  getOAuthApiKey,
  type OAuthCredentials,
} from "@mariozechner/pi-ai";

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

  return {
    hasCredentials: (provider: string) => {
      if (getEnvApiKey(provider)) return true;
      return provider in auth;
    },

    getApiKey: async (provider: string) => {
      // Environment takes precedence (matches pi-ai behavior).
      const envKey = getEnvApiKey(provider);
      if (envKey) return envKey;

      const entry = auth[provider];
      if (!entry) return undefined;

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
    },

    getDefaultModelSpec: async () => {
      const provider = settings.defaultProvider;
      const model = settings.defaultModel;
      if (!provider || !model) return undefined;
      return `${provider}/${model}`;
    },
  };
}
