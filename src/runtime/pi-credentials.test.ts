import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionProvider } from "../auth/types.js";

const loadCredentialsMock = vi.fn();
const getAccessTokenMock = vi.fn();

vi.mock("../auth/credentials.js", () => ({
  loadCredentials: (provider: SubscriptionProvider) =>
    loadCredentialsMock(provider),
  getAccessToken: (provider: SubscriptionProvider) =>
    getAccessTokenMock(provider),
}));

import { createPiCredentialProvider } from "./pi-credentials.js";

describe("pi credential provider", () => {
  let tmpDir: string;
  let prevPiAgentDir: string | undefined;

  beforeEach(async () => {
    loadCredentialsMock.mockReset();
    getAccessTokenMock.mockReset();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "milady-pi-creds-"));
    await fs.writeFile(path.join(tmpDir, "auth.json"), "{}", "utf8");
    await fs.writeFile(path.join(tmpDir, "settings.json"), "{}", "utf8");
    prevPiAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = tmpDir;
  });

  afterEach(async () => {
    if (prevPiAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = prevPiAgentDir;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("falls back to Milady openai-codex subscription credentials", async () => {
    loadCredentialsMock.mockImplementation((provider: SubscriptionProvider) =>
      provider === "openai-codex"
        ? {
          provider,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          credentials: {
            access: "token",
            refresh: "refresh",
            expires: Date.now() + 60_000,
          },
        }
        : null,
    );
    getAccessTokenMock.mockImplementation((provider: SubscriptionProvider) =>
      provider === "openai-codex" ? Promise.resolve("codex-access-token") : Promise.resolve(null),
    );

    const provider = await createPiCredentialProvider();
    expect(provider.hasCredentials("openai-codex")).toBe(true);
    expect(await provider.getDefaultModelSpec()).toBe("openai-codex/gpt-5.1");
    expect(await provider.getApiKey("openai-codex")).toBe(
      "codex-access-token",
    );
  });

  it("prefers pi auth.json credentials over Milady subscription fallback", async () => {
    await fs.writeFile(
      path.join(tmpDir, "auth.json"),
      JSON.stringify(
        {
          "openai-codex": {
            type: "api_key",
            key: "pi-auth-token",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    loadCredentialsMock.mockReturnValue({
      provider: "openai-codex",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      credentials: {
        access: "token",
        refresh: "refresh",
        expires: Date.now() + 60_000,
      },
    });
    getAccessTokenMock.mockResolvedValue("milady-subscription-token");

    const provider = await createPiCredentialProvider();
    expect(await provider.getApiKey("openai-codex")).toBe("pi-auth-token");
    expect(getAccessTokenMock).not.toHaveBeenCalled();
  });
});
