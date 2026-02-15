import type { MessagePayload, RunEventPayload, UUID } from "@elizaos/core";
import { EventType } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPhettaCompanionPlugin,
  resolvePhettaCompanionOptionsFromEnv,
} from "./phetta-companion-plugin.js";

type FetchInit = { method?: string; body?: string };

function fetchCall(
  mockFetch: ReturnType<typeof vi.fn>,
  idx: number,
): [string, FetchInit] {
  return mockFetch.mock.calls[idx] as unknown as [string, FetchInit];
}

function fetchBody(call: [string, FetchInit]): Record<string, unknown> {
  const init = call[1];
  const raw = init.body ?? "{}";
  return JSON.parse(raw) as Record<string, unknown>;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("phetta-companion-plugin", () => {
  describe("resolvePhettaCompanionOptionsFromEnv", () => {
    it("is disabled by default", () => {
      const opts = resolvePhettaCompanionOptionsFromEnv({});
      expect(opts.enabled).toBe(false);
      expect(opts.httpUrl).toBe("http://127.0.0.1:9876");
      expect(opts.timeoutMs).toBe(300);
    });

    it("parses enable + url overrides", () => {
      const opts = resolvePhettaCompanionOptionsFromEnv({
        PHETTA_COMPANION_ENABLED: "true",
        PHETTA_COMPANION_HTTP_URL: "http://127.0.0.1:9999/",
        PHETTA_COMPANION_TIMEOUT_MS: "1234",
        PHETTA_COMPANION_FORWARD_ACTIONS: "1",
      });
      expect(opts.enabled).toBe(true);
      expect(opts.httpUrl).toBe("http://127.0.0.1:9999");
      expect(opts.timeoutMs).toBe(1234);
      expect(opts.forwardActions).toBe(true);
    });
  });

  describe("event forwarding", () => {
    it("forwards MESSAGE_RECEIVED as userMessage", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      const plugin = createPhettaCompanionPlugin({
        enabled: true,
        httpUrl: "http://127.0.0.1:9876",
        timeoutMs: 300,
        forwardUserMessages: true,
        forwardAssistantMessages: false,
        forwardRuns: false,
        forwardActions: false,
      });

      const handler = plugin.events?.[EventType.MESSAGE_RECEIVED]?.[0];
      expect(handler).toBeTypeOf("function");

      const payload: MessagePayload = {
        runtime: {} as unknown as MessagePayload["runtime"],
        message: {
          roomId: "room" as unknown as UUID,
          worldId: "world" as unknown as UUID,
          entityId: "entity" as unknown as UUID,
          content: { text: "hello", source: "test" },
          metadata: { sessionKey: "agent:main:self" },
        } as unknown as MessagePayload["message"],
      };

      await handler?.(payload);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call0 = fetchCall(mockFetch, 0);
      expect(call0[0]).toBe("http://127.0.0.1:9876/event");
      expect(call0[1].method).toBe("POST");
      const body = fetchBody(call0);
      expect(body.type).toBe("userMessage");
      expect(body.message).toBe("hello");
      expect(
        (body.data as { sessionKey?: string } | undefined)?.sessionKey,
      ).toBe("agent:main:self");
    });

    it("does not forward empty text messages", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      const plugin = createPhettaCompanionPlugin({
        enabled: true,
        httpUrl: "http://127.0.0.1:9876",
        timeoutMs: 300,
        forwardUserMessages: true,
        forwardAssistantMessages: true,
        forwardRuns: false,
        forwardActions: false,
      });

      const handler = plugin.events?.[EventType.MESSAGE_RECEIVED]?.[0];
      await handler?.({
        runtime: {} as unknown as MessagePayload["runtime"],
        message: {
          content: { text: "   " },
        } as unknown as MessagePayload["message"],
      });

      expect(mockFetch).toHaveBeenCalledTimes(0);
    });

    it("forwards MESSAGE_SENT as assistantMessage", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      const plugin = createPhettaCompanionPlugin({
        enabled: true,
        httpUrl: "http://127.0.0.1:9876",
        timeoutMs: 300,
        forwardUserMessages: false,
        forwardAssistantMessages: true,
        forwardRuns: false,
        forwardActions: false,
      });

      const handler = plugin.events?.[EventType.MESSAGE_SENT]?.[0];
      expect(handler).toBeTypeOf("function");

      await handler?.({
        runtime: {} as unknown as MessagePayload["runtime"],
        message: {
          content: { text: "hi from agent", source: "test" },
        } as unknown as MessagePayload["message"],
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = fetchBody(fetchCall(mockFetch, 0));
      expect(body.type).toBe("assistantMessage");
      expect(body.message).toBe("hi from agent");
    });

    it("forwards RUN_STARTED and RUN_ENDED as agentStart/agentDone", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      const plugin = createPhettaCompanionPlugin({
        enabled: true,
        httpUrl: "http://127.0.0.1:9876",
        timeoutMs: 300,
        forwardUserMessages: false,
        forwardAssistantMessages: false,
        forwardRuns: true,
        forwardActions: false,
      });

      const started = plugin.events?.[EventType.RUN_STARTED]?.[0];
      const ended = plugin.events?.[EventType.RUN_ENDED]?.[0];
      expect(started).toBeTypeOf("function");
      expect(ended).toBeTypeOf("function");

      const runPayload: RunEventPayload = {
        runtime: {} as unknown as RunEventPayload["runtime"],
        runId: "run" as unknown as UUID,
        messageId: "msg" as unknown as UUID,
        roomId: "room" as unknown as UUID,
        entityId: "entity" as unknown as UUID,
        startTime: Date.now(),
        status: "started",
      };

      await started?.(runPayload);
      await ended?.({
        ...runPayload,
        status: "completed",
        endTime: Date.now(),
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const first = fetchBody(fetchCall(mockFetch, 0));
      const second = fetchBody(fetchCall(mockFetch, 1));
      expect(first.type).toBe("agentStart");
      expect(second.type).toBe("agentDone");
      expect((second.data as { runId?: string } | undefined)?.runId).toBe(
        "run",
      );
    });
  });

  // Note: messageService patching tests were removed because the plugin now uses
  // proper event handlers (MESSAGE_RECEIVED/MESSAGE_SENT) instead of monkey-patching.
  // The event handlers are tested via the event handling tests above.
});
