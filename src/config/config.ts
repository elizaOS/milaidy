import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSON5 from "json5";
import { collectConfigEnvVars } from "./env-vars";
import { resolveConfigIncludes } from "./includes";
import { resolveConfigPath, resolveUserPath } from "./paths";
import type { MiladyConfig } from "./types";

export * from "./types";

const PLAINTEXT_SECRET_ALLOW_ENV = "MILADY_ALLOW_PLAINTEXT_SECRETS";
const CONFIG_SECRET_KEY_ENV = "MILADY_CONFIG_SECRET_KEY";
const ENCRYPTED_ENV_SECRETS_KEY = "__envSecretsV1";
const PLAINTEXT_SECRET_KEY_RE =
  /(?:^|_)(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY|MNEMONIC)(?:$|_)/i;

type EncryptedEnvSecretsV1 = {
  v: 1;
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  data: string;
};

function deriveConfigSecretKey(): Buffer {
  const material =
    process.env[CONFIG_SECRET_KEY_ENV]?.trim() ||
    `${os.userInfo().username}|${os.hostname()}|${process.platform}|milady-config`;
  return crypto.scryptSync(material, "milady-config-secret-salt-v1", 32);
}

function encryptEnvSecrets(
  secrets: Record<string, string>,
): EncryptedEnvSecretsV1 {
  const iv = crypto.randomBytes(12);
  const key = deriveConfigSecretKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(secrets), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}

function decryptEnvSecrets(
  payload: EncryptedEnvSecretsV1,
): Record<string, string> | null {
  try {
    if (payload?.v !== 1 || payload?.alg !== "aes-256-gcm") return null;
    const key = deriveConfigSecretKey();
    const iv = Buffer.from(payload.iv, "base64");
    const tag = Buffer.from(payload.tag, "base64");
    const data = Buffer.from(payload.data, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(decrypted) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

function sealConfigEnvSecretsForPersistence(
  config: MiladyConfig,
): MiladyConfig {
  const root = config as MiladyConfig & {
    [ENCRYPTED_ENV_SECRETS_KEY]?: EncryptedEnvSecretsV1;
  };
  const envRoot = root.env as Record<string, unknown> | undefined;
  if (!envRoot || typeof envRoot !== "object" || Array.isArray(envRoot)) {
    delete root[ENCRYPTED_ENV_SECRETS_KEY];
    return config;
  }

  const secrets: Record<string, string> = {};
  for (const [key, value] of Object.entries(envRoot)) {
    if (
      PLAINTEXT_SECRET_KEY_RE.test(key) &&
      typeof value === "string" &&
      value.trim().length > 0
    ) {
      secrets[key] = value;
      delete envRoot[key];
    }
  }

  if (Object.keys(secrets).length === 0) {
    delete root[ENCRYPTED_ENV_SECRETS_KEY];
    return config;
  }

  root[ENCRYPTED_ENV_SECRETS_KEY] = encryptEnvSecrets(secrets);
  return config;
}

function hydrateConfigEnvSecrets(config: MiladyConfig): MiladyConfig {
  const root = config as MiladyConfig & {
    [ENCRYPTED_ENV_SECRETS_KEY]?: EncryptedEnvSecretsV1;
  };
  const payload = root[ENCRYPTED_ENV_SECRETS_KEY];
  if (!payload) return config;

  const decrypted = decryptEnvSecrets(payload);
  if (!decrypted) {
    console.warn(
      `[milady] Failed to decrypt persisted env secrets from ${ENCRYPTED_ENV_SECRETS_KEY}`,
    );
    return config;
  }

  if (!root.env || typeof root.env !== "object" || Array.isArray(root.env)) {
    root.env = {};
  }
  const envRoot = root.env as Record<string, unknown>;
  for (const [key, value] of Object.entries(decrypted)) {
    if (typeof envRoot[key] !== "string" || !String(envRoot[key]).trim()) {
      envRoot[key] = value;
    }
  }
  return config;
}

function collectPlaintextSecretPaths(
  value: unknown,
  pathPrefix = "config",
): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectPlaintextSecretPaths(entry, `${pathPrefix}[${index}]`),
    );
  }
  if (typeof value !== "object") return [];

  const found: string[] = [];
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = `${pathPrefix}.${key}`;
    if (
      PLAINTEXT_SECRET_KEY_RE.test(key) &&
      typeof entry === "string" &&
      entry.trim().length > 0
    ) {
      found.push(nextPath);
    }
    found.push(...collectPlaintextSecretPaths(entry, nextPath));
  }
  return found;
}

export function assertNoPlaintextSecretsInProduction(
  config: MiladyConfig,
): void {
  const isProduction = process.env.NODE_ENV === "production";
  const allowPlaintext = process.env[PLAINTEXT_SECRET_ALLOW_ENV] === "1";
  if (!isProduction || allowPlaintext) return;

  const secretPaths = collectPlaintextSecretPaths({
    env: config.env,
    cloud: config.cloud,
    x402: config.x402,
    connectors: config.connectors,
  });
  if (secretPaths.length === 0) return;

  const sample = secretPaths.slice(0, 5).join(", ");
  throw new Error(
    `Refusing to boot in production with plaintext secrets in config (${sample}). ` +
      `Use a secrets manager or set ${PLAINTEXT_SECRET_ALLOW_ENV}=1 only for temporary break-glass.`,
  );
}

