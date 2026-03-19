/**
 * Signal Configuration Schema Tests
 *
 * Validates the Zod schemas for Signal connector configuration:
 * - SignalAccountSchemaBase: base fields for a single Signal account
 * - SignalAccountSchema: with superRefine for dmPolicy/allowFrom invariant
 * - SignalConfigSchema: multi-account support via `accounts` map
 *
 * @see src/config/zod-schema.providers-core.ts (lines 577-648)
 * @see https://github.com/elizaos/eliza/issues/148
 */

import { describe, expect, it } from "vitest";
import {
  SignalAccountSchema,
  SignalAccountSchemaBase,
  SignalConfigSchema,
} from "./zod-schema.providers-core";

// ---------------------------------------------------------------------------
// SignalAccountSchemaBase — valid configs
// ---------------------------------------------------------------------------

describe("SignalAccountSchemaBase", () => {
  describe("accepts valid configs", () => {
    it("accepts minimal config (empty object — all fields optional)", () => {
      const result = SignalAccountSchemaBase.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts config with account only", () => {
      const result = SignalAccountSchemaBase.safeParse({
        account: "+14155551234",
      });
      expect(result.success).toBe(true);
    });

    it("accepts config with httpUrl", () => {
      const result = SignalAccountSchemaBase.safeParse({
        account: "+14155551234",
        httpUrl: "http://localhost:8080",
      });
      expect(result.success).toBe(true);
    });

    it("accepts config with httpHost + httpPort", () => {
      const result = SignalAccountSchemaBase.safeParse({
        account: "+14155551234",
        httpHost: "localhost",
        httpPort: 8080,
      });
      expect(result.success).toBe(true);
    });

    it("accepts config with cliPath", () => {
      const result = SignalAccountSchemaBase.safeParse({
        account: "+14155551234",
        cliPath: "signal-cli",
      });
      expect(result.success).toBe(true);
    });

    it("accepts full config with all optional fields", () => {
      const result = SignalAccountSchemaBase.safeParse({
        name: "My Signal",
        enabled: true,
        configWrites: true,
        account: "+14155551234",
        httpUrl: "http://localhost:8080",
        httpHost: "localhost",
        httpPort: 8080,
        cliPath: "signal-cli",
        autoStart: true,
        startupTimeoutMs: 30000,
        receiveMode: "on-start",
        ignoreAttachments: false,
        ignoreStories: true,
        sendReadReceipts: true,
        dmPolicy: "pairing",
        allowFrom: ["+14155559999"],
        groupAllowFrom: ["+14155558888"],
        groupPolicy: "allowlist",
        historyLimit: 100,
        dmHistoryLimit: 50,
        textChunkLimit: 2000,
        chunkMode: "length",
        blockStreaming: false,
        mediaMaxMb: 50,
        reactionNotifications: "own",
        reactionLevel: "ack",
      });
      expect(result.success).toBe(true);
    });

    it("accepts receiveMode 'manual'", () => {
      const result = SignalAccountSchemaBase.safeParse({
        receiveMode: "manual",
      });
      expect(result.success).toBe(true);
    });

    it("accepts all reactionNotifications values", () => {
      for (const val of ["off", "own", "all", "allowlist"]) {
        const result = SignalAccountSchemaBase.safeParse({
          reactionNotifications: val,
        });
        expect(result.success, `reactionNotifications=${val}`).toBe(true);
      }
    });

    it("accepts all reactionLevel values", () => {
      for (const val of ["off", "ack", "minimal", "extensive"]) {
        const result = SignalAccountSchemaBase.safeParse({
          reactionLevel: val,
        });
        expect(result.success, `reactionLevel=${val}`).toBe(true);
      }
    });

    it("accepts all chunkMode values", () => {
      for (const val of ["length", "newline"]) {
        const result = SignalAccountSchemaBase.safeParse({ chunkMode: val });
        expect(result.success, `chunkMode=${val}`).toBe(true);
      }
    });

    it("accepts actions with reactions boolean", () => {
      const result = SignalAccountSchemaBase.safeParse({
        actions: { reactions: true },
      });
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // SignalAccountSchemaBase — rejects invalid configs
  // -------------------------------------------------------------------------

  describe("rejects invalid configs", () => {
    it("rejects unknown extra fields (strict mode)", () => {
      const result = SignalAccountSchemaBase.safeParse({
        account: "+14155551234",
        unknownField: "bad",
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative httpPort", () => {
      const result = SignalAccountSchemaBase.safeParse({ httpPort: -1 });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer httpPort", () => {
      const result = SignalAccountSchemaBase.safeParse({ httpPort: 80.5 });
      expect(result.success).toBe(false);
    });

    it("rejects zero httpPort", () => {
      const result = SignalAccountSchemaBase.safeParse({ httpPort: 0 });
      expect(result.success).toBe(false);
    });

    it("rejects startupTimeoutMs below 1000", () => {
      const result = SignalAccountSchemaBase.safeParse({
        startupTimeoutMs: 999,
      });
      expect(result.success).toBe(false);
    });

    it("rejects startupTimeoutMs above 120000", () => {
      const result = SignalAccountSchemaBase.safeParse({
        startupTimeoutMs: 120001,
      });
      expect(result.success).toBe(false);
    });

    it("accepts startupTimeoutMs at boundaries (1000, 120000)", () => {
      expect(
        SignalAccountSchemaBase.safeParse({ startupTimeoutMs: 1000 }).success,
      ).toBe(true);
      expect(
        SignalAccountSchemaBase.safeParse({ startupTimeoutMs: 120000 }).success,
      ).toBe(true);
    });

    it("rejects invalid receiveMode", () => {
      const result = SignalAccountSchemaBase.safeParse({
        receiveMode: "auto",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid reactionNotifications", () => {
      const result = SignalAccountSchemaBase.safeParse({
        reactionNotifications: "some",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid reactionLevel", () => {
      const result = SignalAccountSchemaBase.safeParse({
        reactionLevel: "high",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid chunkMode", () => {
      const result = SignalAccountSchemaBase.safeParse({
        chunkMode: "word",
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative historyLimit", () => {
      const result = SignalAccountSchemaBase.safeParse({ historyLimit: -1 });
      expect(result.success).toBe(false);
    });

    it("rejects non-positive textChunkLimit", () => {
      const result = SignalAccountSchemaBase.safeParse({ textChunkLimit: 0 });
      expect(result.success).toBe(false);
    });

    it("rejects non-positive mediaMaxMb", () => {
      const result = SignalAccountSchemaBase.safeParse({ mediaMaxMb: 0 });
      expect(result.success).toBe(false);
    });

    it("rejects unknown fields in actions (strict)", () => {
      const result = SignalAccountSchemaBase.safeParse({
        actions: { reactions: true, unknown: true },
      });
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// SignalAccountSchema — superRefine (dmPolicy + allowFrom invariant)
// ---------------------------------------------------------------------------

describe("SignalAccountSchema", () => {
  it("accepts dmPolicy 'pairing' without allowFrom", () => {
    const result = SignalAccountSchema.safeParse({ dmPolicy: "pairing" });
    expect(result.success).toBe(true);
  });

  it("accepts dmPolicy 'open' with allowFrom containing '*'", () => {
    const result = SignalAccountSchema.safeParse({
      dmPolicy: "open",
      allowFrom: ["*"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects dmPolicy 'open' without allowFrom", () => {
    const result = SignalAccountSchema.safeParse({ dmPolicy: "open" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join("; ");
      expect(msg).toContain("allowFrom");
    }
  });

  it("rejects dmPolicy 'open' with allowFrom missing '*'", () => {
    const result = SignalAccountSchema.safeParse({
      dmPolicy: "open",
      allowFrom: ["+14155551234"],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SignalConfigSchema — multi-account support
// ---------------------------------------------------------------------------

describe("SignalConfigSchema", () => {
  it("accepts config without accounts (single-account mode)", () => {
    const result = SignalConfigSchema.safeParse({
      account: "+14155551234",
      httpUrl: "http://localhost:8080",
    });
    expect(result.success).toBe(true);
  });

  it("accepts config with accounts map", () => {
    const result = SignalConfigSchema.safeParse({
      accounts: {
        primary: {
          account: "+14155551234",
          httpUrl: "http://localhost:8080",
          dmPolicy: "pairing",
        },
        secondary: {
          account: "+442071234567",
          httpUrl: "http://localhost:8081",
          dmPolicy: "pairing",
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("validates each account entry independently", () => {
    // primary is valid, secondary violates dmPolicy="open" without allowFrom
    const result = SignalConfigSchema.safeParse({
      accounts: {
        primary: {
          account: "+14155551234",
          dmPolicy: "pairing",
        },
        secondary: {
          account: "+442071234567",
          dmPolicy: "open",
          // Missing allowFrom: ["*"]
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("applies superRefine to top-level dmPolicy as well", () => {
    const result = SignalConfigSchema.safeParse({
      dmPolicy: "open",
      // Missing allowFrom: ["*"]
    });
    expect(result.success).toBe(false);
  });

  it("top-level dmPolicy 'open' passes with allowFrom=['*']", () => {
    const result = SignalConfigSchema.safeParse({
      dmPolicy: "open",
      allowFrom: ["*"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty accounts map", () => {
    const result = SignalConfigSchema.safeParse({
      accounts: {},
    });
    expect(result.success).toBe(true);
  });
});
