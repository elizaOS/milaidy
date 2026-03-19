import { afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetEnvApiKey = vi.fn();
const mockGetOAuthApiKey = vi.fn();

vi.mock("@mariozechner/pi-ai", () => ({
  getEnvApiKey: (...args: unknown[]) => mockGetEnvApiKey(...args),
  getOAuthApiKey: (...args: unknown[]) => mockGetOAuthApiKey(...args),
}));

const mockLoadCredentials = vi.fn();
const mockGetAccessToken = vi.fn();

vi.mock("../../auth/credentials.js", () => ({
  loadCredentials: (...args: unknown[]) => mockLoadCredentials(...args),
  getAccessToken: (...args: unknown[]) => mockGetAccessToken(...args),
}));

const mockReadFile = vi.fn();

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
  },
}));

vi.mock("@elizaos/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@elizaos/core")>();
  return {
    ...actual,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { createPiCredentialProvider } from "../pi-credentials.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createPiCredentialProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockGetEnvApiKey.mockReset();
    mockGetOAuthApiKey.mockReset();
    mockLoadCredentials.mockReset();
    mockGetAccessToken.mockReset();
    mockReadFile.mockReset();
  });

  // ---- Token resolution ----

  describe("token resolution", () => {
    it("returns env API key when available (highest priority)", async () => {
      // No auth.json / settings.json
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockGetEnvApiKey.mockReturnValue("env-api-key-123");

      const provider = await createPiCredentialProvider();

      const key = await provider.getApiKey("anthropic");
      expect(key).toBe("env-api-key-123");
      expect(mockGetEnvApiKey).toHaveBeenCalledWith("anthropic");
    });

    it("returns api_key from auth.json when env key is absent", async () => {
      const authJson = JSON.stringify({
        anthropic: { type: "api_key", key: "file-api-key-456" },
      });
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.endsWith("auth.json")) return Promise.resolve(authJson);
        return Promise.reject(new Error("ENOENT"));
      });
      mockGetEnvApiKey.mockReturnValue(undefined);

      const provider = await createPiCredentialProvider();

      const key = await provider.getApiKey("anthropic");
      expect(key).toBe("file-api-key-456");
    });

    it("hasCredentials returns true for env key", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockGetEnvApiKey.mockReturnValue("env-key");

      const provider = await createPiCredentialProvider();

      expect(provider.hasCredentials("anthropic")).toBe(true);
    });

    it("hasCredentials returns true for auth.json entry", async () => {
      const authJson = JSON.stringify({
        openai: { type: "api_key", key: "openai-key" },
      });
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.endsWith("auth.json")) return Promise.resolve(authJson);
        return Promise.reject(new Error("ENOENT"));
      });
      mockGetEnvApiKey.mockReturnValue(undefined);

      const provider = await createPiCredentialProvider();

      expect(provider.hasCredentials("openai")).toBe(true);
    });

    it("hasCredentials returns false when no credentials exist", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockGetEnvApiKey.mockReturnValue(undefined);
      mockLoadCredentials.mockReturnValue(null);

      const provider = await createPiCredentialProvider();

      expect(provider.hasCredentials("unknown-provider")).toBe(false);
    });
  });

  // ---- OAuth refresh handling ----

  describe("OAuth refresh handling", () => {
    it("resolves OAuth token via getOAuthApiKey", async () => {
      const authJson = JSON.stringify({
        anthropic: {
          type: "oauth",
          access: "old-access-token",
          refresh: "refresh-token",
          expires: Date.now() + 3600_000,
        },
      });
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.endsWith("auth.json")) return Promise.resolve(authJson);
        return Promise.reject(new Error("ENOENT"));
      });
      mockGetEnvApiKey.mockReturnValue(undefined);

      // Capture the credentials object snapshot before mutation
      let capturedCreds: Record<string, unknown> | null = null;
      mockGetOAuthApiKey.mockImplementation(
        (_provider: string, creds: Record<string, unknown>) => {
          // Snapshot before the caller mutates the object
          capturedCreds = JSON.parse(JSON.stringify(creds));
          return Promise.resolve({
            apiKey: "refreshed-token-789",
            newCredentials: {
              access: "refreshed-token-789",
              refresh: "new-refresh",
              expires: Date.now() + 7200_000,
            },
          });
        },
      );

      const provider = await createPiCredentialProvider();

      const key = await provider.getApiKey("anthropic");
      expect(key).toBe("refreshed-token-789");
      expect(mockGetOAuthApiKey).toHaveBeenCalledWith(
        "anthropic",
        expect.any(Object),
      );
      // Verify the credentials were the originals at call time
      expect(capturedCreds).toEqual({
        anthropic: expect.objectContaining({
          access: "old-access-token",
          refresh: "refresh-token",
        }),
      });
    });

    it("falls back to existing access token when OAuth refresh fails", async () => {
      const authJson = JSON.stringify({
        anthropic: {
          type: "oauth",
          access: "existing-access-token",
          refresh: "refresh-token",
          expires: Date.now() - 1000, // expired
        },
      });
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.endsWith("auth.json")) return Promise.resolve(authJson);
        return Promise.reject(new Error("ENOENT"));
      });
      mockGetEnvApiKey.mockReturnValue(undefined);
      mockGetOAuthApiKey.mockRejectedValue(new Error("OAuth server down"));

      const provider = await createPiCredentialProvider();

      const key = await provider.getApiKey("anthropic");
      // Should fall back to entry.access
      expect(key).toBe("existing-access-token");
    });

    it("returns undefined when getOAuthApiKey returns null", async () => {
      const authJson = JSON.stringify({
        anthropic: {
          type: "oauth",
          access: "access-token",
          refresh: "refresh-token",
          expires: Date.now() + 3600_000,
        },
      });
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.endsWith("auth.json")) return Promise.resolve(authJson);
        return Promise.reject(new Error("ENOENT"));
      });
      mockGetEnvApiKey.mockReturnValue(undefined);
      mockGetOAuthApiKey.mockResolvedValue(null);

      const provider = await createPiCredentialProvider();

      const key = await provider.getApiKey("anthropic");
      expect(key).toBeUndefined();
    });

    it("remembers refreshed credentials for subsequent calls", async () => {
      const authJson = JSON.stringify({
        anthropic: {
          type: "oauth",
          access: "old-access",
          refresh: "old-refresh",
          expires: Date.now() + 3600_000,
        },
      });
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.endsWith("auth.json")) return Promise.resolve(authJson);
        return Promise.reject(new Error("ENOENT"));
      });
      mockGetEnvApiKey.mockReturnValue(undefined);

      const newCreds = {
        access: "new-access",
        refresh: "new-refresh",
        expires: Date.now() + 7200_000,
      };
      mockGetOAuthApiKey
        .mockResolvedValueOnce({
          apiKey: "first-key",
          newCredentials: newCreds,
        })
        .mockResolvedValueOnce({
          apiKey: "second-key",
          newCredentials: newCreds,
        });

      const provider = await createPiCredentialProvider();

      await provider.getApiKey("anthropic");

      // Second call should use updated in-memory credentials
      await provider.getApiKey("anthropic");

      // The second call should have been passed the updated credentials
      const secondCallCreds = mockGetOAuthApiKey.mock.calls[1][1];
      expect(secondCallCreds.anthropic.access).toBe("new-access");
      expect(secondCallCreds.anthropic.refresh).toBe("new-refresh");
    });
  });

  // ---- Fallback behavior (Eliza subscription) ----

  describe("fallback to Eliza subscription credentials", () => {
    it("falls back to Eliza subscription for openai-codex", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockGetEnvApiKey.mockReturnValue(undefined);
      mockGetAccessToken.mockResolvedValue("codex-subscription-token");

      const provider = await createPiCredentialProvider();

      const key = await provider.getApiKey("openai-codex");
      expect(key).toBe("codex-subscription-token");
      expect(mockGetAccessToken).toHaveBeenCalledWith("openai-codex");
    });

    it("falls back to Eliza subscription for anthropic", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockGetEnvApiKey.mockReturnValue(undefined);
      mockGetAccessToken.mockResolvedValue("anthropic-sub-token");

      const provider = await createPiCredentialProvider();

      const key = await provider.getApiKey("anthropic");
      expect(key).toBe("anthropic-sub-token");
      expect(mockGetAccessToken).toHaveBeenCalledWith("anthropic-subscription");
    });

    it("returns undefined when no fallback available", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockGetEnvApiKey.mockReturnValue(undefined);
      mockGetAccessToken.mockResolvedValue(null);

      const provider = await createPiCredentialProvider();

      const key = await provider.getApiKey("some-unknown-provider");
      expect(key).toBeUndefined();
    });

    it("hasCredentials checks Eliza subscription as fallback", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockGetEnvApiKey.mockReturnValue(undefined);
      mockLoadCredentials.mockImplementation((p: string) => {
        if (p === "openai-codex") return { accessToken: "token" };
        return null;
      });

      const provider = await createPiCredentialProvider();

      expect(provider.hasCredentials("openai-codex")).toBe(true);
      expect(provider.hasCredentials("google")).toBe(false);
    });

    it("returns undefined when subscription getAccessToken throws", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockGetEnvApiKey.mockReturnValue(undefined);
      mockGetAccessToken.mockRejectedValue(new Error("Token expired"));

      const provider = await createPiCredentialProvider();

      const key = await provider.getApiKey("openai-codex");
      expect(key).toBeUndefined();
    });
  });

  // ---- getDefaultModelSpec ----

  describe("getDefaultModelSpec", () => {
    it("returns provider/model from settings.json", async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.endsWith("settings.json"))
          return Promise.resolve(
            JSON.stringify({
              defaultProvider: "openai",
              defaultModel: "gpt-5",
            }),
          );
        if (filePath.endsWith("auth.json")) return Promise.resolve("{}");
        return Promise.reject(new Error("ENOENT"));
      });

      const provider = await createPiCredentialProvider();

      const spec = await provider.getDefaultModelSpec();
      expect(spec).toBe("openai/gpt-5");
    });

    it("falls back to openai-codex default when subscription available", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockLoadCredentials.mockImplementation((p: string) => {
        if (p === "openai-codex") return { accessToken: "token" };
        return null;
      });

      const provider = await createPiCredentialProvider();

      const spec = await provider.getDefaultModelSpec();
      expect(spec).toBe("openai-codex/gpt-5.1");
    });

    it("falls back to anthropic default when only anthropic subscription available", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockLoadCredentials.mockImplementation((p: string) => {
        if (p === "anthropic-subscription") return { accessToken: "token" };
        return null;
      });

      const provider = await createPiCredentialProvider();

      const spec = await provider.getDefaultModelSpec();
      expect(spec).toBe("anthropic/claude-sonnet-4-20250514");
    });

    it("returns undefined when no settings or subscriptions exist", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockLoadCredentials.mockReturnValue(null);

      const provider = await createPiCredentialProvider();

      const spec = await provider.getDefaultModelSpec();
      expect(spec).toBeUndefined();
    });
  });
});
