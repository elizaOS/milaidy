import { afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@elizaos/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@elizaos/core")>();
  return {
    ...actual,
    EventType: {
      MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
      MESSAGE_SENT: "MESSAGE_SENT",
      RUN_STARTED: "RUN_STARTED",
      RUN_ENDED: "RUN_ENDED",
      RUN_TIMEOUT: "RUN_TIMEOUT",
      ACTION_STARTED: "ACTION_STARTED",
      ACTION_COMPLETED: "ACTION_COMPLETED",
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  createPhettaCompanionPlugin,
  type PhettaCompanionPluginOptions,
  resolvePhettaCompanionOptionsFromEnv,
} from "../phetta-companion-plugin.js";

// ---------------------------------------------------------------------------
// Tests — parseBool / parseIntSafe / normalizeBaseUrl (via resolvePhettaCompanionOptionsFromEnv)
// ---------------------------------------------------------------------------

describe("resolvePhettaCompanionOptionsFromEnv", () => {
  it("returns defaults when env is empty", () => {
    const opts = resolvePhettaCompanionOptionsFromEnv({});
    expect(opts.enabled).toBe(false);
    expect(opts.httpUrl).toBe("http://127.0.0.1:9876");
    expect(opts.timeoutMs).toBe(300);
    expect(opts.forwardUserMessages).toBe(true);
    expect(opts.forwardAssistantMessages).toBe(true);
    expect(opts.forwardRuns).toBe(true);
    expect(opts.forwardActions).toBe(false);
  });

  // parseBool truthy values
  it.each([
    "1",
    "true",
    "yes",
    "y",
    "on",
    "TRUE",
    "Yes",
    "ON",
  ])("parseBool treats '%s' as true", (v) => {
    const opts = resolvePhettaCompanionOptionsFromEnv({
      PHETTA_COMPANION_ENABLED: v,
    });
    expect(opts.enabled).toBe(true);
  });

  // parseBool falsy values
  it.each([
    "0",
    "false",
    "no",
    "n",
    "off",
    "FALSE",
    "No",
    "OFF",
  ])("parseBool treats '%s' as false", (v) => {
    const opts = resolvePhettaCompanionOptionsFromEnv({
      PHETTA_COMPANION_ENABLED: v,
    });
    expect(opts.enabled).toBe(false);
  });

  // parseBool defaults on unrecognized
  it("parseBool returns default for unrecognized values", () => {
    const opts = resolvePhettaCompanionOptionsFromEnv({
      PHETTA_COMPANION_ENABLED: "maybe",
    });
    expect(opts.enabled).toBe(false); // default is false
  });

  // parseIntSafe
  it("parses timeout from string", () => {
    const opts = resolvePhettaCompanionOptionsFromEnv({
      PHETTA_COMPANION_TIMEOUT_MS: "500",
    });
    expect(opts.timeoutMs).toBe(500);
  });

  it("falls back to default on non-numeric timeout", () => {
    const opts = resolvePhettaCompanionOptionsFromEnv({
      PHETTA_COMPANION_TIMEOUT_MS: "abc",
    });
    expect(opts.timeoutMs).toBe(300);
  });

  it("clamps timeout to minimum of 50ms", () => {
    const opts = resolvePhettaCompanionOptionsFromEnv({
      PHETTA_COMPANION_TIMEOUT_MS: "10",
    });
    expect(opts.timeoutMs).toBe(50);
  });

  // normalizeBaseUrl
  it("strips trailing slash from httpUrl", () => {
    const opts = resolvePhettaCompanionOptionsFromEnv({
      PHETTA_COMPANION_HTTP_URL: "http://localhost:1234/",
    });
    expect(opts.httpUrl).toBe("http://localhost:1234");
  });

  it("trims whitespace from httpUrl", () => {
    const opts = resolvePhettaCompanionOptionsFromEnv({
      PHETTA_COMPANION_HTTP_URL: "  http://localhost:5555  ",
    });
    expect(opts.httpUrl).toBe("http://localhost:5555");
  });

  // Forward flags
  it("respects forwarding overrides", () => {
    const opts = resolvePhettaCompanionOptionsFromEnv({
      PHETTA_COMPANION_FORWARD_USER_MESSAGES: "false",
      PHETTA_COMPANION_FORWARD_ASSISTANT_MESSAGES: "false",
      PHETTA_COMPANION_FORWARD_RUNS: "0",
      PHETTA_COMPANION_FORWARD_ACTIONS: "true",
    });
    expect(opts.forwardUserMessages).toBe(false);
    expect(opts.forwardAssistantMessages).toBe(false);
    expect(opts.forwardRuns).toBe(false);
    expect(opts.forwardActions).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests — createPhettaCompanionPlugin
// ---------------------------------------------------------------------------

describe("createPhettaCompanionPlugin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Retrieve an action by name, throwing if not found (avoids non-null assertion). */
  function getAction(
    plugin: ReturnType<typeof createPhettaCompanionPlugin>,
    name: string,
  ) {
    const action = plugin.actions?.find((a) => a.name === name);
    if (!action) throw new Error(`Action ${name} not found`);
    return action;
  }

  function defaultOpts(
    overrides: Partial<PhettaCompanionPluginOptions> = {},
  ): PhettaCompanionPluginOptions {
    return {
      enabled: true,
      httpUrl: "http://127.0.0.1:9876",
      timeoutMs: 300,
      forwardUserMessages: true,
      forwardAssistantMessages: true,
      forwardRuns: true,
      forwardActions: false,
      ...overrides,
    };
  }

  // ---- Plugin registration shape ----

  describe("plugin registration", () => {
    it("returns a plugin with correct name and description", () => {
      const plugin = createPhettaCompanionPlugin(defaultOpts());
      expect(plugin.name).toBe("plugin-phetta-companion");
      expect(plugin.description).toContain("Phetta Companion");
    });

    it("includes PHETTA_NOTIFY and PHETTA_SEND_EVENT actions", () => {
      const plugin = createPhettaCompanionPlugin(defaultOpts());
      const actionNames = plugin.actions?.map((a) => a.name) ?? [];
      expect(actionNames).toContain("PHETTA_NOTIFY");
      expect(actionNames).toContain("PHETTA_SEND_EVENT");
    });

    it("registers event handlers when forwarding is enabled", () => {
      const plugin = createPhettaCompanionPlugin(
        defaultOpts({ forwardActions: true }),
      );
      const eventKeys = Object.keys(plugin.events ?? {});
      expect(eventKeys).toContain("MESSAGE_RECEIVED");
      expect(eventKeys).toContain("MESSAGE_SENT");
      expect(eventKeys).toContain("RUN_STARTED");
      expect(eventKeys).toContain("RUN_ENDED");
      expect(eventKeys).toContain("RUN_TIMEOUT");
      expect(eventKeys).toContain("ACTION_STARTED");
      expect(eventKeys).toContain("ACTION_COMPLETED");
    });

    it("omits event handlers when forwarding is disabled", () => {
      const plugin = createPhettaCompanionPlugin(
        defaultOpts({
          forwardUserMessages: false,
          forwardAssistantMessages: false,
          forwardRuns: false,
          forwardActions: false,
        }),
      );
      const eventKeys = Object.keys(plugin.events ?? {});
      expect(eventKeys).not.toContain("MESSAGE_RECEIVED");
      expect(eventKeys).not.toContain("MESSAGE_SENT");
      expect(eventKeys).not.toContain("RUN_STARTED");
      expect(eventKeys).not.toContain("RUN_ENDED");
      expect(eventKeys).not.toContain("RUN_TIMEOUT");
      expect(eventKeys).not.toContain("ACTION_STARTED");
      expect(eventKeys).not.toContain("ACTION_COMPLETED");
    });
  });

  // ---- PHETTA_NOTIFY action ----

  describe("PHETTA_NOTIFY action handler", () => {
    it("sends notification via fetch and returns success", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response("OK", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const plugin = createPhettaCompanionPlugin(defaultOpts());
      const action = getAction(plugin, "PHETTA_NOTIFY");

      const result = await action.handler(
        {} as unknown,
        {} as unknown,
        {} as unknown,
        { parameters: { message: "Hello pet!" } } as unknown,
        vi.fn(),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:9876/notify",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Hello pet!"),
        }),
      );
      expect(result).toEqual(expect.objectContaining({ success: true }));
    });

    it("defaults message to 'Notification' when not provided", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response("OK", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const plugin = createPhettaCompanionPlugin(defaultOpts());
      const action = getAction(plugin, "PHETTA_NOTIFY");

      await action.handler(
        {} as unknown,
        {} as unknown,
        {} as unknown,
        { parameters: {} } as unknown,
        vi.fn(),
      );

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.message).toBe("Notification");
    });

    it("returns failure when fetch fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Connection refused")),
      );

      const plugin = createPhettaCompanionPlugin(defaultOpts());
      const action = getAction(plugin, "PHETTA_NOTIFY");

      const result = await action.handler(
        {} as unknown,
        {} as unknown,
        {} as unknown,
        { parameters: { message: "test" } } as unknown,
        vi.fn(),
      );

      expect(result).toEqual(expect.objectContaining({ success: false }));
    });
  });

  // ---- PHETTA_SEND_EVENT action ----

  describe("PHETTA_SEND_EVENT action handler", () => {
    it("sends event via fetch and returns success", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response("OK", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const plugin = createPhettaCompanionPlugin(defaultOpts());
      const action = getAction(plugin, "PHETTA_SEND_EVENT");

      const result = await action.handler(
        {} as unknown,
        {} as unknown,
        {} as unknown,
        {
          parameters: {
            type: "agentThinking",
            message: "Processing...",
            file: "/path/to/file.ts",
            data: { key: "value" },
          },
        } as unknown,
        vi.fn(),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:9876/event",
        expect.objectContaining({
          method: "POST",
        }),
      );

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.type).toBe("agentThinking");
      expect(body.message).toBe("Processing...");
      expect(body.file).toBe("/path/to/file.ts");
      expect(body.data).toEqual({ key: "value" });

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          values: { delivered: true, type: "agentThinking" },
        }),
      );
    });

    it("defaults type to 'custom' when not provided", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response("OK", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const plugin = createPhettaCompanionPlugin(defaultOpts());
      const action = getAction(plugin, "PHETTA_SEND_EVENT");

      await action.handler(
        {} as unknown,
        {} as unknown,
        {} as unknown,
        { parameters: {} } as unknown,
        vi.fn(),
      );

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.type).toBe("custom");
    });

    it("ignores non-object data parameter", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response("OK", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const plugin = createPhettaCompanionPlugin(defaultOpts());
      const action = getAction(plugin, "PHETTA_SEND_EVENT");

      await action.handler(
        {} as unknown,
        {} as unknown,
        {} as unknown,
        { parameters: { type: "test", data: "not-object" } } as unknown,
        vi.fn(),
      );

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.data).toBeUndefined();
    });

    it("ignores array data parameter", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response("OK", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const plugin = createPhettaCompanionPlugin(defaultOpts());
      const action = getAction(plugin, "PHETTA_SEND_EVENT");

      await action.handler(
        {} as unknown,
        {} as unknown,
        {} as unknown,
        { parameters: { type: "test", data: [1, 2, 3] } } as unknown,
        vi.fn(),
      );

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.data).toBeUndefined();
    });
  });

  // ---- Event routing logic ----

  describe("event routing", () => {
    it("sends userMessage event on MESSAGE_RECEIVED", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response("OK", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const plugin = createPhettaCompanionPlugin(defaultOpts());
      const handlers = (
        plugin.events as Record<
          string,
          Array<(payload: unknown) => Promise<void>>
        >
      ).MESSAGE_RECEIVED;
      expect(handlers).toHaveLength(1);

      await handlers[0]({
        message: {
          content: { text: "Hello agent!" },
          roomId: "room-1",
          worldId: "world-1",
          entityId: "entity-1",
          metadata: { sessionKey: "session-1" },
        },
      });

      // Wait for fire-and-forget
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.type).toBe("userMessage");
      expect(body.message).toBe("Hello agent!");
      expect(body.data.roomId).toBe("room-1");
    });

    it("sends assistantMessage event on MESSAGE_SENT", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response("OK", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const plugin = createPhettaCompanionPlugin(defaultOpts());
      const handlers = (
        plugin.events as Record<
          string,
          Array<(payload: unknown) => Promise<void>>
        >
      ).MESSAGE_SENT;
      expect(handlers).toHaveLength(1);

      await handlers[0]({
        message: {
          content: { text: "Here is my response" },
          roomId: "room-2",
        },
      });

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.type).toBe("assistantMessage");
      expect(body.message).toBe("Here is my response");
    });

    it("skips event when message text is empty", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response("OK", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const plugin = createPhettaCompanionPlugin(defaultOpts());
      const handlers = (
        plugin.events as Record<
          string,
          Array<(payload: unknown) => Promise<void>>
        >
      ).MESSAGE_RECEIVED;

      await handlers[0]({
        message: { content: { text: "   " } },
      });

      // Give fire-and-forget a chance
      await new Promise((r) => setTimeout(r, 50));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends agentStart/agentDone/error on run events", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response("OK", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const plugin = createPhettaCompanionPlugin(defaultOpts());
      const events = plugin.events as Record<
        string,
        Array<(payload: unknown) => Promise<void>>
      >;

      const runPayload = {
        runId: "run-1",
        messageId: "msg-1",
        roomId: "room-1",
        entityId: "entity-1",
        status: "active",
        duration: 100,
      };

      await events.RUN_STARTED[0](runPayload);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      let body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.type).toBe("agentStart");
      expect(body.data.runId).toBe("run-1");

      await events.RUN_ENDED[0](runPayload);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

      body = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(body.type).toBe("agentDone");

      await events.RUN_TIMEOUT[0](runPayload);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

      body = JSON.parse(fetchMock.mock.calls[2][1].body);
      expect(body.type).toBe("error");
      expect(body.message).toBe("Agent run timed out.");
    });

    it("sends agentThinking/custom on action events when forwardActions enabled", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response("OK", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const plugin = createPhettaCompanionPlugin(
        defaultOpts({ forwardActions: true }),
      );
      const events = plugin.events as Record<
        string,
        Array<(payload: unknown) => Promise<void>>
      >;

      const actionPayload = {
        roomId: "room-1",
        world: "world-1",
        messageId: "msg-1",
        content: { type: "action", source: "agent", actions: ["SEARCH"] },
      };

      await events.ACTION_STARTED[0](actionPayload);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      let body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.type).toBe("agentThinking");

      await events.ACTION_COMPLETED[0](actionPayload);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

      body = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(body.type).toBe("custom");
      expect(body.message).toBe("Action completed.");
    });
  });

  // ---- HTTP client error handling ----

  describe("HTTP client error handling", () => {
    it("does not throw on fetch rejection (fire-and-forget)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      );

      const plugin = createPhettaCompanionPlugin(defaultOpts());
      const action = getAction(plugin, "PHETTA_NOTIFY");

      // Should not throw
      const result = await action.handler(
        {} as unknown,
        {} as unknown,
        {} as unknown,
        { parameters: { message: "test" } } as unknown,
        vi.fn(),
      );

      expect(result).toEqual(expect.objectContaining({ success: false }));
    });

    it("returns false when server returns non-OK status", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("Error", { status: 500 })),
      );

      const plugin = createPhettaCompanionPlugin(defaultOpts());
      const action = getAction(plugin, "PHETTA_NOTIFY");

      const result = await action.handler(
        {} as unknown,
        {} as unknown,
        {} as unknown,
        { parameters: { message: "test" } } as unknown,
        vi.fn(),
      );

      expect(result).toEqual(expect.objectContaining({ success: false }));
    });
  });
});
