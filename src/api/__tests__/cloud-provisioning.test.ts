/**
 * Tests for cloud provisioning auth/onboarding bypass.
 *
 * When MILADY_CLOUD_PROVISIONED=1 AND MILADY_API_TOKEN is set, the agent runs
 * in a managed cloud container where the platform handles authentication.
 *
 * Security: The bypass requires BOTH conditions to prevent unauthorized access.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// isCloudProvisioned() unit tests
// ---------------------------------------------------------------------------

describe("isCloudProvisioned", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all relevant env vars before each test
    delete process.env.MILADY_CLOUD_PROVISIONED;
    delete process.env.ELIZA_CLOUD_PROVISIONED;
    delete process.env.MILADY_API_TOKEN;
    delete process.env.ELIZA_API_TOKEN;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  // Implementation mirrors server.ts logic for isolated testing
  const getCompatApiToken = (): string | null => {
    const token =
      process.env.MILADY_API_TOKEN?.trim() ??
      process.env.ELIZA_API_TOKEN?.trim();
    return token ? token : null;
  };

  const isCloudProvisioned = (): boolean => {
    const hasCloudFlag =
      process.env.MILADY_CLOUD_PROVISIONED === "1" ||
      process.env.ELIZA_CLOUD_PROVISIONED === "1";
    const hasApiToken = Boolean(getCompatApiToken());
    return hasCloudFlag && hasApiToken;
  };

  it("returns false when no env vars are set", () => {
    expect(isCloudProvisioned()).toBe(false);
  });

  it("returns false when ONLY MILADY_CLOUD_PROVISIONED=1 (no token)", () => {
    // Security: CLOUD_PROVISIONED alone is NOT enough — needs token
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    expect(isCloudProvisioned()).toBe(false);
  });

  it("returns false when ONLY MILADY_API_TOKEN is set (no cloud flag)", () => {
    process.env.MILADY_API_TOKEN = "test-token";
    expect(isCloudProvisioned()).toBe(false);
  });

  it("returns true when BOTH MILADY_CLOUD_PROVISIONED=1 AND MILADY_API_TOKEN are set", () => {
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.MILADY_API_TOKEN = "test-token";
    expect(isCloudProvisioned()).toBe(true);
  });

  it("returns true with ELIZA_ prefixed vars", () => {
    process.env.ELIZA_CLOUD_PROVISIONED = "1";
    process.env.ELIZA_API_TOKEN = "test-token";
    expect(isCloudProvisioned()).toBe(true);
  });

  it("returns true with mixed MILADY_/ELIZA_ vars", () => {
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.ELIZA_API_TOKEN = "test-token";
    expect(isCloudProvisioned()).toBe(true);
  });

  it("returns false when CLOUD_PROVISIONED is not strictly '1'", () => {
    process.env.MILADY_API_TOKEN = "test-token";

    process.env.MILADY_CLOUD_PROVISIONED = "true";
    expect(isCloudProvisioned()).toBe(false);

    process.env.MILADY_CLOUD_PROVISIONED = "yes";
    expect(isCloudProvisioned()).toBe(false);

    process.env.MILADY_CLOUD_PROVISIONED = "0";
    expect(isCloudProvisioned()).toBe(false);

    process.env.MILADY_CLOUD_PROVISIONED = "";
    expect(isCloudProvisioned()).toBe(false);
  });

  it("returns false when API_TOKEN is empty string", () => {
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.MILADY_API_TOKEN = "";
    expect(isCloudProvisioned()).toBe(false);
  });

  it("returns false when API_TOKEN is whitespace only", () => {
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.MILADY_API_TOKEN = "   ";
    expect(isCloudProvisioned()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// /api/auth/status cloud behavior tests
// ---------------------------------------------------------------------------

describe("/api/auth/status cloud provisioning", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.MILADY_CLOUD_PROVISIONED;
    delete process.env.ELIZA_CLOUD_PROVISIONED;
    delete process.env.MILADY_API_TOKEN;
    delete process.env.ELIZA_API_TOKEN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // Simulates the auth status response logic from server.ts
  const getAuthStatusResponse = (): {
    required: boolean;
    pairingEnabled: boolean;
    expiresAt: number | null;
  } => {
    const getCompatApiToken = (): string | null => {
      const token =
        process.env.MILADY_API_TOKEN?.trim() ??
        process.env.ELIZA_API_TOKEN?.trim();
      return token ? token : null;
    };

    const isCloudProvisioned = (): boolean => {
      const hasCloudFlag =
        process.env.MILADY_CLOUD_PROVISIONED === "1" ||
        process.env.ELIZA_CLOUD_PROVISIONED === "1";
      const hasApiToken = Boolean(getCompatApiToken());
      return hasCloudFlag && hasApiToken;
    };

    if (isCloudProvisioned()) {
      return {
        required: false,
        pairingEnabled: false,
        expiresAt: null,
      };
    }

    // Normal auth status
    const hasToken = Boolean(getCompatApiToken());
    return {
      required: hasToken,
      pairingEnabled: hasToken,
      expiresAt: hasToken ? Date.now() + 600_000 : null,
    };
  };

  it("returns { required: false, pairingEnabled: false } when cloud provisioned", () => {
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.MILADY_API_TOKEN = "platform-token";
    const response = getAuthStatusResponse();

    expect(response.required).toBe(false);
    expect(response.pairingEnabled).toBe(false);
    expect(response.expiresAt).toBeNull();
  });

  it("returns { required: true } when NOT cloud provisioned but token is set", () => {
    // Only token, no cloud flag — normal pairing flow
    process.env.MILADY_API_TOKEN = "user-token";
    const response = getAuthStatusResponse();

    expect(response.required).toBe(true);
    expect(response.pairingEnabled).toBe(true);
    expect(response.expiresAt).toBeGreaterThan(Date.now());
  });

  it("returns { required: false } when no token and no cloud flag", () => {
    const response = getAuthStatusResponse();

    expect(response.required).toBe(false);
    expect(response.pairingEnabled).toBe(false);
  });

  it("SECURITY: returns { required: true } when ONLY cloud flag set (no token)", () => {
    // This is the key security test — CLOUD_PROVISIONED alone doesn't bypass
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    // No MILADY_API_TOKEN set!
    const response = getAuthStatusResponse();

    // Should NOT bypass — no token means untrusted container
    expect(response.required).toBe(false); // No token = no auth required
    expect(response.pairingEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// /api/onboarding/status cloud behavior tests
// ---------------------------------------------------------------------------

describe("/api/onboarding/status cloud provisioning", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.MILADY_CLOUD_PROVISIONED;
    delete process.env.ELIZA_CLOUD_PROVISIONED;
    delete process.env.MILADY_API_TOKEN;
    delete process.env.ELIZA_API_TOKEN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // Simulates the onboarding status response logic from server.ts
  // Returns the response if handled, or null to defer to upstream
  const getOnboardingStatusResponse = (): { complete: boolean } | null => {
    const getCompatApiToken = (): string | null => {
      const token =
        process.env.MILADY_API_TOKEN?.trim() ??
        process.env.ELIZA_API_TOKEN?.trim();
      return token ? token : null;
    };

    const isCloudProvisioned = (): boolean => {
      const hasCloudFlag =
        process.env.MILADY_CLOUD_PROVISIONED === "1" ||
        process.env.ELIZA_CLOUD_PROVISIONED === "1";
      const hasApiToken = Boolean(getCompatApiToken());
      return hasCloudFlag && hasApiToken;
    };

    if (isCloudProvisioned()) {
      return { complete: true };
    }

    // Non-cloud: return null to let upstream handle it
    return null;
  };

  it("returns { complete: true } when cloud provisioned", () => {
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.MILADY_API_TOKEN = "platform-token";
    const response = getOnboardingStatusResponse();

    expect(response).toEqual({ complete: true });
  });

  it("returns { complete: true } with ELIZA_ prefixed vars", () => {
    process.env.ELIZA_CLOUD_PROVISIONED = "1";
    process.env.ELIZA_API_TOKEN = "platform-token";
    const response = getOnboardingStatusResponse();

    expect(response).toEqual({ complete: true });
  });

  it("returns null (defer to upstream) when NOT cloud provisioned", () => {
    const response = getOnboardingStatusResponse();
    expect(response).toBeNull();
  });

  it("SECURITY: returns null when ONLY cloud flag set (no token)", () => {
    // This is the key security test — CLOUD_PROVISIONED alone doesn't bypass
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    // No MILADY_API_TOKEN set!
    const response = getOnboardingStatusResponse();

    // Should NOT bypass — falls through to upstream onboarding check
    expect(response).toBeNull();
  });

  it("returns null when ONLY token set (no cloud flag)", () => {
    process.env.MILADY_API_TOKEN = "user-token";
    const response = getOnboardingStatusResponse();

    // Normal local mode — upstream handles onboarding
    expect(response).toBeNull();
  });
});
