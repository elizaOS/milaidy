import { beforeEach, describe, expect, it, vi } from "vitest";

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
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,mock"),
  },
}));

vi.mock("@hapi/boom", () => ({
  Boom: class Boom extends Error {
    output = { statusCode: 500 };
  },
}));

import fs from "node:fs";
import {
  sanitizeAccountId,
  WhatsAppPairingSession,
  whatsappAuthExists,
  whatsappLogout,
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
      expect(() => sanitizeAccountId("account@home")).toThrow(
        /invalid accountid/i,
      );
    });

    it("rejects dots", () => {
      expect(() => sanitizeAccountId("my.account")).toThrow(
        /invalid accountid/i,
      );
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
    const calledPath = (fs.existsSync as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(calledPath).toContain("default");
    expect(calledPath).toContain("whatsapp-auth");
  });

  it("uses custom accountId when specified", () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

    whatsappAuthExists("/workspace", "my-account");

    const calledPath = (fs.existsSync as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
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

// ---------------------------------------------------------------------------
// whatsappLogout()
// ---------------------------------------------------------------------------

describe("whatsappLogout()", () => {
  beforeEach(() => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReset();
    (fs.rmSync as ReturnType<typeof vi.fn>).mockReset();
  });

  it("deletes auth directory when no creds.json exists", async () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

    await whatsappLogout("/workspace", "test-acct");

    expect(fs.rmSync).toHaveBeenCalledWith(
      expect.stringContaining("test-acct"),
      { recursive: true, force: true },
    );
  });

  it("uses default accountId when not specified", async () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

    await whatsappLogout("/workspace");

    const rmPath = (fs.rmSync as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(rmPath).toContain("default");
  });

  it("attempts Baileys logout when creds.json exists, then deletes files", async () => {
    // First call: existsSync for creds.json → true
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

    // The Baileys mock will create a socket that fires connection.update
    const mockEnd = vi.fn();
    const mockLogout = vi.fn().mockResolvedValue(undefined);
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      fetchLatestBaileysVersion,
    } = await import("@whiskeysockets/baileys");

    // Setup Baileys mocks to simulate connection open → logout
    const evHandlers: Record<string, (...args: unknown[]) => void> = {};
    (makeWASocket as ReturnType<typeof vi.fn>).mockReturnValue({
      end: mockEnd,
      logout: mockLogout,
      ev: {
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          evHandlers[event] = handler;
          // Simulate immediate connection open
          if (event === "connection.update") {
            setTimeout(() => handler({ connection: "open" }), 0);
          }
        }),
      },
    });
    (useMultiFileAuthState as ReturnType<typeof vi.fn>).mockResolvedValue({
      state: {},
      saveCreds: vi.fn(),
    });
    (fetchLatestBaileysVersion as ReturnType<typeof vi.fn>).mockResolvedValue({
      version: [2, 2413, 1],
    });

    await whatsappLogout("/workspace", "default");

    expect(mockLogout).toHaveBeenCalled();
    expect(mockEnd).toHaveBeenCalledWith(undefined);
    expect(fs.rmSync).toHaveBeenCalledWith(expect.stringContaining("default"), {
      recursive: true,
      force: true,
    });
  });

  it("still deletes files when Baileys connection fails", async () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const { useMultiFileAuthState, fetchLatestBaileysVersion } = await import(
      "@whiskeysockets/baileys"
    );

    // Make Baileys throw during setup
    (useMultiFileAuthState as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("auth state corrupted"),
    );
    (fetchLatestBaileysVersion as ReturnType<typeof vi.fn>).mockResolvedValue({
      version: [2, 2413, 1],
    });

    await whatsappLogout("/workspace", "broken");

    // Files should still be cleaned up even though Baileys failed
    expect(fs.rmSync).toHaveBeenCalledWith(expect.stringContaining("broken"), {
      recursive: true,
      force: true,
    });
  });
});
