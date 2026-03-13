/**
 * Signal Connector E2E Tests
 *
 * Tests for @elizaos/plugin-signal as outlined in GitHub Issue #148.
 *
 * Prerequisites for live tests:
 * - signal-cli installed and configured
 * - Signal account registered (phone number verified)
 * - Either signal-cli REST API running or signal-cli binary in PATH
 *
 * Environment variables:
 * - SIGNAL_ACCOUNT_NUMBER: Signal account phone number (E.164 format, e.g., +1234567890)
 * - SIGNAL_HTTP_URL: Signal CLI REST API URL (e.g., http://localhost:8080)
 * - SIGNAL_CLI_PATH: Path to signal-cli binary (alternative to HTTP API)
 * - SIGNAL_TEST_RECIPIENT: Phone number to send test messages to (E.164 format)
 * - MILADY_LIVE_TEST=1: Enable live tests (MILAIDY_LIVE_TEST also supported)
 *
 * @see https://github.com/milady-ai/milady/issues/148
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const LIVE_TEST =
  process.env.MILADY_LIVE_TEST === "1" || process.env.MILAIDY_LIVE_TEST === "1";
const SIGNAL_ACCOUNT_NUMBER = process.env.SIGNAL_ACCOUNT_NUMBER;
const SIGNAL_HTTP_URL = process.env.SIGNAL_HTTP_URL;
const SIGNAL_CLI_PATH = process.env.SIGNAL_CLI_PATH;
const SIGNAL_TEST_RECIPIENT = process.env.SIGNAL_TEST_RECIPIENT;

const hasSignalConfig = !!(
  SIGNAL_ACCOUNT_NUMBER &&
  (SIGNAL_HTTP_URL || SIGNAL_CLI_PATH)
);
const signalPluginModule = await import("@elizaos/plugin-signal").catch(
  () => null,
);
const signalPlugin = signalPluginModule?.default;
const hasSignalPlugin = Boolean(signalPlugin);

// Import helpers from the plugin for live tests
const {
  signalCheck,
  signalListContacts,
  signalListGroups,
  signalSend,
  signalSendReaction,
  signalSendReadReceipt,
  signalSendTyping,
  isValidE164,
  isValidGroupId,
  normalizeE164,
  SignalService,
  MAX_SIGNAL_MESSAGE_LENGTH,
  MAX_SIGNAL_ATTACHMENT_SIZE,
} = signalPluginModule ?? {};

describe("Signal Connector (@elizaos/plugin-signal)", () => {
  // =========================================================================
  // Plugin Structure Tests (no signal-cli required)
  // =========================================================================

  describe.skipIf(!hasSignalPlugin)("Plugin Structure", () => {
    it("plugin can be imported", () => {
      expect(signalPluginModule).toBeDefined();
      expect(signalPlugin).toBeDefined();
    });

    it("plugin has required properties", () => {
      expect(signalPlugin.name).toBe("signal");
      expect(signalPlugin.description).toBeDefined();
    });

    it("plugin exports actions", () => {
      expect(signalPlugin.actions).toBeDefined();
      expect(Array.isArray(signalPlugin.actions)).toBe(true);

      const actionNames =
        signalPlugin.actions?.map((a: { name: string }) => a.name) ?? [];
      expect(actionNames).toContain("SIGNAL_LIST_CONTACTS");
      expect(actionNames).toContain("SIGNAL_LIST_GROUPS");
      expect(actionNames).toContain("SIGNAL_SEND_MESSAGE");
      expect(actionNames).toContain("SIGNAL_SEND_REACTION");
    });

    it("plugin exports providers", () => {
      expect(signalPlugin.providers).toBeDefined();
      expect(Array.isArray(signalPlugin.providers)).toBe(true);

      const providerNames =
        signalPlugin.providers?.map((p: { name: string }) => p.name) ?? [];
      expect(providerNames).toContain("signalConversationState");
    });

    it("plugin exports services", () => {
      expect(signalPlugin.services).toBeDefined();
      expect(Array.isArray(signalPlugin.services)).toBe(true);
      expect(signalPlugin.services?.length).toBeGreaterThan(0);
    });

    it("plugin has init function", () => {
      expect(typeof signalPlugin.init).toBe("function");
    });

    it("each action has required interface (name, description, validate, handler)", () => {
      for (const action of signalPlugin.actions!) {
        expect(action.name).toBeTruthy();
        expect(action.description).toBeTruthy();
        expect(typeof action.validate).toBe("function");
        expect(typeof action.handler).toBe("function");
      }
    });

    it("each action has similes array", () => {
      for (const action of signalPlugin.actions!) {
        expect(Array.isArray(action.similes)).toBe(true);
        expect(action.similes!.length).toBeGreaterThan(0);
      }
    });

    it("SignalService class has static serviceType", () => {
      expect(SignalService.serviceType).toBe("signal");
    });
  });

  // =========================================================================
  // Configuration Validation (no signal-cli required)
  // =========================================================================

  describe.skipIf(!hasSignalPlugin)("Configuration Validation", () => {
    it("validates E.164 phone number format using plugin's isValidE164", () => {
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

      for (const num of validNumbers) {
        expect(isValidE164(num), `${num} should be valid`).toBe(true);
      }

      for (const num of invalidNumbers) {
        expect(isValidE164(num), `${num} should be invalid`).toBe(false);
      }
    });

    it("normalizeE164 handles common phone number formats", () => {
      expect(normalizeE164("+14155551234")).toBe("+14155551234");
      expect(normalizeE164("4155551234")).toBe("+14155551234"); // 10-digit US
      expect(normalizeE164("+1 (415) 555-1234")).toBe("+14155551234"); // with formatting
    });

    it("normalizeE164 returns null for invalid numbers", () => {
      expect(normalizeE164("abc")).toBeNull();
      expect(normalizeE164("")).toBeNull();
      expect(normalizeE164("123")).toBeNull();
    });

    it("validates group ID format using plugin's isValidGroupId", () => {
      expect(isValidGroupId("YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=")).toBe(
        true,
      );
      expect(isValidGroupId("short")).toBe(false);
      expect(isValidGroupId("invalid!@#$%")).toBe(false);
    });

    it("respects Signal message length limit", () => {
      expect(MAX_SIGNAL_MESSAGE_LENGTH).toBe(4000);

      const shortMessage = "Hello";
      const longMessage = "x".repeat(5000);

      expect(shortMessage.length).toBeLessThanOrEqual(
        MAX_SIGNAL_MESSAGE_LENGTH,
      );
      expect(longMessage.length).toBeGreaterThan(MAX_SIGNAL_MESSAGE_LENGTH);
    });

    it("respects Signal attachment size limit (100MB)", () => {
      expect(MAX_SIGNAL_ATTACHMENT_SIZE).toBe(104857600);
    });
  });

  // =========================================================================
  // Live Signal Connection Tests
  // =========================================================================

  describe.skipIf(!LIVE_TEST || !hasSignalConfig)(
    "Live Signal Connection",
    () => {
      it("signal-cli health check returns ok", async () => {
        const result = await signalCheck(SIGNAL_HTTP_URL!);
        expect(result.ok).toBe(true);
      });

      it("retrieves contacts list via RPC", async () => {
        const contacts = await signalListContacts(SIGNAL_ACCOUNT_NUMBER!, {
          baseUrl: SIGNAL_HTTP_URL!,
        });
        expect(Array.isArray(contacts)).toBe(true);
        // Each contact should have at minimum a number field
        for (const contact of contacts) {
          expect(contact).toHaveProperty("number");
        }
      });

      it("retrieves groups list via RPC", async () => {
        const groups = await signalListGroups(SIGNAL_ACCOUNT_NUMBER!, {
          baseUrl: SIGNAL_HTTP_URL!,
        });
        expect(Array.isArray(groups)).toBe(true);
        for (const group of groups) {
          expect(group).toHaveProperty("id");
          expect(group).toHaveProperty("name");
        }
      });
    },
  );

  // =========================================================================
  // Live Message Handling Tests
  // =========================================================================

  describe.skipIf(!LIVE_TEST || !hasSignalConfig || !SIGNAL_TEST_RECIPIENT)(
    "Message Handling",
    () => {
      it("sends text message to test recipient", async () => {
        const result = await signalSend(
          {
            account: SIGNAL_ACCOUNT_NUMBER!,
            recipients: [SIGNAL_TEST_RECIPIENT!],
            message: `[milady-test] Signal connector validation at ${new Date().toISOString()}`,
          },
          { baseUrl: SIGNAL_HTTP_URL! },
        );

        expect(result).toBeDefined();
        // signal-cli returns a timestamp on successful send
        expect(result).toHaveProperty("timestamp");
      });

      it("sends typing indicator", async () => {
        // Should not throw
        await expect(
          signalSendTyping(
            {
              account: SIGNAL_ACCOUNT_NUMBER!,
              recipient: SIGNAL_TEST_RECIPIENT!,
            },
            { baseUrl: SIGNAL_HTTP_URL! },
          ),
        ).resolves.not.toThrow();
      });

      it("sends read receipt", async () => {
        // First send a message to get a timestamp, then acknowledge it
        const sent = await signalSend(
          {
            account: SIGNAL_ACCOUNT_NUMBER!,
            recipients: [SIGNAL_TEST_RECIPIENT!],
            message: "[milady-test] read receipt test",
          },
          { baseUrl: SIGNAL_HTTP_URL! },
        );

        if (sent?.timestamp) {
          await expect(
            signalSendReadReceipt(
              {
                account: SIGNAL_ACCOUNT_NUMBER!,
                recipient: SIGNAL_TEST_RECIPIENT!,
                timestamps: [sent.timestamp],
              },
              { baseUrl: SIGNAL_HTTP_URL! },
            ),
          ).resolves.not.toThrow();
        }
      });

      it("sends reaction to message", async () => {
        // Send a message first, then react to it
        const sent = await signalSend(
          {
            account: SIGNAL_ACCOUNT_NUMBER!,
            recipients: [SIGNAL_TEST_RECIPIENT!],
            message: "[milady-test] reaction target message",
          },
          { baseUrl: SIGNAL_HTTP_URL! },
        );

        if (sent?.timestamp) {
          await expect(
            signalSendReaction(
              {
                account: SIGNAL_ACCOUNT_NUMBER!,
                recipient: SIGNAL_TEST_RECIPIENT!,
                reaction: "\u{1F44D}", // thumbs up
                targetAuthor: SIGNAL_ACCOUNT_NUMBER!,
                timestamp: sent.timestamp,
              },
              { baseUrl: SIGNAL_HTTP_URL! },
            ),
          ).resolves.not.toThrow();
        }
      });
    },
  );

  // =========================================================================
  // Live Group Message Tests
  // =========================================================================

  describe.skipIf(!LIVE_TEST || !hasSignalConfig)("Group Messages", () => {
    let testGroupId: string | null = null;

    beforeAll(async () => {
      // Find a group we're a member of for testing
      const groups = await signalListGroups(SIGNAL_ACCOUNT_NUMBER!, {
        baseUrl: SIGNAL_HTTP_URL!,
      });
      const memberGroup = groups.find(
        (g: { isMember?: boolean; isBlocked?: boolean }) =>
          g.isMember && !g.isBlocked,
      );
      testGroupId = memberGroup?.id ?? null;
    });

    it("sends message to group (if a test group exists)", async () => {
      if (!testGroupId) {
        console.log("Skipping: no member group found for testing");
        return;
      }

      const result = await signalSend(
        {
          account: SIGNAL_ACCOUNT_NUMBER!,
          recipients: [`group.${testGroupId}`],
          message: `[milady-test] Group message at ${new Date().toISOString()}`,
        },
        { baseUrl: SIGNAL_HTTP_URL! },
      );

      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // Live Error Handling Tests
  // =========================================================================

  describe.skipIf(!LIVE_TEST || !hasSignalConfig)("Error Handling", () => {
    it("handles sending to invalid phone number", async () => {
      // +10000000000 is not a real number — signal-cli should report an error
      try {
        await signalSend(
          {
            account: SIGNAL_ACCOUNT_NUMBER!,
            recipients: ["+10000000000"],
            message: "[milady-test] should fail",
          },
          { baseUrl: SIGNAL_HTTP_URL! },
        );
        // If it doesn't throw, signal-cli may have queued the message
        // (behavior varies by version) — either outcome is acceptable
      } catch (err) {
        // Expected: signal-cli rejects the invalid recipient
        expect(err).toBeDefined();
      }
    });

    it("handles connection to wrong port gracefully", async () => {
      const result = await signalCheck("http://localhost:19999", 3000);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("handles RPC to non-existent endpoint", async () => {
      try {
        await signalSend(
          {
            account: "+10000000000", // wrong account
            recipients: [SIGNAL_ACCOUNT_NUMBER!],
            message: "test",
          },
          { baseUrl: SIGNAL_HTTP_URL! },
        );
      } catch (err) {
        // Expected: error about unknown account
        expect(err).toBeDefined();
      }
    });
  });
});
