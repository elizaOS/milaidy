/**
 * Unit tests for whatsapp-pairing.ts — account ID sanitization, auth existence
 * checks, and WhatsAppPairingSession lifecycle without requiring Baileys.
 *
 * The start() and whatsappLogout() methods depend on @whiskeysockets/baileys,
 * qrcode, pino, and @hapi/boom — tested via integration tests, not here.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  sanitizeAccountId,
  type WhatsAppPairingEvent,
  WhatsAppPairingSession,
  whatsappAuthExists,
} from "./whatsapp-pairing";

// ═════════════════════════════════════════════════════════════════════════
describe("whatsapp-pairing", () => {
  // ── sanitizeAccountId ──────────────────────────────────────────────
  describe("sanitizeAccountId", () => {
    it("accepts alphanumeric ID", () => {
      expect(sanitizeAccountId("myAccount123")).toBe("myAccount123");
    });

    it("accepts dashes and underscores", () => {
      expect(sanitizeAccountId("my-account_01")).toBe("my-account_01");
    });

    it("accepts single character", () => {
      expect(sanitizeAccountId("a")).toBe("a");
    });

    it("rejects empty string", () => {
      expect(() => sanitizeAccountId("")).toThrow("Invalid accountId");
    });

    it("rejects path traversal (..) ", () => {
      expect(() => sanitizeAccountId("../../../etc/passwd")).toThrow(
        "Invalid accountId",
      );
    });

    it("rejects dots", () => {
      expect(() => sanitizeAccountId("account.name")).toThrow(
        "Invalid accountId",
      );
    });

    it("rejects slashes", () => {
      expect(() => sanitizeAccountId("path/to/dir")).toThrow(
        "Invalid accountId",
      );
    });

    it("rejects backslashes", () => {
      expect(() => sanitizeAccountId("path\\to\\dir")).toThrow(
        "Invalid accountId",
      );
    });

    it("rejects spaces", () => {
      expect(() => sanitizeAccountId("has space")).toThrow("Invalid accountId");
    });

    it("rejects special characters", () => {
      expect(() => sanitizeAccountId("inject;rm -rf")).toThrow(
        "Invalid accountId",
      );
    });

    it("rejects null byte injection", () => {
      expect(() => sanitizeAccountId("safe\x00evil")).toThrow(
        "Invalid accountId",
      );
    });

    it("rejects unicode characters", () => {
      expect(() => sanitizeAccountId("café")).toThrow("Invalid accountId");
    });
  });

  // ── whatsappAuthExists ─────────────────────────────────────────────
  describe("whatsappAuthExists", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-test-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns false when no auth directory exists", () => {
      expect(whatsappAuthExists(tmpDir)).toBe(false);
    });

    it("returns false when dir exists but creds.json is missing", () => {
      fs.mkdirSync(path.join(tmpDir, "whatsapp-auth", "default"), {
        recursive: true,
      });
      expect(whatsappAuthExists(tmpDir)).toBe(false);
    });

    it("returns true when creds.json exists", () => {
      const credsDir = path.join(tmpDir, "whatsapp-auth", "default");
      fs.mkdirSync(credsDir, { recursive: true });
      fs.writeFileSync(path.join(credsDir, "creds.json"), "{}");
      expect(whatsappAuthExists(tmpDir)).toBe(true);
    });

    it("uses default accountId when not specified", () => {
      const credsDir = path.join(tmpDir, "whatsapp-auth", "default");
      fs.mkdirSync(credsDir, { recursive: true });
      fs.writeFileSync(path.join(credsDir, "creds.json"), "{}");
      expect(whatsappAuthExists(tmpDir)).toBe(true);
    });

    it("respects custom accountId", () => {
      const credsDir = path.join(tmpDir, "whatsapp-auth", "business");
      fs.mkdirSync(credsDir, { recursive: true });
      fs.writeFileSync(path.join(credsDir, "creds.json"), "{}");
      expect(whatsappAuthExists(tmpDir, "business")).toBe(true);
      expect(whatsappAuthExists(tmpDir, "personal")).toBe(false);
    });
  });

  // ── WhatsAppPairingSession ─────────────────────────────────────────
  describe("WhatsAppPairingSession", () => {
    let events: WhatsAppPairingEvent[];
    let session: WhatsAppPairingSession;

    beforeEach(() => {
      events = [];
      session = new WhatsAppPairingSession({
        authDir: "/tmp/test-wa-auth",
        accountId: "test-account",
        onEvent: (e) => events.push(e),
      });
    });

    it("starts in idle state", () => {
      expect(session.getStatus()).toBe("idle");
    });

    it("stop() is safe to call before start()", () => {
      // Should not throw even though socket is null
      expect(() => session.stop()).not.toThrow();
    });

    it("stop() can be called multiple times", () => {
      session.stop();
      session.stop();
      expect(session.getStatus()).toBe("idle");
    });
  });
});
