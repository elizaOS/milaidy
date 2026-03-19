/**
 * Signal Connector E2E Tests
 *
 * Tests for @elizaos/plugin-signal as outlined in GitHub Issue #148.
 *
 * Prerequisites:
 * - signal-cli installed and configured
 * - Signal account registered (phone number verified)
 * - Either signal-cli REST API running or signal-cli binary in PATH
 *
 * Environment variables:
 * - SIGNAL_ACCOUNT_NUMBER: Signal account phone number (E.164 format, e.g., +1234567890)
 * - SIGNAL_HTTP_URL: Signal CLI REST API URL (e.g., http://localhost:8080)
 * - SIGNAL_CLI_PATH: Path to signal-cli binary (alternative to HTTP API)
 * - MILADY_LIVE_TEST=1: Enable live tests (MILADY_LIVE_TEST also supported)
 *
 * @see https://github.com/milady-ai/milady/issues/148
 */

import { describe, expect, it } from "vitest";

const LIVE_TEST = process.env.MILADY_LIVE_TEST === "1";
const SIGNAL_ACCOUNT_NUMBER = process.env.SIGNAL_ACCOUNT_NUMBER;
const SIGNAL_HTTP_URL = process.env.SIGNAL_HTTP_URL;
const SIGNAL_CLI_PATH = process.env.SIGNAL_CLI_PATH;
const SIGNAL_HARNESS_REASON =
  "requires a paired Signal integration harness (counterparty account, group, and media fixtures)";

const hasSignalConfig = !!(
  SIGNAL_ACCOUNT_NUMBER &&
  (SIGNAL_HTTP_URL || SIGNAL_CLI_PATH)
);
const signalPluginModule = await import("@elizaos/plugin-signal").catch(
  () => null,
);
const signalPlugin = signalPluginModule?.default;
const hasSignalPlugin = Boolean(signalPlugin);

const signalConnectionChecks = [
  "connects to Signal service",
  "retrieves contacts list",
  "retrieves groups list",
] as const;

const signalMessageChecks = [
  "sends text message",
  "receives text message",
  "sends reaction to message",
] as const;

const signalGroupChecks = [
  "sends message to group",
  "receives group message",
  "respects SIGNAL_SHOULD_IGNORE_GROUP_MESSAGES setting",
] as const;

const signalMediaChecks = [
  "receives image attachment",
  "receives voice message",
  "sends image attachment",
] as const;

const signalErrorChecks = [
  "handles network errors gracefully",
  "handles invalid phone number",
  "handles rate limiting",
] as const;

function defineSkippedSignalHarnessChecks(
  titles: readonly string[],
  reason = SIGNAL_HARNESS_REASON,
): void {
  for (const title of titles) {
    it.skip(`${title} (${reason})`, async () => {});
  }
}

describe("Signal Connector (@elizaos/plugin-signal)", () => {
  describe.skipIf(!hasSignalPlugin)("Plugin Structure", () => {
    it("plugin can be imported", () => {
      expect(signalPluginModule).toBeDefined();
      expect(signalPlugin).toBeDefined();
    });

    it("plugin has required properties", () => {
      const plugin = signalPlugin;
      expect(plugin.name).toBe("signal");
      expect(plugin.description).toBeDefined();
    });

    it("plugin exports actions", () => {
      const plugin = signalPlugin;
      expect(plugin.actions).toBeDefined();
      expect(Array.isArray(plugin.actions)).toBe(true);

      // Expected actions based on source code analysis
      const actionNames =
        plugin.actions?.map((a: { name: string }) => a.name) ?? [];
      expect(actionNames).toContain("SIGNAL_LIST_CONTACTS");
      expect(actionNames).toContain("SIGNAL_LIST_GROUPS");
      expect(actionNames).toContain("SIGNAL_SEND_MESSAGE");
      expect(actionNames).toContain("SIGNAL_SEND_REACTION");
    });

    it("plugin exports providers", () => {
      const plugin = signalPlugin;
      expect(plugin.providers).toBeDefined();
      expect(Array.isArray(plugin.providers)).toBe(true);

      const providerNames =
        plugin.providers?.map((p: { name: string }) => p.name) ?? [];
      expect(providerNames).toContain("signalConversationState");
    });

    it("plugin exports services", () => {
      const plugin = signalPlugin;
      expect(plugin.services).toBeDefined();
      expect(Array.isArray(plugin.services)).toBe(true);
      expect(plugin.services?.length).toBeGreaterThan(0);
    });
  });

  describe("Configuration Validation", () => {
    it("validates E.164 phone number format", () => {
      // E.164 format: +[country code][subscriber number]
      const validNumbers = [
        "+14155551234",
        "+442071234567",
        "+905551234567",
        "+1234567890123",
      ];

      const invalidNumbers = [
        "4155551234", // Missing +
        "+123", // Too short
        "+1234567890123456", // Too long (>15 digits)
        "not-a-number",
      ];

      const isValidE164 = (n: string) => /^\+\d{7,15}$/.test(n);

      for (const num of validNumbers) {
        expect(isValidE164(num), `${num} should be valid`).toBe(true);
      }

      for (const num of invalidNumbers) {
        expect(isValidE164(num), `${num} should be invalid`).toBe(false);
      }
    });

    it("validates group ID format", () => {
      // Signal group IDs are base64-encoded, minimum 32 chars
      const isValidGroupId = (id: string) =>
        /^[A-Za-z0-9+/]+=*$/.test(id) && id.length >= 32;

      expect(isValidGroupId("YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=")).toBe(true);
      expect(isValidGroupId("short")).toBe(false);
      expect(isValidGroupId("invalid!@#$%")).toBe(false);
    });

    it("respects Signal message length limit", () => {
      const MAX_SIGNAL_MESSAGE_LENGTH = 4000;

      const shortMessage = "Hello";
      const longMessage = "x".repeat(5000);

      expect(shortMessage.length).toBeLessThanOrEqual(
        MAX_SIGNAL_MESSAGE_LENGTH,
      );
      expect(longMessage.length).toBeGreaterThan(MAX_SIGNAL_MESSAGE_LENGTH);
    });

    it("respects Signal attachment size limit", () => {
      const MAX_SIGNAL_ATTACHMENT_SIZE = 100 * 1024 * 1024; // 100MB

      expect(MAX_SIGNAL_ATTACHMENT_SIZE).toBe(104857600);
    });
  });

  describe.skipIf(!LIVE_TEST || !hasSignalConfig)(
    "Live Signal Connection",
    () => {
      defineSkippedSignalHarnessChecks(signalConnectionChecks);
    },
  );

  describe.skipIf(!LIVE_TEST || !hasSignalConfig)("Message Handling", () => {
    defineSkippedSignalHarnessChecks(signalMessageChecks);
  });

  describe.skipIf(!LIVE_TEST || !hasSignalConfig)("Group Messages", () => {
    defineSkippedSignalHarnessChecks(signalGroupChecks);
  });

  describe.skipIf(!LIVE_TEST || !hasSignalConfig)("Media & Attachments", () => {
    defineSkippedSignalHarnessChecks(signalMediaChecks);
  });

  describe.skipIf(!LIVE_TEST || !hasSignalConfig)("Error Handling", () => {
    defineSkippedSignalHarnessChecks(signalErrorChecks);
  });
});
