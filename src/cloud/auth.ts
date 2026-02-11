/**
 * Eliza Cloud login flow — reuses the CLI auth session pattern:
 * create session, open browser, poll until authenticated, return API key.
 */

import crypto from "node:crypto";
import { logger } from "@elizaos/core";

export interface CloudLoginResult {
  apiKey: string;
  keyPrefix: string;
  expiresAt: string | null;
}

export interface CloudLoginOptions {
  baseUrl?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  onBrowserUrl?: (url: string) => void;
  onPollStatus?: (status: string) => void;
}

export async function cloudLogin(
  options: CloudLoginOptions = {},
): Promise<CloudLoginResult> {
  const baseUrl = (options.baseUrl ?? "https://www.elizacloud.ai").replace(
    /\/+$/,
    "",
  );
  const timeoutMs = options.timeoutMs ?? 300_000;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const sessionId = crypto.randomUUID();

  logger.info("[cloud-auth] Creating auth session...");

  const createResponse = await fetch(`${baseUrl}/api/auth/cli-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(
      `Failed to create auth session (HTTP ${createResponse.status}): ${errorText}`,
    );
  }

  const browserUrl = `${baseUrl}/auth/cli-login?session=${encodeURIComponent(sessionId)}`;
  logger.info(`[cloud-auth] Browser URL: ${browserUrl}`);
  options.onBrowserUrl?.(browserUrl);

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const pollResponse = await fetch(
      `${baseUrl}/api/auth/cli-session/${encodeURIComponent(sessionId)}`,
    );

    if (!pollResponse.ok) {
      if (pollResponse.status === 404) {
        throw new Error("Auth session expired or not found. Please try again.");
      }
      options.onPollStatus?.("error");
      continue;
    }

    const data = (await pollResponse.json()) as {
      status: string;
      apiKey?: string;
      keyPrefix?: string;
      expiresAt?: string;
    };

    options.onPollStatus?.(data.status);

    if (data.status === "authenticated" && data.apiKey) {
      logger.info("[cloud-auth] Authentication complete");
      return {
        apiKey: data.apiKey,
        keyPrefix: data.keyPrefix ?? "",
        expiresAt: data.expiresAt ?? null,
      };
    }

    if (data.status === "authenticated" && !data.apiKey) {
      throw new Error(
        "Auth session was completed but the API key was already retrieved. Please try logging in again.",
      );
    }
  }

  throw new Error(
    `Cloud login timed out. The browser login was not completed within ${Math.round(timeoutMs / 1000)} seconds.`,
  );
}
