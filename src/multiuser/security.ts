import crypto from "node:crypto";

/**
 * Secrets safety helpers for integration credentials.
 *
 * - Encrypt at rest using AES-256-GCM.
 * - Never return plaintext from logging helpers.
 * - Support key rotation with explicit key version.
 */

const AAD_CONTEXT = "milaidy:integration-secret:v1";

export interface EncryptedSecret {
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: number;
}

/**
 * Return a display-safe token for logs and UI status surfaces.
 * Example: "sk-lk...9sZ3"
 */
export function redactSecret(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return "********";
  return `${trimmed.slice(0, 5)}...${trimmed.slice(-4)}`;
}

export function hasSecret(value: string | null | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

/**
 * Parse KMS-like keyring from env.
 * Format:
 *   MILAIDY_SECRET_KEYS="1:base64key,2:base64key"
 *   MILAIDY_SECRET_KEY_ACTIVE_VERSION="2"
 */
export function parseSecretKeyringFromEnv(env: NodeJS.ProcessEnv): {
  activeVersion: number;
  keyring: Map<number, Buffer>;
} {
  const raw = env.MILAIDY_SECRET_KEYS?.trim();
  if (!raw) {
    throw new Error("MILAIDY_SECRET_KEYS is required for multi-user secrets");
  }

  const keyring = new Map<number, Buffer>();
  for (const item of raw.split(",")) {
    const [versionRaw, keyRaw] = item.trim().split(":");
    const version = Number.parseInt(versionRaw ?? "", 10);
    if (!Number.isFinite(version) || version <= 0) {
      throw new Error(`Invalid secret key version "${versionRaw}"`);
    }
    const key = Buffer.from(keyRaw ?? "", "base64");
    if (key.length !== 32) {
      throw new Error(
        `Secret key version ${version} must be 32 bytes (base64)`,
      );
    }
    keyring.set(version, key);
  }

  const activeVersion = Number.parseInt(
    env.MILAIDY_SECRET_KEY_ACTIVE_VERSION ?? "",
    10,
  );
  if (!Number.isFinite(activeVersion) || !keyring.has(activeVersion)) {
    throw new Error(
      "MILAIDY_SECRET_KEY_ACTIVE_VERSION must reference a valid key version",
    );
  }

  return { activeVersion, keyring };
}

export function encryptSecret(
  plaintext: string,
  keyVersion: number,
  key: Buffer,
): EncryptedSecret {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(AAD_CONTEXT, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion,
  };
}

export function decryptSecret(payload: EncryptedSecret, key: Buffer): string {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.nonce, "base64"),
  );
  decipher.setAAD(Buffer.from(AAD_CONTEXT, "utf8"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
