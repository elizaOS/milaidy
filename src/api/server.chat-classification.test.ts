import { describe, expect, it } from "vitest";
import { classifyChatError, evaluateRuntimeReadiness } from "./server";

describe("classifyChatError", () => {
  it("treats bounded 401/403 provider errors as auth failures", () => {
    expect(
      classifyChatError(new Error("Provider returned status: 401")),
    ).toMatchObject({
      code: "PROVIDER_AUTH",
      status: 401,
    });

    expect(
      classifyChatError(new Error("request failed with http 403")),
    ).toMatchObject({
      code: "PROVIDER_AUTH",
      status: 401,
    });
  });

  it("does not treat unrelated numeric substrings as auth failures", () => {
    expect(
      classifyChatError(new Error("error code 14012 while parsing response")),
    ).toMatchObject({
      code: "CHAT_REQUEST_FAILED",
      status: 500,
    });

    expect(
      classifyChatError(new Error("provider returned http 40312")),
    ).toMatchObject({
      code: "CHAT_REQUEST_FAILED",
      status: 500,
    });
  });
});

describe("evaluateRuntimeReadiness", () => {
  it("reports ready when runtime is attached and startup is running", () => {
    expect(
      evaluateRuntimeReadiness({
        runtime: {} as never,
        agentState: "running",
        startup: { phase: "running", attempt: 0 },
        pendingRestartReasons: [],
      }),
    ).toEqual({
      ready: true,
      code: "ready",
      message: "Runtime is ready.",
    });
  });

  it("reports pending restart before other ready states", () => {
    expect(
      evaluateRuntimeReadiness({
        runtime: {} as never,
        agentState: "running",
        startup: { phase: "running", attempt: 0 },
        pendingRestartReasons: ["config updated"],
      }),
    ).toEqual({
      ready: false,
      code: "pending_restart",
      message: "Runtime restart pending: config updated",
    });
  });

  it("reports runtime errors with startup context", () => {
    expect(
      evaluateRuntimeReadiness({
        runtime: null,
        agentState: "error",
        startup: {
          phase: "runtime-error",
          attempt: 2,
          lastError: "listen EADDRINUSE: address already in use 127.0.0.1:3000",
        },
        pendingRestartReasons: [],
      }),
    ).toMatchObject({
      ready: false,
      code: "runtime_error",
    });
  });

  it("reports startup and stopped states distinctly", () => {
    expect(
      evaluateRuntimeReadiness({
        runtime: null,
        agentState: "starting",
        startup: { phase: "runtime-bootstrap", attempt: 1 },
        pendingRestartReasons: [],
      }),
    ).toEqual({
      ready: false,
      code: "runtime_starting",
      message: "Runtime is still starting.",
    });

    expect(
      evaluateRuntimeReadiness({
        runtime: null,
        agentState: "stopped",
        startup: { phase: "idle", attempt: 0 },
        pendingRestartReasons: [],
      }),
    ).toEqual({
      ready: false,
      code: "runtime_not_running",
      message: "Runtime is not running.",
    });
  });
});
