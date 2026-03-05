import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpinionWsService } from "../services/opinion-ws.js";

// ── Mock WebSocket ──────────────────────────────────────────

type WsEventHandler = ((event: { data: string }) => void) | null;
type WsVoidHandler = (() => void) | null;

class MockWebSocket {
  static OPEN = 1;
  static readonly instances: MockWebSocket[] = [];

  readyState = MockWebSocket.OPEN;
  onopen: WsVoidHandler = null;
  onclose: WsVoidHandler = null;
  onerror: WsVoidHandler = null;
  onmessage: WsEventHandler = null;

  send = vi.fn();
  close = vi.fn();

  constructor() {
    MockWebSocket.instances.push(this);
  }

  /** Simulate receiving a server message. */
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  /** Simulate the WS opening. */
  simulateOpen() {
    this.onopen?.();
  }

  /** Simulate the WS closing. */
  simulateClose() {
    this.onclose?.();
  }
}

// Mock the client module so subscribeToPositionMarkets doesn't hit real APIs
vi.mock("../client.js", () => ({
  opinionClient: {
    get isReady() {
      return false;
    },
    getPositions: vi.fn().mockResolvedValue({ result: [] }),
  },
}));

describe("OpinionWsService", () => {
  it("has correct serviceType", () => {
    expect(OpinionWsService.serviceType).toBe("opinion-ws");
  });

  it("does not connect without API key", async () => {
    const original = process.env.OPINION_API_KEY;
    delete process.env.OPINION_API_KEY;
    const service = new OpinionWsService();
    await service.initialize({
      logger: { warn: () => {} },
    } as unknown as IAgentRuntime);
    expect(service.isConnected).toBe(false);
    if (original) process.env.OPINION_API_KEY = original;
  });

  describe("with mocked WebSocket", () => {
    let service: OpinionWsService;
    let mockRuntime: IAgentRuntime;
    let warnSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.useFakeTimers();
      MockWebSocket.instances.length = 0;

      // Inject mock WebSocket into global scope
      vi.stubGlobal("WebSocket", MockWebSocket);

      warnSpy = vi.fn();
      mockRuntime = {
        logger: { info: vi.fn(), warn: warnSpy },
      } as unknown as IAgentRuntime;

      service = new OpinionWsService();
      process.env.OPINION_API_KEY = "test-key";
    });

    afterEach(async () => {
      await service.cleanup();
      vi.useRealTimers();
      vi.unstubAllGlobals();
      delete process.env.OPINION_API_KEY;
    });

    // ── 10% price alert threshold ───────────────────────────

    describe("handleMessage — price alert threshold", () => {
      it("logs a warning when price moves >= 10%", async () => {
        await service.initialize(mockRuntime);
        const ws = MockWebSocket.instances[0];
        ws.simulateOpen();

        // Seed an initial price
        ws.simulateMessage({
          channel: "market.last.price",
          data: { tokenId: "tok-1", price: "1.00", marketId: 42 },
        });

        // Move price up by 15% (above 10% threshold)
        ws.simulateMessage({
          channel: "market.last.price",
          data: { tokenId: "tok-1", price: "1.15", marketId: 42 },
        });

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("price alert"),
        );
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("up"));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("15.0%"));
      });

      it("does not log when price moves < 10%", async () => {
        await service.initialize(mockRuntime);
        const ws = MockWebSocket.instances[0];
        ws.simulateOpen();

        ws.simulateMessage({
          channel: "market.last.price",
          data: { tokenId: "tok-2", price: "1.00", marketId: 43 },
        });

        // Move price by only 5%
        ws.simulateMessage({
          channel: "market.last.price",
          data: { tokenId: "tok-2", price: "1.05", marketId: 43 },
        });

        // Only the "connected" info should have been logged, not a price alert
        expect(warnSpy).not.toHaveBeenCalledWith(
          expect.stringContaining("price alert"),
        );
      });

      it("detects downward price movement", async () => {
        await service.initialize(mockRuntime);
        const ws = MockWebSocket.instances[0];
        ws.simulateOpen();

        ws.simulateMessage({
          channel: "market.last.price",
          data: { tokenId: "tok-3", price: "1.00", marketId: 44 },
        });

        // Drop price by 20%
        ws.simulateMessage({
          channel: "market.last.price",
          data: { tokenId: "tok-3", price: "0.80", marketId: 44 },
        });

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("down"));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("20.0%"));
      });

      it("does not alert on first price (no baseline)", async () => {
        await service.initialize(mockRuntime);
        const ws = MockWebSocket.instances[0];
        ws.simulateOpen();

        // First message — no prior price to compare against
        ws.simulateMessage({
          channel: "market.last.price",
          data: { tokenId: "tok-4", price: "0.50", marketId: 45 },
        });

        expect(warnSpy).not.toHaveBeenCalledWith(
          expect.stringContaining("price alert"),
        );
      });

      it("ignores messages on non-price channels", async () => {
        await service.initialize(mockRuntime);
        const ws = MockWebSocket.instances[0];
        ws.simulateOpen();

        ws.simulateMessage({
          channel: "trade.order.update",
          data: { orderId: "abc" },
        });

        expect(warnSpy).not.toHaveBeenCalledWith(
          expect.stringContaining("price alert"),
        );
      });
    });

    // ── stop() / cleanup() timer teardown ───────────────────

    describe("stop / cleanup timer teardown", () => {
      it("clears heartbeat timer on cleanup", async () => {
        await service.initialize(mockRuntime);
        const ws = MockWebSocket.instances[0];
        ws.simulateOpen();

        // Heartbeat timer should be active after connect
        // Advance past one heartbeat interval (25s) — should have sent a heartbeat
        vi.advanceTimersByTime(25_000);
        expect(ws.send).toHaveBeenCalledWith(
          JSON.stringify({ action: "HEARTBEAT" }),
        );
        ws.send.mockClear();

        // Cleanup should clear the timer
        await service.stop();

        // Advancing further should NOT send another heartbeat
        vi.advanceTimersByTime(25_000);
        expect(ws.send).not.toHaveBeenCalled();
      });

      it("clears reconnect timer on cleanup", async () => {
        await service.initialize(mockRuntime);
        const ws = MockWebSocket.instances[0];
        ws.simulateOpen();

        const instanceCountBefore = MockWebSocket.instances.length;

        // Simulate disconnect — triggers reconnect timer
        ws.simulateClose();

        // Cleanup before reconnect fires
        await service.stop();

        // Advance past reconnect delay — should NOT create new WS
        vi.advanceTimersByTime(120_000);
        expect(MockWebSocket.instances.length).toBe(instanceCountBefore);
      });

      it("closes the WebSocket on cleanup", async () => {
        await service.initialize(mockRuntime);
        const ws = MockWebSocket.instances[0];
        ws.simulateOpen();

        await service.cleanup();

        expect(ws.close).toHaveBeenCalled();
        expect(service.isConnected).toBe(false);
      });

      it("stop delegates to cleanup", async () => {
        await service.initialize(mockRuntime);
        const ws = MockWebSocket.instances[0];
        ws.simulateOpen();

        await service.stop();

        expect(ws.close).toHaveBeenCalled();
        expect(service.isConnected).toBe(false);
      });
    });

    // ── message routing ─────────────────────────────────────

    describe("message routing", () => {
      it("handles non-object messages without crashing", async () => {
        await service.initialize(mockRuntime);
        const ws = MockWebSocket.instances[0];
        ws.simulateOpen();

        // These should not throw
        ws.onmessage?.({ data: "not-json" });
        ws.onmessage?.({ data: JSON.stringify(null) });
        ws.onmessage?.({ data: JSON.stringify(42) });
        ws.onmessage?.({ data: JSON.stringify("string") });
      });

      it("handles message with missing data field gracefully", async () => {
        await service.initialize(mockRuntime);
        const ws = MockWebSocket.instances[0];
        ws.simulateOpen();

        ws.simulateMessage({ channel: "market.last.price" });
        // Should not throw, no price alert logged
        expect(warnSpy).not.toHaveBeenCalledWith(
          expect.stringContaining("price alert"),
        );
      });
    });
  });
});
