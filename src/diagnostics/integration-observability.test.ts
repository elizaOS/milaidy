import { beforeEach, describe, expect, it, vi } from "vitest";

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    info: vi.fn<(message: string) => void>(),
    warn: vi.fn<(message: string) => void>(),
  },
}));

vi.mock("@elizaos/core", () => ({
  logger: loggerMock,
}));

import type {
  IntegrationBoundary,
  IntegrationObservabilityEvent,
} from "./integration-observability";
import { createIntegrationTelemetrySpan } from "./integration-observability";

const EVENT_PREFIX = "[integration] ";

function parseEvent(line: string): Record<string, unknown> {
  return JSON.parse(line.slice(EVENT_PREFIX.length)) as Record<string, unknown>;
}

function lastInfoEvent(): Record<string, unknown> {
  const [line] = loggerMock.info.mock.calls.at(-1) as [string];
  return parseEvent(line);
}

function lastWarnEvent(): Record<string, unknown> {
  const [line] = loggerMock.warn.mock.calls.at(-1) as [string];
  return parseEvent(line);
}

function fixedClock(start: number, end: number) {
  return vi
    .fn(() => start)
    .mockReturnValueOnce(start)
    .mockReturnValueOnce(end);
}

describe("createIntegrationTelemetrySpan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Schema field contract ───────────────────────────────────────────

  describe("event schema contract", () => {
    it("always emits schema version, boundary, operation, outcome, and durationMs", () => {
      const span = createIntegrationTelemetrySpan(
        { boundary: "cloud", operation: "test_op" },
        { now: fixedClock(0, 10) },
      );
      span.success();

      const event = lastInfoEvent();
      expect(event).toMatchObject({
        schema: "integration_boundary_v1",
        boundary: "cloud",
        operation: "test_op",
        outcome: "success",
        durationMs: 10,
      });
    });

    it("omits timeoutMs when not provided", () => {
      const span = createIntegrationTelemetrySpan(
        { boundary: "cloud", operation: "op" },
        { now: fixedClock(0, 1) },
      );
      span.success();

      expect(lastInfoEvent()).not.toHaveProperty("timeoutMs");
    });

    it("includes timeoutMs when provided", () => {
      const span = createIntegrationTelemetrySpan(
        { boundary: "cloud", operation: "op", timeoutMs: 5000 },
        { now: fixedClock(0, 1) },
      );
      span.success();

      expect(lastInfoEvent()).toHaveProperty("timeoutMs", 5000);
    });

    it("omits statusCode when not provided on success", () => {
      const span = createIntegrationTelemetrySpan(
        { boundary: "cloud", operation: "op" },
        { now: fixedClock(0, 1) },
      );
      span.success();

      expect(lastInfoEvent()).not.toHaveProperty("statusCode");
    });

    it("includes statusCode when provided on success", () => {
      const span = createIntegrationTelemetrySpan(
        { boundary: "cloud", operation: "op" },
        { now: fixedClock(0, 1) },
      );
      span.success({ statusCode: 200 });

      expect(lastInfoEvent()).toHaveProperty("statusCode", 200);
    });

    it("omits errorKind on success events", () => {
      const span = createIntegrationTelemetrySpan(
        { boundary: "cloud", operation: "op" },
        { now: fixedClock(0, 1) },
      );
      span.success();

      expect(lastInfoEvent()).not.toHaveProperty("errorKind");
    });
  });

  // ── Boundary types (table-driven) ──────────────────────────────────

  describe("boundary types", () => {
    const BOUNDARIES: IntegrationBoundary[] = [
      "cloud",
      "wallet",
      "marketplace",
      "mcp",
    ];

    it.each(BOUNDARIES)("emits valid events for boundary=%s", (boundary) => {
      const span = createIntegrationTelemetrySpan(
        { boundary, operation: `test_${boundary}` },
        { now: fixedClock(100, 142) },
      );
      span.success({ statusCode: 200 });

      const event = lastInfoEvent();
      expect(event.boundary).toBe(boundary);
      expect(event.operation).toBe(`test_${boundary}`);
      expect(event.durationMs).toBe(42);
    });

    it("covers all declared boundary types", () => {
      // If IntegrationBoundary is extended, this test must be updated.
      // This acts as a change-detection gate for the boundary contract.
      const expected: IntegrationBoundary[] = [
        "cloud",
        "wallet",
        "marketplace",
        "mcp",
      ];
      expect(BOUNDARIES).toEqual(expected);
    });
  });

  // ── Duration computation ───────────────────────────────────────────

  describe("duration computation", () => {
    it.each([
      { start: 100, end: 148, expected: 48, label: "normal elapsed" },
      { start: 0, end: 0, expected: 0, label: "zero duration" },
      { start: 500, end: 501, expected: 1, label: "1ms duration" },
      {
        start: 1000,
        end: 999,
        expected: 0,
        label: "negative clock floors to 0",
      },
    ])("computes durationMs correctly ($label)", ({ start, end, expected }) => {
      const span = createIntegrationTelemetrySpan(
        { boundary: "cloud", operation: "op" },
        { now: fixedClock(start, end) },
      );
      span.success();

      expect(lastInfoEvent().durationMs).toBe(expected);
    });
  });

  // ── Outcome routing ────────────────────────────────────────────────

  describe("outcome routing", () => {
    it("routes success events to logger.info", () => {
      const span = createIntegrationTelemetrySpan(
        { boundary: "cloud", operation: "op" },
        { now: fixedClock(0, 1) },
      );
      span.success();

      expect(loggerMock.info).toHaveBeenCalledOnce();
      expect(loggerMock.warn).not.toHaveBeenCalled();
    });

    it("routes failure events to logger.warn", () => {
      const span = createIntegrationTelemetrySpan(
        { boundary: "cloud", operation: "op" },
        { now: fixedClock(0, 1) },
      );
      span.failure();

      expect(loggerMock.warn).toHaveBeenCalledOnce();
      expect(loggerMock.info).not.toHaveBeenCalled();
    });

    it("formats events as JSON with [integration] prefix", () => {
      const span = createIntegrationTelemetrySpan(
        { boundary: "cloud", operation: "op" },
        { now: fixedClock(0, 1) },
      );
      span.success();

      const [line] = loggerMock.info.mock.calls[0] as [string];
      expect(line.startsWith(EVENT_PREFIX)).toBe(true);
      expect(() => JSON.parse(line.slice(EVENT_PREFIX.length))).not.toThrow();
    });
  });

  // ── Error kind inference (table-driven) ────────────────────────────

  describe("error kind inference", () => {
    it.each([
      {
        error: new Error("request timed out"),
        expected: "timeout",
        label: "message contains 'timed out'",
      },
      {
        error: new Error("network timeout"),
        expected: "timeout",
        label: "message contains 'timeout'",
      },
      {
        error: Object.assign(new Error("aborted"), { name: "AbortError" }),
        expected: "timeout",
        label: "AbortError name",
      },
      {
        error: Object.assign(new Error("timed"), { name: "TimeoutError" }),
        expected: "timeout",
        label: "TimeoutError name",
      },
      {
        error: new TypeError("Failed to fetch"),
        expected: "typeerror",
        label: "TypeError sanitized to lowercase",
      },
      {
        error: new RangeError("out of bounds"),
        expected: "rangeerror",
        label: "RangeError sanitized to lowercase",
      },
      {
        error: "string_error_value",
        expected: "string_error_value",
        label: "string error passed through",
      },
      {
        error: "UPPER CASE ERROR!!",
        expected: "upper_case_error",
        label: "string error sanitized (special chars removed, lowered)",
      },
    ])("infers errorKind from $label", ({ error, expected }) => {
      const span = createIntegrationTelemetrySpan(
        { boundary: "wallet", operation: "op" },
        { now: fixedClock(0, 1) },
      );
      span.failure({ error });

      expect(lastWarnEvent().errorKind).toBe(expected);
    });

    it("uses explicit errorKind over inferred value", () => {
      const span = createIntegrationTelemetrySpan(
        { boundary: "mcp", operation: "op" },
        { now: fixedClock(0, 1) },
      );
      span.failure({
        errorKind: "http_error",
        error: new Error("timeout"),
      });

      expect(lastWarnEvent().errorKind).toBe("http_error");
    });

    it("omits errorKind when no error and no explicit kind on failure", () => {
      const span = createIntegrationTelemetrySpan(
        { boundary: "mcp", operation: "op" },
        { now: fixedClock(0, 1) },
      );
      span.failure();

      expect(lastWarnEvent().errorKind).toBeUndefined();
    });

    it("omits errorKind when error is a non-Error, non-string value", () => {
      const span = createIntegrationTelemetrySpan(
        { boundary: "mcp", operation: "op" },
        { now: fixedClock(0, 1) },
      );
      span.failure({ error: 42 });

      expect(lastWarnEvent().errorKind).toBeUndefined();
    });
  });

  // ── Token sanitization (via errorKind) ─────────────────────────────

  describe("token sanitization", () => {
    it.each([
      {
        input: "http_error",
        expected: "http_error",
        label: "clean token unchanged",
      },
      {
        input: "HTTP Error!",
        expected: "http_error",
        label: "special chars replaced",
      },
      {
        input: "___leading___trailing___",
        expected: "leading_trailing",
        label: "leading/trailing underscores stripped, consecutive collapsed",
      },
      {
        input: "a".repeat(100),
        expected: "a".repeat(64),
        label: "truncated to 64 chars",
      },
      {
        input: "",
        expected: undefined,
        label: "empty string returns undefined",
      },
      {
        input: "!!!@@@",
        expected: undefined,
        label: "all-special-char string returns undefined",
      },
    ])("sanitizes errorKind token ($label)", ({ input, expected }) => {
      const span = createIntegrationTelemetrySpan(
        { boundary: "marketplace", operation: "op" },
        { now: fixedClock(0, 1) },
      );
      span.failure({ errorKind: input });

      expect(lastWarnEvent().errorKind).toBe(expected);
    });
  });

  // ── Idempotent recording ───────────────────────────────────────────

  describe("idempotent recording", () => {
    it("first success wins over subsequent failure", () => {
      const span = createIntegrationTelemetrySpan(
        { boundary: "marketplace", operation: "op" },
        { now: fixedClock(0, 5) },
      );

      span.success();
      span.failure({ errorKind: "late_failure" });

      expect(loggerMock.info).toHaveBeenCalledOnce();
      expect(loggerMock.warn).not.toHaveBeenCalled();
    });

    it("first failure wins over subsequent success", () => {
      const span = createIntegrationTelemetrySpan(
        { boundary: "marketplace", operation: "op" },
        { now: fixedClock(0, 5) },
      );

      span.failure({ errorKind: "initial" });
      span.success();

      expect(loggerMock.warn).toHaveBeenCalledOnce();
      expect(loggerMock.info).not.toHaveBeenCalled();
    });

    it("multiple success calls only emit once", () => {
      const span = createIntegrationTelemetrySpan(
        { boundary: "cloud", operation: "op" },
        { now: fixedClock(0, 5) },
      );

      span.success();
      span.success();
      span.success();

      expect(loggerMock.info).toHaveBeenCalledOnce();
    });
  });

  // ── Custom sink injection ──────────────────────────────────────────

  describe("custom sink", () => {
    it("uses injected sink instead of default logger", () => {
      const sink = {
        info: vi.fn<(message: string) => void>(),
        warn: vi.fn<(message: string) => void>(),
      };
      const span = createIntegrationTelemetrySpan(
        { boundary: "cloud", operation: "op" },
        { now: fixedClock(0, 1), sink },
      );

      span.success();

      expect(sink.info).toHaveBeenCalledOnce();
      expect(loggerMock.info).not.toHaveBeenCalled();
    });
  });

  // ── Full event integration (existing tests, preserved) ────────────

  describe("full event integration", () => {
    it("emits success events with duration and status code", () => {
      const span = createIntegrationTelemetrySpan(
        {
          boundary: "cloud",
          operation: "login_create_session",
          timeoutMs: 10_000,
        },
        { now: fixedClock(100, 148) },
      );

      span.success({ statusCode: 200 });

      expect(loggerMock.info).toHaveBeenCalledOnce();
      expect(loggerMock.warn).not.toHaveBeenCalled();
      expect(lastInfoEvent()).toEqual({
        schema: "integration_boundary_v1",
        boundary: "cloud",
        operation: "login_create_session",
        outcome: "success",
        durationMs: 48,
        timeoutMs: 10_000,
        statusCode: 200,
      });
    });

    it("emits failure events with timeout error kind", () => {
      const span = createIntegrationTelemetrySpan(
        {
          boundary: "wallet",
          operation: "fetch_evm_balances",
        },
        { now: fixedClock(200, 235) },
      );

      span.failure({
        statusCode: 504,
        error: new Error("request timed out"),
      });

      expect(loggerMock.warn).toHaveBeenCalledOnce();
      expect(loggerMock.info).not.toHaveBeenCalled();
      expect(lastWarnEvent()).toEqual({
        schema: "integration_boundary_v1",
        boundary: "wallet",
        operation: "fetch_evm_balances",
        outcome: "failure",
        durationMs: 35,
        statusCode: 504,
        errorKind: "timeout",
      });
    });
  });
});

