import type { AgentRuntime, UUID } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { type ConversationMeta, routeAutonomyTextToUser } from "./server";

function makeState(overrides?: {
  runtime?: Partial<AgentRuntime> | null;
  conversations?: Map<string, ConversationMeta>;
  activeConversationId?: string;
  broadcastWs?: (data: Record<string, unknown>) => void;
}) {
  const conv: ConversationMeta = {
    id: "conv-1",
    title: "Test Chat",
    roomId: "00000000-0000-0000-0000-000000000001" as UUID,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const conversations = overrides?.conversations ?? new Map([["conv-1", conv]]);

  return {
    runtime: (overrides?.runtime === null
      ? null
      : {
          agentId: "00000000-0000-0000-0000-aaaaaaaaaaaa" as UUID,
          createMemory: vi.fn().mockResolvedValue(undefined),
          ...overrides?.runtime,
        }) as AgentRuntime | null,
    conversations,
    activeConversationId: overrides?.activeConversationId ?? "conv-1",
    broadcastWs: overrides?.broadcastWs ?? vi.fn(),
  } as Parameters<typeof routeAutonomyTextToUser>[0];
}

describe("routeAutonomyTextToUser — ephemeral source filtering", () => {
  it("persists a normal message to memory", async () => {
    const state = makeState();
    await routeAutonomyTextToUser(state, "hello from autonomy", "autonomy");

    expect(state.runtime?.createMemory).toHaveBeenCalledTimes(1);
    expect(state.broadcastWs).toHaveBeenCalledTimes(1);
  });

  it("does NOT persist coding-agent messages but still broadcasts", async () => {
    const state = makeState();
    await routeAutonomyTextToUser(state, "Finished task X", "coding-agent");

    expect(state.runtime?.createMemory).not.toHaveBeenCalled();
    expect(state.broadcastWs).toHaveBeenCalledTimes(1);
    expect(state.broadcastWs).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "proactive-message",
        message: expect.objectContaining({ source: "coding-agent" }),
      }),
    );
  });

  it("does NOT persist coordinator messages but still broadcasts", async () => {
    const state = makeState();
    await routeAutonomyTextToUser(state, "Decision made", "coordinator");

    expect(state.runtime?.createMemory).not.toHaveBeenCalled();
    expect(state.broadcastWs).toHaveBeenCalledTimes(1);
  });

  it("does NOT persist action messages but still broadcasts", async () => {
    const state = makeState();
    await routeAutonomyTextToUser(state, "Generated reply", "action");

    expect(state.runtime?.createMemory).not.toHaveBeenCalled();
    expect(state.broadcastWs).toHaveBeenCalledTimes(1);
  });

  it("persists client_chat messages", async () => {
    const state = makeState();
    await routeAutonomyTextToUser(state, "user said hi", "client_chat");

    expect(state.runtime?.createMemory).toHaveBeenCalledTimes(1);
  });

  it("persists messages with no explicit source (defaults to autonomy)", async () => {
    const state = makeState();
    await routeAutonomyTextToUser(state, "autonomous thought");

    expect(state.runtime?.createMemory).toHaveBeenCalledTimes(1);
  });

  it("skips everything when runtime is null", async () => {
    const broadcastWs = vi.fn();
    const state = makeState({ runtime: null, broadcastWs });
    await routeAutonomyTextToUser(state, "hello", "coding-agent");

    expect(broadcastWs).not.toHaveBeenCalled();
  });

  it("skips everything when text is empty", async () => {
    const state = makeState();
    await routeAutonomyTextToUser(state, "   ", "autonomy");

    expect(state.runtime?.createMemory).not.toHaveBeenCalled();
    expect(state.broadcastWs).not.toHaveBeenCalled();
  });
});
