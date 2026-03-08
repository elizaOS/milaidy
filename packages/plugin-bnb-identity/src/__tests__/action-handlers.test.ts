/**
 * Tests for the BNB identity action handler confirmation state machine.
 *
 * Covers:
 *  - First invocation (REGISTER) -> pending set, confirmation prompt returned
 *  - Confirm action + "yes" -> pending cleared, service called
 *  - Confirm action + no "yes" -> pending cleared, cancellation returned
 *  - No BNB_PRIVATE_KEY -> short-circuit with key error
 *  - Already-registered identity -> short-circuit with existing-identity message
 *  - TTL expiry -> stale pending entry is cleaned up
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type {
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import {
  confirmAction,
  registerAction,
  registerPendingKey,
} from "../actions.js";
import {
  _getPendingMapForTesting,
  clearAllPending,
  getPending,
  setPending,
} from "../utils.js";

// ── Mock store module ─────────────────────────────────────────────────────

// We need to mock readIdentity and writeIdentity so handlers don't
// hit the filesystem.
let mockIdentity: Record<string, unknown> | null = null;

// Mock the store module
mock.module("../store.js", () => ({
  readIdentity: async () => mockIdentity,
  writeIdentity: async (record: Record<string, unknown>) => {
    mockIdentity = record;
  },
  patchIdentity: async (patch: Record<string, unknown>) => {
    if (!mockIdentity) throw new Error("No identity record found.");
    mockIdentity = { ...mockIdentity, ...patch };
    return mockIdentity;
  },
}));

// Mock the service module so we don't make real MCP/HTTP calls
const mockRegisterAgent = mock(() =>
  Promise.resolve({
    agentId: "42",
    txHash: "0xabc123",
    network: "bsc-testnet",
  }),
);

const mockGetOwnerAddress = mock(() =>
  Promise.resolve("0x1234567890abcdef1234567890abcdef12345678"),
);

const mockGetAgent = mock(() =>
  Promise.resolve({
    agentId: "42",
    owner: "0x1234567890abcdef1234567890abcdef12345678",
    tokenURI: "data:application/json;base64,e30=",
    network: "bsc-testnet",
  }),
);

mock.module("../service.js", () => ({
  BnbIdentityService: class MockBnbIdentityService {
    registerAgent = mockRegisterAgent;
    getOwnerAddressFromPrivateKey = mockGetOwnerAddress;
    getAgent = mockGetAgent;
    updateAgentUri = mock(() =>
      Promise.resolve({
        success: true,
        txHash: "0xdef456",
        agentId: "42",
        network: "bsc-testnet",
      }),
    );
    getAgentWallet = mock(() =>
      Promise.resolve({
        agentId: "42",
        agentWallet: "0xwallet",
        network: "bsc-testnet",
      }),
    );
  },
}));

// ── Test helpers ──────────────────────────────────────────────────────────

function makeRuntime(
  overrides: Partial<Record<string, string>> = {},
): IAgentRuntime {
  const settings: Record<string, string> = {
    BNB_NETWORK: "bsc-testnet",
    BNB_PRIVATE_KEY:
      "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    MILADY_GATEWAY_PORT: "18789",
    ...overrides,
  };

  return {
    agentId: "test-agent-id",
    getSetting: (key: string) => settings[key] ?? null,
    character: { name: "TestMilady" },
  } as unknown as IAgentRuntime;
}

function makeMessage(text: string): Memory {
  return {
    content: { text },
    userId: "test-user",
    agentId: "test-agent-id",
    roomId: "test-room",
  } as unknown as Memory;
}

function collectCallbacks(): {
  calls: Array<{ text: string }>;
  fn: HandlerCallback;
} {
  const calls: Array<{ text: string }> = [];
  const fn: HandlerCallback = async (response) => {
    calls.push(response as { text: string });
    return [];
  };
  return { calls, fn };
}

// ── Test suite ───────────────────────────────────────────────────────────

describe("BNB Identity action handlers", () => {
  beforeEach(() => {
    clearAllPending();
    mockIdentity = null;
    mockRegisterAgent.mockClear();
    mockGetOwnerAddress.mockClear();
    mockGetAgent.mockClear();
  });

  afterEach(() => {
    clearAllPending();
    mockIdentity = null;
  });

  // ── Register: first invocation sets pending + returns confirmation prompt ──

  describe("BNB_IDENTITY_REGISTER handler", () => {
    it("sets pending state and returns confirmation prompt on first call", async () => {
      const runtime = makeRuntime();
      const message = makeMessage("register milady on bnb chain");
      const { calls, fn } = collectCallbacks();

      await registerAction.handler(
        runtime,
        message,
        undefined as unknown as State,
        {},
        fn,
      );

      // Should have set pending
      const pendingKey = registerPendingKey("test-agent-id");
      const pending = getPending(pendingKey);
      expect(pending).toBeDefined();
      expect(pending?.action).toBe("register");
      expect(pending?.agentURI).toBeDefined();

      // Should have returned a confirmation prompt
      const lastCall = calls[calls.length - 1];
      expect(lastCall.text).toContain("confirm");
      expect(lastCall.text).toContain("TestMilady");
    });

    it("short-circuits with key error when BNB_PRIVATE_KEY is not set", async () => {
      const runtime = makeRuntime({ BNB_PRIVATE_KEY: "" });
      // getSetting returns "" which is falsy... let's override to return null
      const runtimeNoKey = {
        ...runtime,
        getSetting: (key: string) => {
          if (key === "BNB_PRIVATE_KEY") return null;
          return runtime.getSetting(key);
        },
      } as unknown as IAgentRuntime;

      const message = makeMessage("register milady on bnb chain");
      const { calls, fn } = collectCallbacks();

      await registerAction.handler(
        runtimeNoKey,
        message,
        undefined as unknown as State,
        {},
        fn,
      );

      const lastCall = calls[calls.length - 1];
      expect(lastCall.text).toContain("BNB_PRIVATE_KEY");
      expect(lastCall.text).toContain("not set");

      // No pending state should be set
      const pendingKey = registerPendingKey("test-agent-id");
      expect(getPending(pendingKey)).toBeUndefined();
    });

    it("short-circuits with existing-identity message when already registered", async () => {
      // Set up existing identity
      mockIdentity = {
        agentId: "42",
        network: "bsc-testnet",
        txHash: "0xexisting",
        ownerAddress: "0xowner",
        agentURI: "data:...",
        registeredAt: "2025-01-01T00:00:00Z",
        lastUpdatedAt: "2025-01-01T00:00:00Z",
      };

      const runtime = makeRuntime();
      const message = makeMessage("register milady on bnb chain");
      const { calls, fn } = collectCallbacks();

      await registerAction.handler(
        runtime,
        message,
        undefined as unknown as State,
        {},
        fn,
      );

      const lastCall = calls[calls.length - 1];
      expect(lastCall.text).toContain("already has an on-chain identity");
      expect(lastCall.text).toContain("42");

      // No pending state should be set
      const pendingKey = registerPendingKey("test-agent-id");
      expect(getPending(pendingKey)).toBeUndefined();
    });
  });

  // ── Confirm: validates pending state and executes ──

  describe("BNB_IDENTITY_CONFIRM handler", () => {
    it("executes registration when user says 'yes' with pending state", async () => {
      const runtime = makeRuntime();

      // Simulate pending state from a prior REGISTER action
      const pendingKey = registerPendingKey("test-agent-id");
      setPending(pendingKey, {
        action: "register",
        agentURI: "data:application/json;base64,e30=",
        metadata: { name: "TestMilady" },
      });

      const message = makeMessage("yes");
      const { calls, fn } = collectCallbacks();

      await confirmAction.handler(
        runtime,
        message,
        undefined as unknown as State,
        {},
        fn,
      );

      // Pending should be cleared
      expect(getPending(pendingKey)).toBeUndefined();

      // Service should have been called
      expect(mockRegisterAgent).toHaveBeenCalled();

      // Should have returned success message
      const lastCall = calls[calls.length - 1];
      expect(lastCall.text).toContain("on-chain");
      expect(lastCall.text).toContain("42");
    });

    it("cancels registration when user does not say 'yes' with pending state", async () => {
      const runtime = makeRuntime();

      // Simulate pending state
      const pendingKey = registerPendingKey("test-agent-id");
      setPending(pendingKey, {
        action: "register",
        agentURI: "data:application/json;base64,e30=",
        metadata: { name: "TestMilady" },
      });

      // The confirm action validate checks userConfirmed, so sending "no"
      // won't pass validate. But if the handler is called directly with "no",
      // it should cancel.
      const message = makeMessage("no");
      const { calls, fn } = collectCallbacks();

      await confirmAction.handler(
        runtime,
        message,
        undefined as unknown as State,
        {},
        fn,
      );

      // Pending should be cleared
      expect(getPending(pendingKey)).toBeUndefined();

      // Service should NOT have been called
      expect(mockRegisterAgent).not.toHaveBeenCalled();

      // Should return cancellation message
      const lastCall = calls[calls.length - 1];
      expect(lastCall.text).toContain("cancelled");
    });

    it("returns no-pending message when there is no pending state", async () => {
      const runtime = makeRuntime();
      const message = makeMessage("yes");
      const { calls, fn } = collectCallbacks();

      await confirmAction.handler(
        runtime,
        message,
        undefined as unknown as State,
        {},
        fn,
      );

      const lastCall = calls[calls.length - 1];
      expect(lastCall.text).toContain("No pending");

      // Service should NOT have been called
      expect(mockRegisterAgent).not.toHaveBeenCalled();
    });

    it("validate returns true when user says yes and pending state exists", async () => {
      const runtime = makeRuntime();

      const pendingKey = registerPendingKey("test-agent-id");
      setPending(pendingKey, { action: "register", agentURI: "..." });

      const message = makeMessage("yes");
      const result = await confirmAction.validate(runtime, message);
      expect(result).toBe(true);
    });

    it("validate returns false when user says yes but no pending state exists", async () => {
      const runtime = makeRuntime();
      const message = makeMessage("yes");
      const result = await confirmAction.validate(runtime, message);
      expect(result).toBe(false);
    });

    it("validate returns false when pending state exists but user doesn't confirm", async () => {
      const runtime = makeRuntime();

      const pendingKey = registerPendingKey("test-agent-id");
      setPending(pendingKey, { action: "register", agentURI: "..." });

      const message = makeMessage("tell me more about this");
      const result = await confirmAction.validate(runtime, message);
      expect(result).toBe(false);
    });
  });

  // ── TTL expiry ──

  describe("TTL expiry", () => {
    it("cleans up stale pending entries older than 5 minutes", () => {
      const pendingKey = registerPendingKey("test-agent-id");
      setPending(pendingKey, { action: "register", agentURI: "..." });

      // Manually backdate the timestamp by 6 minutes
      const internalMap = _getPendingMapForTesting();
      const entry = internalMap.get(pendingKey);
      expect(entry).toBeDefined();
      entry!.timestamp = Date.now() - 6 * 60 * 1000;

      // getPending should return undefined for expired entries
      const result = getPending(pendingKey);
      expect(result).toBeUndefined();

      // The entry should have been removed from the map
      expect(internalMap.has(pendingKey)).toBe(false);
    });

    it("keeps entries that are within the 5-minute window", () => {
      const pendingKey = registerPendingKey("test-agent-id");
      const data = { action: "register", agentURI: "data:test" };
      setPending(pendingKey, data);

      // Backdate by 4 minutes (within TTL)
      const internalMap = _getPendingMapForTesting();
      const entry = internalMap.get(pendingKey);
      entry!.timestamp = Date.now() - 4 * 60 * 1000;

      const result = getPending(pendingKey);
      expect(result).toBeDefined();
      expect(result?.agentURI).toBe("data:test");
    });

    it("expired pending entries cause confirm handler to return no-pending", async () => {
      const runtime = makeRuntime();

      // Set up pending state and immediately expire it
      const pendingKey = registerPendingKey("test-agent-id");
      setPending(pendingKey, { action: "register", agentURI: "..." });
      const internalMap = _getPendingMapForTesting();
      internalMap.get(pendingKey)!.timestamp = Date.now() - 6 * 60 * 1000;

      const message = makeMessage("yes");
      const { calls, fn } = collectCallbacks();

      await confirmAction.handler(
        runtime,
        message,
        undefined as unknown as State,
        {},
        fn,
      );

      const lastCall = calls[calls.length - 1];
      expect(lastCall.text).toContain("No pending");
      expect(mockRegisterAgent).not.toHaveBeenCalled();
    });
  });
});
