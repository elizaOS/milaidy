import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetCloudSecretsForTesting,
  getCloudSecret,
  scrubCloudSecretsFromEnv,
} from "./cloud-secrets";

describe("cloud-secrets", () => {
  beforeEach(() => {
    _resetCloudSecretsForTesting();
    delete process.env.ELIZAOS_CLOUD_API_KEY;
    delete process.env.ELIZAOS_CLOUD_ENABLED;
  });

  afterEach(() => {
    _resetCloudSecretsForTesting();
    delete process.env.ELIZAOS_CLOUD_API_KEY;
    delete process.env.ELIZAOS_CLOUD_ENABLED;
  });

  it("scrubs secrets from process.env into sealed store", () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "ck-secret";
    process.env.ELIZAOS_CLOUD_ENABLED = "true";

    scrubCloudSecretsFromEnv();

    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBeUndefined();
    expect(process.env.ELIZAOS_CLOUD_ENABLED).toBeUndefined();
    expect(getCloudSecret("ELIZAOS_CLOUD_API_KEY")).toBe("ck-secret");
    expect(getCloudSecret("ELIZAOS_CLOUD_ENABLED")).toBe("true");
  });

  it("getCloudSecret falls back to process.env for docker entrypoints", () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "ck-docker";
    expect(getCloudSecret("ELIZAOS_CLOUD_API_KEY")).toBe("ck-docker");
  });

  it("scrubbed key is not enumerable in process.env", () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "ck-hidden";
    scrubCloudSecretsFromEnv();

    expect(Object.keys(process.env)).not.toContain("ELIZAOS_CLOUD_API_KEY");
    expect(JSON.stringify(process.env)).not.toContain("ck-hidden");
  });

  it("no-ops when process.env has no cloud keys", () => {
    scrubCloudSecretsFromEnv();
    expect(getCloudSecret("ELIZAOS_CLOUD_API_KEY")).toBeUndefined();
  });

  it("_resetCloudSecretsForTesting clears the sealed store", () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "ck-temp";
    scrubCloudSecretsFromEnv();
    expect(getCloudSecret("ELIZAOS_CLOUD_API_KEY")).toBe("ck-temp");

    _resetCloudSecretsForTesting();
    expect(getCloudSecret("ELIZAOS_CLOUD_API_KEY")).toBeUndefined();
  });
});
