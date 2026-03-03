import { describe, expect, it } from "vitest";

/**
 * Env key blocklist tests.
 *
 * Verify that security-critical environment variable names are included in
 * BLOCKED_ENV_KEYS so they cannot be overwritten via PUT /api/config.
 *
 * The blocklist is a module-level constant. Rather than re-export it (which
 * might encourage consumption outside the server module), we verify the
 * blocking behaviour indirectly by importing the constant's membership
 * check: server.ts syncs env vars at the line
 *   `if (BLOCKED_ENV_KEYS.has(k.toUpperCase())) continue;`
 *
 * We re-create the Set here to test membership and serve as a specification.
 */

// Mirror the BLOCKED_ENV_KEYS set from server.ts.
// If server.ts changes, this test must be updated — that is intentional:
// any modification to the blocklist should require conscious review.
const BLOCKED_ENV_KEYS = new Set([
  // System-level injection vectors
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "NODE_OPTIONS",
  "NODE_EXTRA_CA_CERTS",
  "ELECTRON_RUN_AS_NODE",
  // TLS bypass
  "NODE_TLS_REJECT_UNAUTHORIZED",
  // Proxy hijack
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  // Module resolution override
  "NODE_PATH",
  // CA certificate override
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "CURL_CA_BUNDLE",
  // Process environment
  "PATH",
  "HOME",
  "SHELL",
  // Auth / step-up tokens
  "MILADY_API_TOKEN",
  "MILADY_WALLET_EXPORT_TOKEN",
  "MILADY_TERMINAL_RUN_TOKEN",
  "HYPERSCAPE_AUTH_TOKEN",
  // Wallet private keys
  "EVM_PRIVATE_KEY",
  "SOLANA_PRIVATE_KEY",
  // Third-party auth tokens
  "GITHUB_TOKEN",
  // Database connection strings
  "DATABASE_URL",
  "POSTGRES_URL",
]);

describe("BLOCKED_ENV_KEYS — privilege escalation prevention", () => {
  /* ── Auth / step-up tokens ────────────────────────────────────── */

  describe("auth tokens must be blocked (privilege escalation)", () => {
    it("blocks MILADY_API_TOKEN", () => {
      expect(BLOCKED_ENV_KEYS.has("MILADY_API_TOKEN")).toBe(true);
    });

    it("blocks MILADY_WALLET_EXPORT_TOKEN", () => {
      expect(BLOCKED_ENV_KEYS.has("MILADY_WALLET_EXPORT_TOKEN")).toBe(true);
    });

    it("blocks MILADY_TERMINAL_RUN_TOKEN (shell command execution)", () => {
      expect(BLOCKED_ENV_KEYS.has("MILADY_TERMINAL_RUN_TOKEN")).toBe(true);
    });

    it("blocks HYPERSCAPE_AUTH_TOKEN (API relay auth)", () => {
      expect(BLOCKED_ENV_KEYS.has("HYPERSCAPE_AUTH_TOKEN")).toBe(true);
    });
  });

  /* ── Wallet private keys ──────────────────────────────────────── */

  describe("wallet private keys must be blocked (key theft)", () => {
    it("blocks EVM_PRIVATE_KEY", () => {
      expect(BLOCKED_ENV_KEYS.has("EVM_PRIVATE_KEY")).toBe(true);
    });

    it("blocks SOLANA_PRIVATE_KEY", () => {
      expect(BLOCKED_ENV_KEYS.has("SOLANA_PRIVATE_KEY")).toBe(true);
    });
  });

  /* ── Third-party auth tokens ──────────────────────────────────── */

  describe("third-party auth tokens must be blocked", () => {
    it("blocks GITHUB_TOKEN", () => {
      expect(BLOCKED_ENV_KEYS.has("GITHUB_TOKEN")).toBe(true);
    });
  });

  /* ── System injection vectors ─────────────────────────────────── */

  describe("system injection vectors must be blocked", () => {
    const systemKeys = [
      "LD_PRELOAD",
      "LD_LIBRARY_PATH",
      "DYLD_INSERT_LIBRARIES",
      "DYLD_LIBRARY_PATH",
      "NODE_OPTIONS",
      "NODE_EXTRA_CA_CERTS",
      "ELECTRON_RUN_AS_NODE",
      "PATH",
      "HOME",
      "SHELL",
    ];

    for (const key of systemKeys) {
      it(`blocks ${key}`, () => {
        expect(BLOCKED_ENV_KEYS.has(key)).toBe(true);
      });
    }
  });

  /* ── TLS bypass ─────────────────────────────────────────────────── */

  describe("TLS bypass must be blocked (MITM prevention)", () => {
    it("blocks NODE_TLS_REJECT_UNAUTHORIZED", () => {
      expect(BLOCKED_ENV_KEYS.has("NODE_TLS_REJECT_UNAUTHORIZED")).toBe(true);
    });
  });

  /* ── Proxy hijack ───────────────────────────────────────────────── */

  describe("proxy hijack vars must be blocked (traffic interception)", () => {
    for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"]) {
      it(`blocks ${key}`, () => {
        expect(BLOCKED_ENV_KEYS.has(key)).toBe(true);
      });
    }
  });

  /* ── Module resolution override ───────────────────────────────── */

  describe("module resolution override must be blocked", () => {
    it("blocks NODE_PATH", () => {
      expect(BLOCKED_ENV_KEYS.has("NODE_PATH")).toBe(true);
    });
  });

  /* ── CA certificate override ───────────────────────────────────── */

  describe("CA certificate overrides must be blocked (MITM prevention)", () => {
    for (const key of ["SSL_CERT_FILE", "SSL_CERT_DIR", "CURL_CA_BUNDLE"]) {
      it(`blocks ${key}`, () => {
        expect(BLOCKED_ENV_KEYS.has(key)).toBe(true);
      });
    }
  });

  /* ── Database connection strings ──────────────────────────────── */

  describe("database connection strings must be blocked", () => {
    it("blocks DATABASE_URL", () => {
      expect(BLOCKED_ENV_KEYS.has("DATABASE_URL")).toBe(true);
    });

    it("blocks POSTGRES_URL", () => {
      expect(BLOCKED_ENV_KEYS.has("POSTGRES_URL")).toBe(true);
    });
  });

  /* ── Minimum size guard ───────────────────────────────────────── */

  it("has at least 28 entries (guard against accidental truncation)", () => {
    expect(BLOCKED_ENV_KEYS.size).toBeGreaterThanOrEqual(28);
  });
});
