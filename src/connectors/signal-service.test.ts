/**
 * Signal Service Tests
 *
 * Tests the @elizaos/plugin-signal service and exported utilities
 * with mocked HTTP calls (no signal-cli required).
 *
 * @see https://github.com/milady-ai/milady/issues/148
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock global fetch BEFORE importing the plugin so it never makes real HTTP.
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const {
  default: signalPlugin,
  SignalService,
  isValidE164,
  isValidGroupId,
  isValidUuid,
  normalizeE164,
  normalizeBaseUrl,
  getSignalContactDisplayName,
  parseSignalEventData,
  signalCheck,
  signalRpcRequest,
  MAX_SIGNAL_MESSAGE_LENGTH,
  MAX_SIGNAL_ATTACHMENT_SIZE,
  SIGNAL_SERVICE_NAME,
  SignalPluginError,
  SignalConfigurationError,
  SignalApiError,
  SignalServiceNotInitializedError,
  SignalClientNotAvailableError,
  SignalEventTypes,
} = await import("@elizaos/plugin-signal");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRuntime(overrides: Record<string, unknown> = {}) {
  return {
    agentId: "agent-1",
    getSetting: vi.fn().mockReturnValue(undefined),
    hasService: vi.fn().mockReturnValue(true),
    registerSendHandler: vi.fn(),
    getService: vi.fn(),
    sendMessageToTarget: vi.fn(),
    ensureConnection: vi.fn(),
    createMemory: vi.fn(),
    emitEvent: vi.fn(),
    createRoom: vi.fn(),
    getRoom: vi.fn().mockReturnValue(null),
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    ...overrides,
  };
}

function mockFetchResponse(
  body: unknown,
  status = 200,
  statusText = "OK",
): void {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    json: vi.fn().mockResolvedValue(body),
    headers: new Headers({ "content-type": "application/json" }),
  });
}

function mockFetchError(message: string): void {
  mockFetch.mockRejectedValueOnce(new Error(message));
}

// ---------------------------------------------------------------------------
// Plugin structure
// ---------------------------------------------------------------------------

describe("Signal Plugin Structure", () => {
  it("default export is defined", () => {
    expect(signalPlugin).toBeDefined();
  });

  it("has name 'signal'", () => {
    expect(signalPlugin.name).toBe("signal");
  });

  it("has a description", () => {
    expect(signalPlugin.description).toBeDefined();
    expect(typeof signalPlugin.description).toBe("string");
  });

  it("exports actions array with expected action names", () => {
    expect(Array.isArray(signalPlugin.actions)).toBe(true);
    const names = signalPlugin.actions!.map((a: { name: string }) => a.name);
    expect(names).toContain("SIGNAL_LIST_CONTACTS");
    expect(names).toContain("SIGNAL_LIST_GROUPS");
    expect(names).toContain("SIGNAL_SEND_MESSAGE");
    expect(names).toContain("SIGNAL_SEND_REACTION");
  });

  it("exports providers array with signalConversationState", () => {
    expect(Array.isArray(signalPlugin.providers)).toBe(true);
    const names = signalPlugin.providers!.map(
      (p: { name: string }) => p.name,
    );
    expect(names).toContain("signalConversationState");
  });

  it("exports services array with at least one service", () => {
    expect(Array.isArray(signalPlugin.services)).toBe(true);
    expect(signalPlugin.services!.length).toBeGreaterThan(0);
  });

  it("has an init function", () => {
    expect(typeof signalPlugin.init).toBe("function");
  });

  it("each action has name, description, validate, handler", () => {
    for (const action of signalPlugin.actions!) {
      expect(action.name).toBeDefined();
      expect(action.description).toBeDefined();
      expect(typeof action.validate).toBe("function");
      expect(typeof action.handler).toBe("function");
    }
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("Signal Constants", () => {
  it("SIGNAL_SERVICE_NAME is 'signal'", () => {
    expect(SIGNAL_SERVICE_NAME).toBe("signal");
  });

  it("MAX_SIGNAL_MESSAGE_LENGTH is 4000", () => {
    expect(MAX_SIGNAL_MESSAGE_LENGTH).toBe(4000);
  });

  it("MAX_SIGNAL_ATTACHMENT_SIZE is 100MB", () => {
    expect(MAX_SIGNAL_ATTACHMENT_SIZE).toBe(100 * 1024 * 1024);
  });

  it("SignalEventTypes contains expected events", () => {
    expect(SignalEventTypes.MESSAGE_RECEIVED).toBe("SIGNAL_MESSAGE_RECEIVED");
    expect(SignalEventTypes.MESSAGE_SENT).toBe("SIGNAL_MESSAGE_SENT");
    expect(SignalEventTypes.REACTION_RECEIVED).toBe(
      "SIGNAL_REACTION_RECEIVED",
    );
  });
});

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

describe("Signal Error Classes", () => {
  it("SignalPluginError extends Error", () => {
    const err = new SignalPluginError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("test");
  });

  it("SignalConfigurationError has code MISSING_CONFIG", () => {
    const err = new SignalConfigurationError("bad config");
    expect(err).toBeInstanceOf(SignalPluginError);
    expect(err.code).toBe("MISSING_CONFIG");
  });

  it("SignalServiceNotInitializedError has code SERVICE_NOT_INITIALIZED", () => {
    const err = new SignalServiceNotInitializedError("not init");
    expect(err).toBeInstanceOf(SignalPluginError);
    expect(err.code).toBe("SERVICE_NOT_INITIALIZED");
  });

  it("SignalClientNotAvailableError has code CLIENT_NOT_AVAILABLE", () => {
    const err = new SignalClientNotAvailableError("no client");
    expect(err).toBeInstanceOf(SignalPluginError);
    expect(err.code).toBe("CLIENT_NOT_AVAILABLE");
  });

  it("SignalApiError has code API_ERROR", () => {
    const err = new SignalApiError("api fail");
    expect(err).toBeInstanceOf(SignalPluginError);
    expect(err.code).toBe("API_ERROR");
  });
});

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

describe("isValidE164()", () => {
  it("accepts valid E.164 numbers", () => {
    expect(isValidE164("+14155551234")).toBe(true);
    expect(isValidE164("+442071234567")).toBe(true);
    expect(isValidE164("+905551234567")).toBe(true);
    expect(isValidE164("+1234567")).toBe(true); // minimum 7 digits
    expect(isValidE164("+123456789012345")).toBe(true); // max 15 digits
  });

  it("rejects invalid E.164 numbers", () => {
    expect(isValidE164("4155551234")).toBe(false); // Missing +
    expect(isValidE164("+123")).toBe(false); // Too short
    expect(isValidE164("+1234567890123456")).toBe(false); // 16 digits, too long
    expect(isValidE164("not-a-number")).toBe(false);
    expect(isValidE164("")).toBe(false);
    expect(isValidE164("+")).toBe(false);
  });
});

describe("isValidGroupId()", () => {
  it("accepts valid base64 group IDs (>= 32 chars)", () => {
    // 44-char base64 string
    expect(
      isValidGroupId("YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo="),
    ).toBe(true);
    expect(
      isValidGroupId("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="),
    ).toBe(true);
  });

  it("rejects short strings", () => {
    expect(isValidGroupId("short")).toBe(false);
  });

  it("rejects strings with invalid base64 chars", () => {
    expect(isValidGroupId("invalid!@#$%^&*()_{}[]")).toBe(false);
  });
});

describe("isValidUuid()", () => {
  it("accepts valid UUID v4", () => {
    expect(isValidUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rejects invalid UUIDs", () => {
    expect(isValidUuid("not-a-uuid")).toBe(false);
    expect(isValidUuid("")).toBe(false);
    expect(isValidUuid("550e8400-e29b-41d4-a716")).toBe(false); // truncated
  });
});

describe("normalizeE164()", () => {
  it("returns valid E.164 as-is", () => {
    expect(normalizeE164("+14155551234")).toBe("+14155551234");
  });

  it("auto-prefixes 10-digit number with +1", () => {
    const result = normalizeE164("4155551234");
    expect(result).toBe("+14155551234");
  });

  it("auto-prefixes 11-digit number starting with 1", () => {
    const result = normalizeE164("14155551234");
    expect(result).toBe("+14155551234");
  });

  it("strips non-digit/non-+ characters", () => {
    const result = normalizeE164("+1 (415) 555-1234");
    expect(result).toBe("+14155551234");
  });

  it("returns null for numbers that cannot be normalized", () => {
    expect(normalizeE164("abc")).toBeNull();
    expect(normalizeE164("")).toBeNull();
    expect(normalizeE164("123")).toBeNull();
  });
});

describe("normalizeBaseUrl()", () => {
  it("returns URL with trailing slashes removed", async () => {
    expect(await normalizeBaseUrl("http://localhost:8080/")).toBe(
      "http://localhost:8080",
    );
  });

  it("preserves http/https URLs", async () => {
    expect(await normalizeBaseUrl("https://signal.example.com")).toBe(
      "https://signal.example.com",
    );
  });

  it("prepends http:// when no protocol", async () => {
    expect(await normalizeBaseUrl("localhost:8080")).toBe(
      "http://localhost:8080",
    );
  });
});

describe("getSignalContactDisplayName()", () => {
  it("returns profileName when available", () => {
    expect(
      getSignalContactDisplayName({
        profileName: "Alice",
        name: "Alice Smith",
        number: "+14155551234",
      }),
    ).toBe("Alice");
  });

  it("falls back to name when profileName missing", () => {
    expect(
      getSignalContactDisplayName({
        name: "Bob Smith",
        number: "+14155551234",
      }),
    ).toBe("Bob Smith");
  });

  it("falls back to number when no name fields", () => {
    expect(
      getSignalContactDisplayName({ number: "+14155551234" }),
    ).toBe("+14155551234");
  });
});

describe("parseSignalEventData()", () => {
  it("parses valid JSON", () => {
    expect(parseSignalEventData('{"foo": "bar"}')).toEqual({ foo: "bar" });
  });

  it("returns null for invalid JSON", () => {
    expect(parseSignalEventData("not json")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseSignalEventData("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// signalCheck — health check endpoint
// ---------------------------------------------------------------------------

describe("signalCheck()", () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it("returns ok:true when signal-cli API is reachable", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(""),
    });

    const result = await signalCheck("http://localhost:8080");
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/check"),
      expect.any(Object),
    );
  });

  it("returns ok:false with error when API is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

    const result = await signalCheck("http://localhost:8080");
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// signalRpcRequest — JSON-RPC 2.0
// ---------------------------------------------------------------------------

describe("signalRpcRequest()", () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it("sends JSON-RPC 2.0 request to /api/v1/rpc", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: vi
        .fn()
        .mockResolvedValue(
          JSON.stringify({ jsonrpc: "2.0", result: { version: "0.13" }, id: "1" }),
        ),
    });

    const result = await signalRpcRequest("version", undefined, {
      baseUrl: "http://localhost:8080",
    });

    expect(result).toEqual({ version: "0.13" });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/rpc",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"method":"version"'),
      }),
    );
  });

  it("throws on JSON-RPC error response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32600, message: "Invalid Request" },
          id: "1",
        }),
      ),
    });

    await expect(
      signalRpcRequest("badMethod", undefined, {
        baseUrl: "http://localhost:8080",
      }),
    ).rejects.toThrow();
  });

  it("handles network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(
      signalRpcRequest("version", undefined, {
        baseUrl: "http://localhost:8080",
      }),
    ).rejects.toThrow("ECONNREFUSED");
  });
});

// ---------------------------------------------------------------------------
// SignalService class
// ---------------------------------------------------------------------------

describe("SignalService", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("static properties", () => {
    it("has serviceType 'signal'", () => {
      expect(SignalService.serviceType).toBe("signal");
    });
  });

  describe("start() with mocked HTTP", () => {
    it("creates service instance with valid account number", async () => {
      const runtime = createMockRuntime({
        getSetting: vi.fn((key: string) => {
          const settings: Record<string, string> = {
            SIGNAL_ACCOUNT_NUMBER: "+14155551234",
            SIGNAL_HTTP_URL: "http://localhost:8080",
          };
          return settings[key];
        }),
      });

      // Mock the initialize() calls: getContacts + getGroups + receive polling
      // GET /v1/contacts/{account}
      mockFetchResponse({ contacts: [] });
      // GET /v1/groups/{account}
      mockFetchResponse([]);

      const service = await SignalService.start(runtime);
      expect(service).toBeDefined();
    });

    it("handles initialization failure (error is identifiable)", async () => {
      const runtime = createMockRuntime({
        getSetting: vi.fn((key: string) => {
          const settings: Record<string, string> = {
            SIGNAL_ACCOUNT_NUMBER: "+14155551234",
            SIGNAL_HTTP_URL: "http://localhost:8080",
          };
          return settings[key];
        }),
      });

      // Mock fetch to fail (signal-cli unreachable)
      mockFetchError("ECONNREFUSED");
      mockFetchError("ECONNREFUSED");

      // The plugin may either catch the error internally and return the service,
      // or propagate the error. Either behavior is valid — we verify both paths.
      try {
        const service = await SignalService.start(runtime);
        // If it returns, service should still be defined
        expect(service).toBeDefined();
      } catch (err: any) {
        // If it throws, the error should be the ECONNREFUSED we mocked
        expect(err.message).toContain("ECONNREFUSED");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// isConnectorConfigured — tests from plugin-auto-enable
// ---------------------------------------------------------------------------

describe("isConnectorConfigured (Signal-specific)", () => {
  // Import the actual function
  let isConnectorConfigured: (
    name: string,
    config: unknown,
  ) => boolean;

  beforeEach(async () => {
    const mod = await import("../config/plugin-auto-enable");
    isConnectorConfigured = mod.isConnectorConfigured;
  });

  it("returns true when account is set", () => {
    expect(
      isConnectorConfigured("signal", { account: "+15551234567" }),
    ).toBe(true);
  });

  it("returns true when httpUrl is set", () => {
    expect(
      isConnectorConfigured("signal", { httpUrl: "http://localhost:8080" }),
    ).toBe(true);
  });

  it("returns true when httpHost is set", () => {
    expect(isConnectorConfigured("signal", { httpHost: "localhost" })).toBe(
      true,
    );
  });

  it("returns true when httpPort is set", () => {
    expect(isConnectorConfigured("signal", { httpPort: 8080 })).toBe(true);
  });

  it("returns true when cliPath is set", () => {
    expect(
      isConnectorConfigured("signal", {
        cliPath: "/usr/local/bin/signal-cli",
      }),
    ).toBe(true);
  });

  it("returns true for multi-account with enabled account", () => {
    expect(
      isConnectorConfigured("signal", {
        accounts: {
          primary: { enabled: true, cliPath: "/usr/local/bin/signal-cli" },
        },
      }),
    ).toBe(true);
  });

  it("returns false for multi-account where all accounts disabled", () => {
    expect(
      isConnectorConfigured("signal", {
        accounts: {
          primary: { enabled: false, account: "+15551234567" },
        },
      }),
    ).toBe(false);
  });

  it("returns false for empty config", () => {
    expect(isConnectorConfigured("signal", {})).toBe(false);
  });

  it("returns false when enabled is false", () => {
    expect(
      isConnectorConfigured("signal", {
        enabled: false,
        account: "+15551234567",
      }),
    ).toBe(false);
  });

  it("returns false for null config", () => {
    expect(isConnectorConfigured("signal", null)).toBe(false);
  });
});