export function loadMiladyConfig(): MiladyConfig {
  const configPath = resolveConfigPath();

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { logging: { level: "error" } } as MiladyConfig;
    }
    throw err;
  }

  const parsed = JSON5.parse(raw) as Record<string, unknown>;
  const resolved = resolveConfigIncludes(parsed, configPath) as MiladyConfig;
  assertNoPlaintextSecretsInProduction(resolved);
  hydrateConfigEnvSecrets(resolved);

  // Load local skills config from ~/.eliza/skills.json (if present)
  // This allows users to add local skill directories without modifying the main config.
  const skillsJsonPath = resolveUserPath("~/.eliza/skills.json");

  // Auto-create if missing so the user knows where to put skills
  if (!fs.existsSync(skillsJsonPath)) {
    try {
      const skillsDir = path.dirname(skillsJsonPath);
      if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true });
      }
      fs.writeFileSync(
        skillsJsonPath,
        JSON.stringify({ extraDirs: [] }, null, 2),
        "utf-8",
      );
    } catch (err) {
      console.warn(
        `[milady] Failed to auto-create ~/.eliza/skills.json: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  if (fs.existsSync(skillsJsonPath)) {
    try {
      const skillsRaw = fs.readFileSync(skillsJsonPath, "utf-8");
      const skillsConfig = JSON5.parse(skillsRaw) as { extraDirs?: string[] };

      if (
        skillsConfig.extraDirs &&
        Array.isArray(skillsConfig.extraDirs) &&
        skillsConfig.extraDirs.length > 0
      ) {
        if (!resolved.skills) resolved.skills = {};
        if (!resolved.skills.load) resolved.skills.load = {};
        if (!resolved.skills.load.extraDirs)
          resolved.skills.load.extraDirs = [];

        const existing = new Set(resolved.skills.load.extraDirs);
        for (const dir of skillsConfig.extraDirs) {
          const loadedDir = resolveUserPath(dir);
          if (!existing.has(loadedDir)) {
            resolved.skills.load.extraDirs.push(loadedDir);
            existing.add(loadedDir);
          }
        }
      }
    } catch (err) {
      console.warn(
        `[milady] Failed to load ~/.eliza/skills.json: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // Apply default log level so consumers don't need scattered fallbacks.
  if (!resolved.logging) {
    resolved.logging = { level: "error" };
  } else if (!resolved.logging.level) {
    resolved.logging.level = "error";
  }

  const envVars = collectConfigEnvVars(resolved);
  for (const [key, value] of Object.entries(envVars)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return resolved;
}

/**
 * Recursively strip "$include" keys from a config object before persisting.
 * Defense-in-depth: even if an API-driven config write somehow smuggles a
 * "$include" key past the merge-time blocklist, this ensures the directive
 * never reaches disk where resolveConfigIncludes would process it on the
 * next loadMiladyConfig() call.
 */
function stripIncludeDirectives(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(stripIncludeDirectives);
  if (typeof value !== "object") return value;

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key === "$include") continue;
    result[key] = stripIncludeDirectives(val);
  }
  return result;
}

const VOLATILE_ENV_KEYS = new Set(["WALLET_DISCONNECT"]);

function stripVolatileEnvKeysForPersistence(
  config: MiladyConfig,
): MiladyConfig {
  const envRoot = config.env as Record<string, unknown> | undefined;
  if (!envRoot || typeof envRoot !== "object" || Array.isArray(envRoot)) {
    return config;
  }

  for (const key of VOLATILE_ENV_KEYS) {
    delete envRoot[key];
  }

  const nestedVars = envRoot.vars as Record<string, unknown> | undefined;
  if (
    nestedVars &&
    typeof nestedVars === "object" &&
    !Array.isArray(nestedVars)
  ) {
    for (const key of VOLATILE_ENV_KEYS) {
      delete nestedVars[key];
    }
  }

  return config;
}

export function saveMiladyConfig(config: MiladyConfig): void {
  const configPath = resolveConfigPath();
  const dir = path.dirname(configPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  // Strip any $include directives before writing — defense-in-depth against
  // config include injection (see isBlockedObjectKey in server.ts).
  const sanitized = stripVolatileEnvKeysForPersistence(
    stripIncludeDirectives(config) as MiladyConfig,
  );
  sealConfigEnvSecretsForPersistence(sanitized);

  fs.writeFileSync(configPath, `${JSON.stringify(sanitized, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600, // Owner read+write only — config may contain private keys in env section
  });
}

export function configFileExists(): boolean {
  return fs.existsSync(resolveConfigPath());
}
