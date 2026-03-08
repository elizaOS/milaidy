import { describe, expect, it } from "vitest";
import { resolveChatRateKey, shouldDeferAutoRestart } from "./server";

describe("shouldDeferAutoRestart", () => {
  it("defers when runtime is missing and agent state is starting", () => {
    expect(
      shouldDeferAutoRestart({
        runtime: null,
        agentState: "starting",
        startup: { phase: "runtime-bootstrap", attempt: 1 },
      }),
    ).toBe(true);
  });

  it("defers when runtime is missing and startup is in retry/error phases", () => {
    expect(
      shouldDeferAutoRestart({
        runtime: null,
        agentState: "stopped",
        startup: { phase: "runtime-retry", attempt: 3 },
      }),
    ).toBe(true);

    expect(
      shouldDeferAutoRestart({
        runtime: null,
        agentState: "stopped",
        startup: { phase: "runtime-error", attempt: 3 },
      }),
    ).toBe(true);
  });

  it("does not defer once a runtime is attached", () => {
    expect(
      shouldDeferAutoRestart({
        runtime: {} as never,
        agentState: "running",
        startup: { phase: "running", attempt: 0 },
      }),
    ).toBe(false);
  });
});

describe("resolveChatRateKey", () => {
  it("hashes bearer tokens instead of using a suffix bucket", () => {
    const token = "prefix-abcdef1234567890-sharedsuffix";

    expect(
      resolveChatRateKey({
        headers: { authorization: `Bearer ${token}` },
        socket: { remoteAddress: "203.0.113.5" },
      } as never),
    ).toMatch(/^token:[0-9a-f]{24}$/);
  });

  it("keeps distinct buckets for tokens with the same suffix", () => {
    const keyA = resolveChatRateKey({
      headers: { authorization: "Bearer alpha-000000-sharedsuffix" },
      socket: { remoteAddress: "203.0.113.5" },
    } as never);
    const keyB = resolveChatRateKey({
      headers: { authorization: "Bearer beta-111111-sharedsuffix" },
      socket: { remoteAddress: "203.0.113.5" },
    } as never);

    expect(keyA).not.toBe(keyB);
  });
});
