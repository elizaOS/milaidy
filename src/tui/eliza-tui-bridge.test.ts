import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { ElizaTUIBridge } from "./eliza-tui-bridge";
import type { MiladyTUI } from "./tui-app";

interface BridgeTestAccess {
  conversationId: string | null;
  handleApiWsMessage(data: Record<string, unknown>): void;
}

describe("ElizaTUIBridge proactive websocket routing", () => {
  it("renders proactive messages only for the active conversation", () => {
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
});
