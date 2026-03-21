import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensurePrivyWalletsForCustomUser,
  isPrivyWalletProvisioningEnabled,
} from "./privy-wallets.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("privy-wallets", () => {
  const originalFetch = globalThis.fetch;
  const envBackup: Record<string, string | undefined> = {};
  const managedEnvKeys = [
    "PRIVY_APP_ID",
    "PRIVY_APP_SECRET",
    "PRIVY_API_BASE_URL",
    "BABYLON_PRIVY_APP_ID",
    "BABYLON_PRIVY_APP_SECRET",
  ] as const;

  beforeEach(() => {
    for (const key of managedEnvKeys) {
      envBackup[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    for (const key of managedEnvKeys) {
      const previous = envBackup[key];
      if (typeof previous === "string") {
        process.env[key] = previous;
      } else {
        delete process.env[key];
      }
    }
  });

  it("detects whether Privy provisioning is configured", () => {
    expect(isPrivyWalletProvisioningEnabled()).toBe(false);
    process.env.PRIVY_APP_ID = "app-id";
    process.env.PRIVY_APP_SECRET = "app-secret";
    expect(isPrivyWalletProvisioningEnabled()).toBe(true);
  });

  it("creates a new Privy user and returns ethereum + solana addresses", async () => {
    process.env.PRIVY_APP_ID = "app-id";
    process.env.PRIVY_APP_SECRET = "app-secret";
    process.env.PRIVY_API_BASE_URL = "https://example.privy.test/v1";

    const fetchMock =
      vi.fn<
        (input: string | URL | Request, init?: RequestInit) => Promise<Response>
      >();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "not found" }, 404))
      .mockResolvedValueOnce(jsonResponse({ id: "did:privy:alice" }, 201))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "wallet-eth-1",
              chain_type: "ethereum",
              address: "0x1111111111111111111111111111111111111111",
            },
            {
              id: "wallet-sol-1",
              chain_type: "solana",
              address: "So11111111111111111111111111111111111111112",
            },
          ],
        }),
      );
    globalThis.fetch = fetchMock;

    const result = await ensurePrivyWalletsForCustomUser("cloud-user-1");
    expect(result.createdUser).toBe(true);
    expect(result.userId).toBe("did:privy:alice");
    expect(result.evmAddress).toBe(
      "0x1111111111111111111111111111111111111111",
    );
    expect(result.solanaAddress).toBe(
      "So11111111111111111111111111111111111111112",
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall?.[0]).toBe(
      "https://example.privy.test/v1/users/custom_auth/id",
    );
    expect(
      (firstCall?.[1]?.headers as Record<string, string>)?.Authorization,
    ).toContain("Basic ");
  });

  it("provisions missing chains for an existing Privy user", async () => {
    process.env.BABYLON_PRIVY_APP_ID = "fallback-app-id";
    process.env.BABYLON_PRIVY_APP_SECRET = "fallback-app-secret";
    process.env.PRIVY_API_BASE_URL = "https://example.privy.test/v1";

    const fetchMock =
      vi.fn<
        (input: string | URL | Request, init?: RequestInit) => Promise<Response>
      >();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "did:privy:bob" }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "wallet-eth-1",
              chain_type: "ethereum",
              address: "0x2222222222222222222222222222222222222222",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: "wallet-sol-2" }, 201))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "wallet-eth-1",
              chain_type: "ethereum",
              address: "0x2222222222222222222222222222222222222222",
            },
            {
              id: "wallet-sol-2",
              chain_type: "solana",
              address: "So11111111111111111111111111111111111111112",
            },
          ],
        }),
      );
    globalThis.fetch = fetchMock;

    const result = await ensurePrivyWalletsForCustomUser("cloud-user-2");
    expect(result.createdUser).toBe(false);
    expect(result.userId).toBe("did:privy:bob");
    expect(result.evmAddress).toBe(
      "0x2222222222222222222222222222222222222222",
    );
    expect(result.solanaAddress).toBe(
      "So11111111111111111111111111111111111111112",
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const createWalletCall = fetchMock.mock.calls[2];
    expect(createWalletCall?.[0]).toBe(
      "https://example.privy.test/v1/users/did%3Aprivy%3Abob/wallets",
    );
    expect(createWalletCall?.[1]?.method).toBe("POST");
    expect(createWalletCall?.[1]?.body).toBe(
      JSON.stringify({ chain_type: "solana" }),
    );
  });

  it("throws when Privy credentials are missing", async () => {
    await expect(
      ensurePrivyWalletsForCustomUser("cloud-user-3"),
    ).rejects.toThrow(/not configured/i);
  });
});
