import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertNoPlaintextSecretsInProduction,
  loadMiladyConfig,
  type MiladyConfig,
  saveMiladyConfig,
} from "./config";

const ORIGINAL_CONFIG_PATH = process.env.MILADY_CONFIG_PATH;
const ORIGINAL_STATE_DIR = process.env.MILADY_STATE_DIR;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_ALLOW_PLAINTEXT = process.env.MILADY_ALLOW_PLAINTEXT_SECRETS;
const ORIGINAL_CONFIG_SECRET_KEY = process.env.MILADY_CONFIG_SECRET_KEY;

afterEach(() => {
  if (ORIGINAL_CONFIG_PATH === undefined) {
    delete process.env.MILADY_CONFIG_PATH;
  } else {
    process.env.MILADY_CONFIG_PATH = ORIGINAL_CONFIG_PATH;
  }

  if (ORIGINAL_STATE_DIR === undefined) {
    delete process.env.MILADY_STATE_DIR;
  } else {
    process.env.MILADY_STATE_DIR = ORIGINAL_STATE_DIR;
  }

  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }

  if (ORIGINAL_ALLOW_PLAINTEXT === undefined) {
    delete process.env.MILADY_ALLOW_PLAINTEXT_SECRETS;
  } else {
    process.env.MILADY_ALLOW_PLAINTEXT_SECRETS = ORIGINAL_ALLOW_PLAINTEXT;
  }

  if (ORIGINAL_CONFIG_SECRET_KEY === undefined) {
    delete process.env.MILADY_CONFIG_SECRET_KEY;
  } else {
    process.env.MILADY_CONFIG_SECRET_KEY = ORIGINAL_CONFIG_SECRET_KEY;
  }
});

describe("saveMiladyConfig", () => {
  it("strips WALLET_DISCONNECT and seals secrets from persisted env", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "milady-config-"));
    const configPath = path.join(tempRoot, "milady.json");
    process.env.MILADY_CONFIG_PATH = configPath;
    process.env.MILADY_STATE_DIR = tempRoot;
    process.env.MILADY_CONFIG_SECRET_KEY = "test-config-secret-key";

    const config: MiladyConfig = {
      env: {
        OPENAI_API_KEY: "sk-test",
        OPENAI_BASE_URL: "https://api.openai.com/v1",
        WALLET_DISCONNECT: "1",
      } as Record<string, string>,
    };

    saveMiladyConfig(config);

    const persisted = JSON.parse(
      fs.readFileSync(configPath, "utf-8"),
    ) as Record<string, unknown> & {
      env?: Record<string, unknown>;
    };
    expect(persisted.env?.OPENAI_API_KEY).toBeUndefined();
    expect(persisted.env?.OPENAI_BASE_URL).toBe("https://api.openai.com/v1");
    expect(persisted.env?.WALLET_DISCONNECT).toBeUndefined();
    expect(persisted.__envSecretsV1).toBeDefined();

    const loaded = loadMiladyConfig();
    expect(loaded.env?.OPENAI_API_KEY).toBe("sk-test");
    expect(loaded.env?.OPENAI_BASE_URL).toBe("https://api.openai.com/v1");
  });
});

describe("assertNoPlaintextSecretsInProduction", () => {
  it("throws in production when plaintext secrets are present", () => {
    process.env.NODE_ENV = "production";
    delete process.env.MILADY_ALLOW_PLAINTEXT_SECRETS;

    const config: MiladyConfig = {
      env: {
        OPENAI_API_KEY: "sk-live",
      } as Record<string, string>,
    };

    expect(() => assertNoPlaintextSecretsInProduction(config)).toThrow(
      /Refusing to boot in production with plaintext secrets in config/,
    );
  });

  it("allows plaintext secrets in production only with explicit break-glass env", () => {
    process.env.NODE_ENV = "production";
    process.env.MILADY_ALLOW_PLAINTEXT_SECRETS = "1";

    const config: MiladyConfig = {
      env: {
        OPENAI_API_KEY: "sk-live",
      } as Record<string, string>,
    };

    expect(() => assertNoPlaintextSecretsInProduction(config)).not.toThrow();
  });
});