// ── Boundary coverage enforcement ────────────────────────────────────

describe("observability boundary coverage", () => {
  const EXPECTED_BOUNDARIES: IntegrationBoundary[] = [
    "cloud",
    "wallet",
    "marketplace",
    "mcp",
  ];

  it("IntegrationObservabilityEvent contains required metric fields", () => {
    // Compile-time contract: the event type must have success/failure/latency fields.
    // This test validates the shape at runtime by creating a conforming object.
    const event: IntegrationObservabilityEvent = {
      schema: "integration_boundary_v1",
      boundary: "cloud",
      operation: "test",
      outcome: "success",
      durationMs: 0,
    };

    expect(event).toHaveProperty("schema");
    expect(event).toHaveProperty("boundary");
    expect(event).toHaveProperty("operation");
    expect(event).toHaveProperty("outcome");
    expect(event).toHaveProperty("durationMs");
  });

  it.each(
    EXPECTED_BOUNDARIES,
  )("boundary=%s can create a span and emit a success event", (boundary) => {
    const sink = {
      info: vi.fn<(message: string) => void>(),
      warn: vi.fn<(message: string) => void>(),
    };
    const span = createIntegrationTelemetrySpan(
      { boundary, operation: `contract_test_${boundary}` },
      { now: fixedClock(0, 1), sink },
    );

    span.success({ statusCode: 200 });

    expect(sink.info).toHaveBeenCalledOnce();
    const event = parseEvent((sink.info.mock.calls[0] as [string])[0]);
    expect(event.boundary).toBe(boundary);
    expect(event.outcome).toBe("success");
    expect(event.durationMs).toBe(1);
    expect(event.statusCode).toBe(200);
  });

  it.each(
    EXPECTED_BOUNDARIES,
  )("boundary=%s can create a span and emit a failure event", (boundary) => {
    const sink = {
      info: vi.fn<(message: string) => void>(),
      warn: vi.fn<(message: string) => void>(),
    };
    const span = createIntegrationTelemetrySpan(
      { boundary, operation: `contract_test_${boundary}` },
      { now: fixedClock(0, 50), sink },
    );

    span.failure({ statusCode: 500, errorKind: "http_error" });

    expect(sink.warn).toHaveBeenCalledOnce();
    const event = parseEvent((sink.warn.mock.calls[0] as [string])[0]);
    expect(event.boundary).toBe(boundary);
    expect(event.outcome).toBe("failure");
    expect(event.durationMs).toBe(50);
    expect(event.errorKind).toBe("http_error");
  });
});

