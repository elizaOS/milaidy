import type { AgentRuntime } from "@elizaos/core";
import { ModelType } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { handleSwarmSynthesis } from "./server";

function makePayload(
  overrides?: Partial<Parameters<typeof handleSwarmSynthesis>[1]>,
) {
  return {
    tasks: [
      {
        sessionId: "s1",
        label: "Agent 1",
        agentType: "claude",
        originalTask: "Fix the bug",
        status: "completed",
        completionSummary: "Bug fixed in main.ts",
      },
    ],
    total: 1,
    completed: 1,
    stopped: 0,
    errored: 0,
    ...overrides,
  };
}

describe("handleSwarmSynthesis", () => {
  it("routes LLM synthesis to user on success", async () => {
    const useModel = vi
      .fn()
      .mockResolvedValue("All tasks completed successfully!");
    const st = { runtime: { useModel } as unknown as AgentRuntime };
    const routeMessage = vi.fn();

    await handleSwarmSynthesis(st, makePayload(), routeMessage);

    expect(useModel).toHaveBeenCalledWith(ModelType.TEXT_SMALL, {
      prompt: expect.stringContaining("coding agent swarm"),
      maxTokens: 2048,
      temperature: 0.7,
    });
    expect(routeMessage).toHaveBeenCalledWith(
      "All tasks completed successfully!",
      "swarm_synthesis",
    );
  });

  it("does not route when LLM returns empty string", async () => {
    const useModel = vi.fn().mockResolvedValue("   ");
    const st = { runtime: { useModel } as unknown as AgentRuntime };
    const routeMessage = vi.fn();

    await handleSwarmSynthesis(st, makePayload(), routeMessage);

    expect(useModel).toHaveBeenCalled();
    expect(routeMessage).not.toHaveBeenCalled();
  });

  it("falls back to generic message when LLM throws", async () => {
    const useModel = vi.fn().mockRejectedValue(new Error("LLM unavailable"));
    const st = { runtime: { useModel } as unknown as AgentRuntime };
    const routeMessage = vi.fn();

    const payload = makePayload({
      completed: 2,
      stopped: 1,
      errored: 0,
      total: 3,
    });
    await handleSwarmSynthesis(st, payload, routeMessage);

    expect(routeMessage).toHaveBeenCalledWith(
      "All 3 coding agents finished (2 completed, 1 stopped). Review their work when you're ready.",
      "coding-agent",
    );
  });

  it("skips synthesis when runtime is null", async () => {
    const routeMessage = vi.fn();

    await handleSwarmSynthesis({ runtime: null }, makePayload(), routeMessage);

    expect(routeMessage).not.toHaveBeenCalled();
  });
});
