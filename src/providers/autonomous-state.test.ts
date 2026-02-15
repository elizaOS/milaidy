import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetAutonomousStateTrackingForTests,
  createAutonomousStateProvider,
  ensureAutonomousStateTracking,
} from "./autonomous-state.js";

type AgentEventPayloadLike = {
  runId: string;
  seq: number;
  stream: string;
  ts: number;
  data: Record<string, unknown>;
  agentId?: string;
};

type HeartbeatEventPayloadLike = {
  ts: number;
  status: string;
  to?: string;
  preview?: string;
};

class FakeAgentEventService {
  private eventListeners = new Set<(event: AgentEventPayloadLike) => void>();
  private heartbeatListeners = new Set<
    (event: HeartbeatEventPayloadLike) => void
  >();
  private lastHeartbeat: HeartbeatEventPayloadLike | null = null;

  subscribe(listener: (event: AgentEventPayloadLike) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  subscribeHeartbeat(
    listener: (event: HeartbeatEventPayloadLike) => void,
  ): () => void {
    this.heartbeatListeners.add(listener);
    return () => this.heartbeatListeners.delete(listener);
  }

  getLastHeartbeat(): HeartbeatEventPayloadLike | null {
    return this.lastHeartbeat;
  }

  emitEvent(event: AgentEventPayloadLike): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  emitHeartbeat(event: HeartbeatEventPayloadLike): void {
    this.lastHeartbeat = event;
    for (const listener of this.heartbeatListeners) {
      listener(event);
    }
  }
}

function createRuntime(
  service: FakeAgentEventService,
  agentId: string,
): IAgentRuntime {
  const runtimeSubset: Pick<IAgentRuntime, "agentId" | "getService"> = {
    agentId,
    getService: (serviceType: string) => {
      if (serviceType === "AGENT_EVENT") {
        return service as never;
      }
      return null;
    },
  };
  return runtimeSubset as IAgentRuntime;
}

describe("autonomous-state provider", () => {
  const provider = createAutonomousStateProvider();
  const message = { roomId: "room-1", entityId: "user-1" } as Memory;
  const state = {} as State;

  beforeEach(() => {
    __resetAutonomousStateTrackingForTests();
  });

  afterEach(() => {
    __resetAutonomousStateTrackingForTests();
  });

  it("captures and renders assistant/action events from the live event stream", async () => {
    const service = new FakeAgentEventService();
    const runtime = createRuntime(service, "agent-1");
    ensureAutonomousStateTracking(runtime);

    service.emitEvent({
      runId: "run-1",
      seq: 1,
      stream: "assistant",
      ts: Date.now(),
      agentId: "agent-1",
      data: { text: "thinking through options" },
    });
    service.emitEvent({
      runId: "run-1",
      seq: 2,
      stream: "action",
      ts: Date.now(),
      agentId: "agent-1",
      data: { text: "calling SEND_MESSAGE" },
    });

    const result = await provider.get(runtime, message, state);
    const text = result.text ?? "";
    expect(text).toContain("[assistant]");
    expect(text).toContain("[action]");
    const values = result.values as Record<string, string | number | boolean>;
    expect(values.hasAutonomousState).toBe(true);
  });

  it("includes heartbeat status in snapshot text", async () => {
    const service = new FakeAgentEventService();
    const runtime = createRuntime(service, "agent-2");
    ensureAutonomousStateTracking(runtime);

    service.emitHeartbeat({
      ts: Date.now(),
      status: "ok-token",
      preview: "agent alive",
      to: "admin",
    });

    const result = await provider.get(runtime, message, state);
    const text = result.text ?? "";
    expect(text).toContain("[heartbeat/ok-token]");
    expect(text).toContain("agent alive");
  });

  it("ignores events emitted for other agents", async () => {
    const service = new FakeAgentEventService();
    const runtime = createRuntime(service, "agent-3");
    ensureAutonomousStateTracking(runtime);

    service.emitEvent({
      runId: "run-x",
      seq: 1,
      stream: "assistant",
      ts: Date.now(),
      agentId: "other-agent",
      data: { text: "this should be ignored" },
    });

    const result = await provider.get(runtime, message, state);
    const text = result.text ?? "";
    expect(text).not.toContain("this should be ignored");
  });
});
