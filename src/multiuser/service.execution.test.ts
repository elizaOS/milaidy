import { describe, expect, it, vi } from "vitest";
import { MultiUserService } from "./service.js";

function seedEnv() {
  process.env.MILAIDY_AUTH_JWT_SECRET = "x".repeat(64);
  // 32 bytes base64
  process.env.MILAIDY_SECRET_KEYS =
    "1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  process.env.MILAIDY_SECRET_KEY_ACTIVE_VERSION = "1";
  process.env.MILAIDY_REQUIRE_USER_PROVIDER_SECRET = "0";
}

describe("MultiUserService execution backend", () => {
  it("uses the execution backend when configured (not simulated)", async () => {
    seedEnv();
    const svc = new MultiUserService();
    svc.setExecutionBackend(async ({ integrationId, action }) => ({
      simulated: false,
      integrationId,
      action,
      ok: true,
    }));

    // Bypass auth/permissions plumbing by creating a user via signup.
    const signup = await svc.signup(
      { email: "a@b.com", password: "pass1234", displayName: "A" },
      { userAgent: null, ipAddress: "127.0.0.1" },
    );
    const userId = signup.user.id;

    // Enable execution for a safe integration.
    svc.patchPermissions(userId, {
      integrationId: "solana-wallet",
      enabled: true,
      executionEnabled: true,
    });

    const res = await svc.executeAction(userId, {
      integrationId: "solana-wallet",
      action: "TEST_ACTION",
      params: {},
    });
    expect(res.status).toBe("completed");
    expect(res.output).toMatchObject({ simulated: false, ok: true });
  });

  it("fails when strict mode blocks simulated execution and no backend exists", async () => {
    seedEnv();
    process.env.MILAIDY_MULTIUSER_BLOCK_SIMULATED_EXECUTION = "1";
    const svc = new MultiUserService();

    const signup = await svc.signup(
      { email: "c@d.com", password: "pass1234", displayName: "C" },
      { userAgent: null, ipAddress: "127.0.0.1" },
    );
    const userId = signup.user.id;
    svc.patchPermissions(userId, {
      integrationId: "solana-wallet",
      enabled: true,
      executionEnabled: true,
    });

    await expect(
      svc.executeAction(userId, {
        integrationId: "solana-wallet",
        action: "TEST_ACTION",
        params: {},
      }),
    ).rejects.toThrow(/Execution backend is not configured/);
  });
});
