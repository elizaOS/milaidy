/**
 * Anthropic OAuth flow (Claude Pro/Max subscription)
 *
 */

import type { OAuthCredentials } from "./types";

export interface AnthropicFlow {
  authUrl: string;
  submitCode: (code: string) => void;
  credentials: Promise<OAuthCredentials>;
}

export async function startAnthropicLogin(): Promise<AnthropicFlow> {
  throw new Error("Anthropic OAuth is disabled.");
}

export async function refreshAnthropicToken(
  _refreshToken: string,
): Promise<OAuthCredentials> {
  throw new Error("Anthropic token refresh is disabled.");
}
