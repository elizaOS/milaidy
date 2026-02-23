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

import { createIntegrationTelemetrySpan } from "./integration-observability";

const EVENT_PREFIX = "[integration] ";

function parseEvent(line: string) {
  return JSON.parse(line.slice(EVENT_PREFIX.length)) as Record<string, unknown>;
}

describe("createIntegrationTelemetrySpan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits success events with duration and status code", () => {
    const now = vi
      .fn(() => 100)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(148);
    const span = createIntegrationTelemetrySpan(
      {
        boundary: "cloud",
        operation: "login_create_session",
        timeoutMs: 10_000,
      },
      { now },
    );

    span.success({ statusCode: 200 });

    expect(loggerMock.info).toHaveBeenCalledOnce();
    expect(loggerMock.warn).not.toHaveBeenCalled();
    const [line] = loggerMock.info.mock.calls[0] as [string];
    expect(line.startsWith(EVENT_PREFIX)).toBe(true);
    expect(parseEvent(line)).toEqual({
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
    const now = vi
      .fn(() => 200)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(235);
    const span = createIntegrationTelemetrySpan(
      {
        boundary: "wallet",
        operation: "fetch_evm_balances",
      },
      { now },
    );

    span.failure({
      statusCode: 504,
      error: new Error("request timed out"),
    });

    expect(loggerMock.warn).toHaveBeenCalledOnce();
    expect(loggerMock.info).not.toHaveBeenCalled();
    const [line] = loggerMock.warn.mock.calls[0] as [string];
    expect(line.startsWith(EVENT_PREFIX)).toBe(true);
    expect(parseEvent(line)).toEqual({
      schema: "integration_boundary_v1",
      boundary: "wallet",
      operation: "fetch_evm_balances",
      outcome: "failure",
      durationMs: 35,
      statusCode: 504,
      errorKind: "timeout",
    });
  });

  it("records only once even if called multiple times", () => {
    const now = vi
      .fn(() => 0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(5);
    const span = createIntegrationTelemetrySpan(
      {
        boundary: "marketplace",
        operation: "search_skills_marketplace",
      },
      { now },
    );

    span.success();
    span.failure({ errorKind: "late_failure" });

    expect(loggerMock.info).toHaveBeenCalledOnce();
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });
});
