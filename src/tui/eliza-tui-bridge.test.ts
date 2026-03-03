import type { AgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElizaTUIBridge } from "./eliza-tui-bridge";
import type { MiladyTUI } from "./tui-app";

interface BridgeTestAccess {
  conversationId: string | null;
  streamedText: string;
  apiWsClient: { close(): void } | null;
  pendingRender: NodeJS.Timeout | null;
  ensureAssistantComponent(): void;
  finalizeAssistantForTurn(): void;
  updateAssistantFromText(): void;
  handleApiWsMessage(data: Record<string, unknown>): void;
  dispose(): void;
}

function createBridgeHarness() {
  const addedComponents: Array<{ render: (width: number) => string[] }> = [];
  const requestRender = vi.fn();

  const runtime = {
    agentId: "agent-1",
    character: { name: "Milady" },
  } as unknown as AgentRuntime;

  const tui = {
    addToChatContainer: (component: {
      render: (width: number) => string[];
    }) => {
      addedComponents.push(component);
    },
    requestRender,
  } as unknown as MiladyTUI;

  const bridge = new ElizaTUIBridge(runtime, tui, {
    apiBaseUrl: "http://localhost:3137",
  });

  return { bridge, addedComponents, requestRender };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ElizaTUIBridge proactive websocket routing", () => {
  it("renders proactive messages only for the active conversation", () => {
    const { bridge, addedComponents, requestRender } = createBridgeHarness();

    const access = bridge as unknown as BridgeTestAccess;
    access.conversationId = "conv-active";

    access.handleApiWsMessage({
      type: "proactive-message",
      conversationId: "conv-other",
      message: { id: "msg-1", text: "ignore me" },
    });

    expect(addedComponents).toHaveLength(0);

    access.handleApiWsMessage({
      type: "proactive-message",
      conversationId: "conv-active",
      message: { id: "msg-2", text: "hello from autonomy" },
    });

    expect(addedComponents).toHaveLength(1);
    expect(requestRender).toHaveBeenCalledTimes(1);

    const rendered = addedComponents[0].render(80).join("\n");
    expect(rendered).toContain("hello from autonomy");
  });

  it("does not suppress proactive messages from stale streamed text", () => {
    const { bridge, addedComponents, requestRender } = createBridgeHarness();

    const access = bridge as unknown as BridgeTestAccess;
    access.conversationId = "conv-active";
    access.streamedText = "repeatable status update";

    access.handleApiWsMessage({
      type: "proactive-message",
      conversationId: "conv-active",
      message: { id: "msg-3", text: "repeatable status update" },
    });

    expect(addedComponents).toHaveLength(1);
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it("clears pending render timer when finalizing an assistant turn", () => {
    vi.useFakeTimers();

    const { bridge } = createBridgeHarness();
    const access = bridge as unknown as BridgeTestAccess;

    access.streamedText = "final reply";
    access.ensureAssistantComponent();
    access.pendingRender = setTimeout(() => {}, 10_000);

    access.finalizeAssistantForTurn();

    expect(access.pendingRender).toBeNull();
  });

  it("allows final text updates after assistant finalize", () => {
    const { bridge, addedComponents } = createBridgeHarness();
    const access = bridge as unknown as BridgeTestAccess;

    access.streamedText = "stream chunk";
    access.ensureAssistantComponent();
    access.finalizeAssistantForTurn();

    access.streamedText = "final parsed text";
    access.updateAssistantFromText();

    const rendered = addedComponents[0]?.render(80).join("\n") ?? "";
    expect(rendered).toContain("final parsed text");
  });

  it("disposes websocket client and pending render timers idempotently", () => {
    vi.useFakeTimers();

    const { bridge } = createBridgeHarness();
    const close = vi.fn();

    const access = bridge as unknown as BridgeTestAccess;
    access.apiWsClient = { close };
    access.pendingRender = setTimeout(() => {}, 10_000);

    access.dispose();
    expect(close).toHaveBeenCalledTimes(1);
    expect(access.apiWsClient).toBeNull();
    expect(access.pendingRender).toBeNull();

    access.dispose();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("ignores proactive websocket events after dispose", () => {
    const { bridge, addedComponents, requestRender } = createBridgeHarness();

    const access = bridge as unknown as BridgeTestAccess;
    access.conversationId = "conv-active";
    access.dispose();

    access.handleApiWsMessage({
      type: "proactive-message",
      conversationId: "conv-active",
      message: { id: "msg-4", text: "should not render" },
    });

    expect(addedComponents).toHaveLength(0);
    expect(requestRender).not.toHaveBeenCalled();
  });
});
