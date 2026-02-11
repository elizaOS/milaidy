/**
 * Credential storage and token refresh for subscription providers.
 *
 * Stores OAuth credentials in ~/.milaidy/auth/ as JSON files.
 * Uses @mariozechner/pi-ai for token refresh.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "@elizaos/core";
import { refreshAnthropicToken } from "./anthropic.js";
import { refreshCodexToken } from "./openai-codex.js";
import type {
  OAuthCredentials,
  StoredCredentials,
  SubscriptionProvider,
} from "./types.js";

const AUTH_DIR = path.join(
  process.env.MILAIDY_HOME || path.join(os.homedir(), ".milaidy"),
  "auth",
);

/** Buffer before expiry to trigger refresh (5 minutes) */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

function ensureAuthDir(): void {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
  }
}

function credentialPath(provider: SubscriptionProvider): string {
  return path.join(AUTH_DIR, `${provider}.json`);
}

/**
 * Save credentials for a provider.
 */
export function saveCredentials(
  provider: SubscriptionProvider,
  credentials: OAuthCredentials,
): void {
  ensureAuthDir();
  const stored: StoredCredentials = {
    provider,
    credentials,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  fs.writeFileSync(credentialPath(provider), JSON.stringify(stored, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
  logger.info(`[auth] Saved ${provider} credentials`);
}

/**
 * Load stored credentials for a provider.
 */
export function loadCredentials(
  provider: SubscriptionProvider,
): StoredCredentials | null {
  const filePath = credentialPath(provider);
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data) as StoredCredentials;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Delete stored credentials for a provider.
 */
export function deleteCredentials(provider: SubscriptionProvider): void {
  const filePath = credentialPath(provider);
  try {
    fs.unlinkSync(filePath);
    logger.info(`[auth] Deleted ${provider} credentials`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}

/**
 * Check if credentials exist and are not expired.
 */
export function hasValidCredentials(provider: SubscriptionProvider): boolean {
  const stored = loadCredentials(provider);
  if (!stored) return false;
  return stored.credentials.expires > Date.now();
}

/**
 * Get a valid access token, refreshing if needed.
 * Returns null if no credentials stored or refresh fails.
 */
export async function getAccessToken(
  provider: SubscriptionProvider,
): Promise<string | null> {
  const stored = loadCredentials(provider);
  if (!stored) {
    logger.debug(`[auth] No stored credentials for ${provider}`);
    return null;
  }

  const { credentials } = stored;

  // Token still valid
  if (credentials.expires > Date.now() + REFRESH_BUFFER_MS) {
    const hoursLeft = ((credentials.expires - Date.now()) / 3600000).toFixed(1);
    logger.debug(`[auth] ${provider} token valid (${hoursLeft}h remaining)`);
    return credentials.access;
  }

  // Need to refresh
  logger.info(
    `[auth] ${provider} token expired or expiring soon, refreshing...`,
  );
  try {
    let refreshed: OAuthCredentials;
    if (provider === "anthropic-subscription") {
      refreshed = await refreshAnthropicToken(credentials.refresh);
    } else if (provider === "openai-codex") {
      refreshed = await refreshCodexToken(credentials.refresh);
    } else {
      logger.error(`[auth] Unknown provider: ${provider}`);
      return null;
    }

    const newHoursLeft = ((refreshed.expires - Date.now()) / 3600000).toFixed(
      1,
    );
    logger.info(
      `[auth] ${provider} token refreshed successfully (valid for ${newHoursLeft}h)`,
    );
    // Save refreshed credentials
    saveCredentials(provider, refreshed);
    return refreshed.access;
  } catch (err) {
    logger.error(`[auth] Failed to refresh ${provider} token: ${err}`);
    return null;
  }
}

/**
 * Get all configured subscription providers and their status.
 */
export function getSubscriptionStatus(): Array<{
  provider: SubscriptionProvider;
  configured: boolean;
  valid: boolean;
  expiresAt: number | null;
  hoursUntilExpiry: number | null;
  status: "not-configured" | "active" | "expired";
}> {
  const providers: SubscriptionProvider[] = [
    "anthropic-subscription",
    "openai-codex",
  ];
  return providers.map((provider) => {
    const stored = loadCredentials(provider);
    const configured = stored !== null;
    const valid = stored ? stored.credentials.expires > Date.now() : false;
    const expiresAt = stored?.credentials.expires ?? null;
    return {
      provider,
      configured,
      valid,
      expiresAt,
      hoursUntilExpiry: expiresAt ? (expiresAt - Date.now()) / 3600000 : null,
      status: !configured
        ? ("not-configured" as const)
        : valid
          ? ("active" as const)
          : ("expired" as const),
    };
  });
}

/**
 * Apply subscription credentials to the environment.
 * Called at startup to make credentials available to ElizaOS plugins.
 */
export async function applySubscriptionCredentials(): Promise<void> {
  const applied: string[] = [];
  const skipped: string[] = [];

  // Anthropic subscription → set ANTHROPIC_API_KEY
  const anthropicToken = await getAccessToken("anthropic-subscription");
  if (anthropicToken) {
    process.env.ANTHROPIC_API_KEY = anthropicToken;
    applied.push("anthropic-subscription");
  } else {
    skipped.push("anthropic-subscription");
  }

  // OpenAI Codex subscription → set OPENAI_API_KEY
  const codexToken = await getAccessToken("openai-codex");
  if (codexToken) {
    process.env.OPENAI_API_KEY = codexToken;
    applied.push("openai-codex");
  } else {
    skipped.push("openai-codex");
  }

  if (applied.length > 0) {
    logger.info(
      `[auth] Applied subscription credentials: ${applied.join(", ")}`,
    );
  }
  if (skipped.length > 0) {
    logger.debug(`[auth] No valid credentials for: ${skipped.join(", ")}`);
  }
}
