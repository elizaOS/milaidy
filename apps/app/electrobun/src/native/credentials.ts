/**
 * Credential Auto-Detection for AI Providers
 *
 * Scans well-known file locations, environment variables, and the macOS
 * Keychain to detect installed AI CLI credentials. Used during onboarding
 * to pre-fill the connection step.
 *
 * Sources checked:
 * - ~/.codex/auth.json (OpenAI via Codex CLI)
 * - ~/.claude/.credentials.json (Anthropic via Claude Code)
 * - macOS Keychain: "Claude Code-credentials" (Anthropic OAuth)
 * - Environment variables: OPENAI_API_KEY, ANTHROPIC_API_KEY
 * - CLI availability: `which claude`, `which codex`
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface DetectedProvider {
  id: string;
  source: string;
  apiKey?: string;
  authMode?: string;
  cliInstalled: boolean;
}

interface CodexAuthJson {
  auth_mode?: string;
  OPENAI_API_KEY?: string;
}

interface ClaudeCredentialsJson {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
  };
}

function extractOauthAccessToken(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const token =
        item && typeof item === "object" ? extractOauthAccessToken(item) : null;
      if (token) return token;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const directToken = record.accessToken ?? record.access_token;
  if (typeof directToken === "string") {
    const trimmed = directToken.trim();
    if (trimmed.length > 0) return trimmed;
  }

  for (const nestedValue of Object.values(record)) {
    const token =
      nestedValue && typeof nestedValue === "object"
        ? extractOauthAccessToken(nestedValue)
        : null;
    if (token) return token;
  }

  return null;
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function isCliInstalled(name: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", name], {
      stdout: "pipe",
      stderr: "ignore",
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

async function readKeychainCredential(service: string): Promise<string | null> {
  if (process.platform !== "darwin") return null;
  try {
    const proc = Bun.spawn(
      ["security", "find-generic-password", "-s", service, "-w"],
      { stdout: "pipe", stderr: "pipe" },
    );
    const exitCode = await proc.exited;
    if (exitCode !== 0) return null;
    const output = await new Response(proc.stdout).text();
    const trimmed = output.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

async function scanCodexCredentials(
  home: string,
): Promise<DetectedProvider | null> {
  const authPath = path.join(home, ".codex", "auth.json");
  const data = readJsonFile<CodexAuthJson>(authPath);
  if (!data?.OPENAI_API_KEY) return null;

  const cliInstalled = await isCliInstalled("codex");
  return {
    id: "openai",
    source: "codex-auth",
    apiKey: data.OPENAI_API_KEY,
    authMode: data.auth_mode ?? "api-key",
    cliInstalled,
  };
}

async function scanClaudeFileCredentials(
  home: string,
): Promise<DetectedProvider | null> {
  const credPath = path.join(home, ".claude", ".credentials.json");
  const data = readJsonFile<ClaudeCredentialsJson>(credPath);
  const token = extractOauthAccessToken(data);
  if (!token) return null;

  const cliInstalled = await isCliInstalled("claude");
  return {
    id: "anthropic-subscription",
    source: "claude-credentials",
    apiKey: token,
    authMode: "oauth",
    cliInstalled,
  };
}

async function scanClaudeKeychainCredentials(): Promise<DetectedProvider | null> {
  const keychainData = await readKeychainCredential("Claude Code-credentials");
  if (!keychainData) return null;

  // The keychain value may be a JSON blob with OAuth tokens
  try {
    const parsed = JSON.parse(keychainData) as Record<string, unknown>;
    const token = extractOauthAccessToken(parsed);
    if (!token) return null;

    const cliInstalled = await isCliInstalled("claude");
    return {
      id: "anthropic-subscription",
      source: "keychain",
      apiKey: token,
      authMode: "oauth",
      cliInstalled,
    };
  } catch {
    // Not JSON — treat the raw string as the credential
    const cliInstalled = await isCliInstalled("claude");
    return {
      id: "anthropic-subscription",
      source: "keychain",
      apiKey: keychainData,
      authMode: "oauth",
      cliInstalled,
    };
  }
}

function scanEnvCredentials(): DetectedProvider[] {
  const results: DetectedProvider[] = [];

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && openaiKey.trim().length > 0) {
    results.push({
      id: "openai",
      source: "env",
      apiKey: openaiKey.trim(),
      authMode: "api-key",
      cliInstalled: false,
    });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey && anthropicKey.trim().length > 0) {
    results.push({
      id: "anthropic",
      source: "env",
      apiKey: anthropicKey.trim(),
      authMode: "api-key",
      cliInstalled: false,
    });
  }

  return results;
}

/**
 * Scan all known credential sources and return detected providers.
 * Checks files → keychain → env vars, deduplicating by provider ID
 * (first match wins per provider).
 */
export async function scanProviderCredentials(): Promise<DetectedProvider[]> {
  const home = os.homedir();
  const detected = new Map<string, DetectedProvider>();

  // File-based credentials (highest priority)
  const [codex, claudeFile] = await Promise.all([
    scanCodexCredentials(home),
    scanClaudeFileCredentials(home),
  ]);

  if (codex) detected.set(codex.id, codex);
  if (claudeFile) detected.set(claudeFile.id, claudeFile);

  // Keychain (only if no Claude subscription credential was detected from file)
  if (!detected.has("anthropic-subscription")) {
    const keychainResult = await scanClaudeKeychainCredentials();
    if (keychainResult) detected.set(keychainResult.id, keychainResult);
  }

  // Environment variables (lowest priority — only fills gaps)
  for (const envProvider of scanEnvCredentials()) {
    if (!detected.has(envProvider.id)) {
      detected.set(envProvider.id, envProvider);
    }
  }

  return Array.from(detected.values());
}
