/**
 * Credential storage and token refresh for subscription providers.
 *
 * Stores OAuth credentials in ~/.milady/auth/ as JSON files.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "@elizaos/core";
import { refreshAnthropicToken } from "./anthropic";
import { refreshCodexToken } from "./openai-codex";
import {
  type OAuthCredentials,
  type StoredCredentials,
  SUBSCRIPTION_PROVIDER_MAP,
  type SubscriptionProvider,
} from "./types";

const AUTH_DIR = path.join(
  process.env.MILADY_HOME || path.join(os.homedir(), ".milady"),
  "auth",
);

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

function ensureAuthDir(): void {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
  }
}

function credentialPath(provider: SubscriptionProvider): string {
  return path.join(AUTH_DIR, `${provider}.json`);
}

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

export function hasValidCredentials(provider: SubscriptionProvider): boolean {
  const stored = loadCredentials(provider);
  if (!stored) return false;
  return stored.credentials.expires > Date.now();
}

export async function getAccessToken(
  provider: SubscriptionProvider,
): Promise<string | null> {
  const stored = loadCredentials(provider);
  if (!stored) return null;

  const { credentials } = stored;

  if (credentials.expires > Date.now() + REFRESH_BUFFER_MS) {
    return credentials.access;
  }

  logger.info(`[auth] Refreshing ${provider} token...`);
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

    saveCredentials(provider, refreshed);
    return refreshed.access;
  } catch (err) {
    logger.error(`[auth] Failed to refresh ${provider} token: ${err}`);
    return null;
  }
}

export function getSubscriptionStatus(): Array<{
  provider: SubscriptionProvider;
  configured: boolean;
  valid: boolean;
  expiresAt: number | null;
}> {
  const providers: SubscriptionProvider[] = [
    "anthropic-subscription",
    "openai-codex",
  ];
  return providers.map((provider) => {
    const stored = loadCredentials(provider);
    return {
      provider,
      configured: stored !== null,
      valid: stored ? stored.credentials.expires > Date.now() : false,
      expiresAt: stored?.credentials.expires ?? null,
    };
  });
}

export async function applySubscriptionCredentials(config?: {
  agents?: {
    defaults?: { subscriptionProvider?: string; model?: { primary?: string } };
  };
}): Promise<void> {
  const anthropicToken = await getAccessToken("anthropic-subscription");
  if (anthropicToken) {
    process.env.ANTHROPIC_API_KEY = anthropicToken;
    logger.info(
      "[auth] Applied Anthropic subscription credentials to environment",
    );
    try {
      const { applyClaudeCodeStealth } = await import("./apply-stealth");
      applyClaudeCodeStealth();
    } catch (err) {
      logger.warn(
        `[auth] Failed to apply Claude stealth: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  const codexToken = await getAccessToken("openai-codex");
  if (codexToken) {
    process.env.OPENAI_API_KEY = codexToken;
    logger.info(
      "[auth] Applied OpenAI Codex subscription credentials to environment",
    );
  }

  if (config?.agents?.defaults) {
    const defaults = config.agents.defaults;
    const provider =
      defaults.subscriptionProvider as keyof typeof SUBSCRIPTION_PROVIDER_MAP;
    const modelId = provider ? SUBSCRIPTION_PROVIDER_MAP[provider] : undefined;
    if (modelId) {
      if (!defaults.model) {
        defaults.model = { primary: modelId };
        logger.info(
          `[auth] Auto-set model.primary to "${modelId}" from subscription provider`,
        );
      } else if (!defaults.model.primary) {
        defaults.model.primary = modelId;
        logger.info(
          `[auth] Auto-set model.primary to "${modelId}" from subscription provider`,
        );
      }
    }
  }
}
