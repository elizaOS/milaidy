/**
 * OpenAI Codex (ChatGPT Plus/Pro subscription) OAuth flow
 *
 * Disabled.
 */

import type { OAuthCredentials } from "./types";

export interface CodexFlow {
  authUrl: string;
  state: string;
  submitCode: (code: string) => void;
  credentials: Promise<OAuthCredentials>;
  close: () => void;
}

export function startCodexLogin(): Promise<CodexFlow> {
  return Promise.reject(new Error("OpenAI Codex OAuth is disabled."));
}

export async function refreshCodexToken(
  _refreshToken: string,
): Promise<OAuthCredentials> {
  throw new Error("Codex token refresh is disabled.");
}
