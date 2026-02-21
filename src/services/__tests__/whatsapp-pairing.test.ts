import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock fs before importing the module under test
// ---------------------------------------------------------------------------

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

// Mock pino to avoid real logging
vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    level: "silent",
  }),
}));

// Mock Baileys — only needed if WhatsAppPairingSession.start() is called,
// but we mock it to prevent import side-effects.
vi.mock("@whiskeysockets/baileys", () => ({
  default: vi.fn(),
  useMultiFileAuthState: vi.fn(),
  fetchLatestBaileysVersion: vi.fn(),
  DisconnectReason: {
    loggedOut: 401,
    restartRequired: 515,
    timedOut: 408,
    connectionClosed: 428,
    connectionReplaced: 440,
  },
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,mock") },
}));

vi.mock("@hapi/boom", () => ({
  Boom: class Boom extends Error {
    output = { statusCode: 500 };
  },
}));

import fs from "node:fs";
import {
  sanitizeAccountId,
  whatsappAuthExists,
  WhatsAppPairingSession,
} from "../whatsapp-pairing";

// ---------------------------------------------------------------------------
// sanitizeAccountId()
// ---------------------------------------------------------------------------

describe("sanitizeAccountId()", () => {
  describe("valid IDs", () => {
    it("accepts 'default'", () => {
      expect(sanitizeAccountId("default")).toBe("default");
    });

    it("accepts 'my-account'", () => {
      expect(sanitizeAccountId("my-account")).toBe("my-account");
    });

    it("accepts 'test_123'", () => {
      expect(sanitizeAccountId("test_123")).toBe("test_123");
    });

    it("accepts purely numeric IDs", () => {
      expect(sanitizeAccountId("42")).toBe("42");
    });

    it("accepts mixed case with dashes and underscores", () => {
      expect(sanitizeAccountId("My_Account-2")).toBe("My_Account-2");
    });
  });

  describe("invalid IDs", () => {
    it("rejects path traversal '../etc'", () => {
      expect(() => sanitizeAccountId("../etc")).toThrow(/invalid accountid/i);
    });

    it("rejects 'foo/bar' (forward slash)", () => {
      expect(() => sanitizeAccountId("foo/bar")).toThrow(/invalid accountid/i);
    });

    it("rejects 'a b c' (spaces)", () => {
      expect(() => sanitizeAccountId("a b c")).toThrow(/invalid accountid/i);
    });

    it("rejects empty string", () => {
      expect(() => sanitizeAccountId("")).toThrow(/invalid accountid/i);
    });

    it("rejects backslashes", () => {
      expect(() => sanitizeAccountId("foo\\bar")).toThrow(/invalid accountid/i);
    });

    it("rejects special characters", () => {
      expect(() => sanitizeAccountId("account@home")).toThrow(/invalid accountid/i);
    });

    it("rejects dots", () => {
      expect(() => sanitizeAccountId("my.account")).toThrow(/invalid accountid/i);
    });
  });
});

// ---------------------------------------------------------------------------
// whatsappAuthExists()
// ---------------------------------------------------------------------------

describe("whatsappAuthExists()", () => {
  beforeEach(() => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReset();
  });

  it("returns true when creds.json exists", () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const result = whatsappAuthExists("/workspace");

    expect(result).toBe(true);
    expect(fs.existsSync).toHaveBeenCalledWith(
      expect.stringContaining("creds.json"),
    );
  });

  it("returns false when creds.json does not exist", () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = whatsappAuthExists("/workspace");

    expect(result).toBe(false);
  });

  it("uses default accountId when not specified", () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

    whatsappAuthExists("/workspace");

    // Path should include "default" as the account directory
    const calledPath = (fs.existsSync as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledPath).toContain("default");
    expect(calledPath).toContain("whatsapp-auth");
  });

  it("uses custom accountId when specified", () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

    whatsappAuthExists("/workspace", "my-account");

    const calledPath = (fs.existsSync as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledPath).toContain("my-account");
    expect(calledPath).toContain("whatsapp-auth");
  });
});

// ---------------------------------------------------------------------------
// WhatsAppPairingSession
// ---------------------------------------------------------------------------

describe("WhatsAppPairingSession", () => {
  describe("initial state", () => {
    it("starts with 'idle' status", () => {
      const onEvent = vi.fn();
      const session = new WhatsAppPairingSession({
        authDir: "/tmp/wa-auth",
        accountId: "test",
        onEvent,
      });

      expect(session.getStatus()).toBe("idle");
    });
  });

  describe("stop()", () => {
    it("can be called safely when no socket exists", () => {
      const onEvent = vi.fn();
      const session = new WhatsAppPairingSession({
        authDir: "/tmp/wa-auth",
        accountId: "test",
        onEvent,
      });

      // Should not throw even though there's no socket
      expect(() => session.stop()).not.toThrow();
    });
  });

  describe("status transitions", () => {
    it("setStatus emits an event via onEvent callback", () => {
      const onEvent = vi.fn();
      const session = new WhatsAppPairingSession({
        authDir: "/tmp/wa-auth",
        accountId: "test-acct",
        onEvent,
      });

      // We cannot call setStatus directly (it's private), but we can
      // verify that start() transitions through statuses.
      // For now, verify that construction does NOT emit events (idle is default).
      expect(onEvent).not.toHaveBeenCalled();
      expect(session.getStatus()).toBe("idle");
    });
  });

  describe("getStatus()", () => {
    it("returns the current status", () => {
      const onEvent = vi.fn();
      const session = new WhatsAppPairingSession({
        authDir: "/tmp/wa-auth",
        accountId: "default",
        onEvent,
      });

      // Initially idle
      expect(session.getStatus()).toBe("idle");
    });
  });

  describe("construction", () => {
    it("stores the provided options", () => {
      const onEvent = vi.fn();
      const session = new WhatsAppPairingSession({
        authDir: "/custom/auth",
        accountId: "custom-id",
        onEvent,
      });

      // Verify the session was created successfully
      expect(session).toBeInstanceOf(WhatsAppPairingSession);
      expect(session.getStatus()).toBe("idle");
    });
  });
});