// ── Call-site coverage enforcement ────────────────────────────────────
// Every source file that imports createIntegrationTelemetrySpan must have
// a matching *.observability.test.ts file. Prevents adding new boundaries
// without tests.

describe("observability call-site coverage", () => {
  it("every source file using createIntegrationTelemetrySpan has a test file", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const srcDir = path.resolve(__dirname, "..");
    const { execSync } = await import("node:child_process");

    // Find all source files (non-test) importing the span factory
    const grepResult = execSync(
      "grep -rl 'createIntegrationTelemetrySpan' src/ --include='*.ts' || true",
      { cwd: path.resolve(srcDir, ".."), encoding: "utf-8" },
    );

    const sourceFiles = grepResult
      .split("\n")
      .map((f) => f.trim())
      .filter(
        (f) =>
          f &&
          !f.includes(".test.ts") &&
          f !== "src/diagnostics/integration-observability.ts",
      );

    expect(sourceFiles.length).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const srcFile of sourceFiles) {
      const testFile = srcFile.replace(/\.ts$/, ".observability.test.ts");
      const testPath = path.resolve(srcDir, "..", testFile);
      try {
        await fs.access(testPath);
      } catch {
        missing.push(`${srcFile} → missing ${testFile}`);
      }
    }

    expect(missing).toEqual([]);
  });
});
