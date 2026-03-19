import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type SignalPairingEvent,
  SignalPairingSession,
  sanitizeAccountId,
  signalAuthExists,
} from "./signal-pairing";

describe("signal-pairing", () => {
  describe("sanitizeAccountId", () => {
    it("accepts alphanumeric IDs with dashes and underscores", () => {
      expect(sanitizeAccountId("signal-account_01")).toBe("signal-account_01");
    });

    it("rejects invalid path-like input", () => {
      expect(() => sanitizeAccountId("../evil")).toThrow("Invalid accountId");
      expect(() => sanitizeAccountId("has space")).toThrow("Invalid accountId");
    });
  });

  describe("signalAuthExists", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-test-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns false when auth data is missing", () => {
      expect(signalAuthExists(tmpDir)).toBe(false);
    });

    it("returns true when the account auth directory exists", () => {
      fs.mkdirSync(path.join(tmpDir, "signal-auth", "default"), {
        recursive: true,
      });

      expect(signalAuthExists(tmpDir)).toBe(true);
    });
  });

  describe("SignalPairingSession", () => {
    let events: SignalPairingEvent[];
    let session: SignalPairingSession;

    beforeEach(() => {
      events = [];
      session = new SignalPairingSession({
        authDir: "/tmp/test-signal-auth",
        accountId: "test-account",
        onEvent: (event) => events.push(event),
      });
    });

    it("starts in idle state", () => {
      expect(session.getStatus()).toBe("idle");
    });

    it("stop() is safe before start()", () => {
      expect(() => session.stop()).not.toThrow();
      expect(events).toHaveLength(0);
    });
  });
});
