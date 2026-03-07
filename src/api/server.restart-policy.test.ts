import { describe, expect, it } from "vitest";
import { shouldDeferAutoRestart } from "./server";

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
