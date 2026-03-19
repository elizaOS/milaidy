export const ELIZA_TOOLS_OAUTH_PROVIDER = "__eliza_tools_oauth__";

export function isElizaToolsOAuthProvider(value: unknown): boolean {
  return value === ELIZA_TOOLS_OAUTH_PROVIDER;
}
