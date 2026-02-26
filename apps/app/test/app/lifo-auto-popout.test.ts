/** @vitest-environment jsdom */
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { wsHandlers, mockClient } = vi.hoisted(() => {
  const handlers = new Map<string, (data: Record<string, unknown>) => void>();
  return {
    wsHandlers: handlers,
    mockClient: {
      connectWs: vi.fn(),
      onWsEvent: vi.fn(
        (type: string, handler: (data: Record<string, unknown>) => void) => {
          handlers.set(type, handler);
          return () => {
            handlers.delete(type);
          };
        },
      ),
    },
  };
});

vi.mock("../../src/api-client", () => ({
  client: mockClient,
}));

import {
  shouldAutoOpenForAutonomyEvent,
  shouldAutoOpenForTerminalCommand,
  useLifoAutoPopout,
} from "../../src/hooks/useLifoAutoPopout";

function Probe(props: {
  onPopupBlocked?: () => void;
  enabled?: boolean;
  targetPath?: string;
}) {
  useLifoAutoPopout({
    enabled: props.enabled,
    targetPath: props.targetPath ?? "/lifo",
    onPopupBlocked: props.onPopupBlocked,
  });
  return null;
}

function emit(type: string, payload: Record<string, unknown>): void {
  const handler = wsHandlers.get(type);
  if (handler) {
    handler(payload);
  }
}

describe("useLifoAutoPopout", () => {
  beforeEach(() => {
    wsHandlers.clear();
    mockClient.connectWs.mockClear();
    mockClient.onWsEvent.mockClear();
    window.history.pushState({}, "", "/chat");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens once per run and focuses existing popout for subsequent runs", async () => {
    const focusSpy = vi.fn();
    const popupWindow = { closed: false, focus: focusSpy } as unknown as Window;
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue(popupWindow as Window | null);

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Probe));
    });

    expect(mockClient.connectWs).toHaveBeenCalledTimes(1);

    await act(async () => {
      emit("agent_event", {
        type: "agent_event",
        eventId: "evt-1",
        runId: "run-1",
        stream: "tool",
        payload: { text: "COMPUTERUSE_CLICK submit button" },
      });
    });

    expect(openSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      emit("agent_event", {
        type: "agent_event",
        eventId: "evt-2",
        runId: "run-1",
        stream: "tool",
        payload: { text: "COMPUTERUSE_TYPE credentials" },
      });
    });

    expect(openSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      emit("agent_event", {
        type: "agent_event",
        eventId: "evt-3",
        runId: "run-2",
        stream: "tool",
        payload: { text: "playwright browser task" },
      });
    });

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });

  it("invokes popup-blocked callback for matching terminal command", async () => {
    const onPopupBlocked = vi.fn();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(Probe, { onPopupBlocked }),
      );
    });

    await act(async () => {
      emit("terminal-output", {
        type: "terminal-output",
        event: "start",
        runId: "run-terminal-1",
        command: "playwright open https://example.com",
      });
    });

    await act(async () => {
      emit("terminal-output", {
        type: "terminal-output",
        event: "start",
        runId: "run-terminal-1",
        command: "playwright click .start",
      });
    });

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(onPopupBlocked).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.unmount();
    });
  });
});

describe("lifo auto-popout classifiers", () => {
  it("matches autonomy payloads with computer-use/browser markers", () => {
    expect(
      shouldAutoOpenForAutonomyEvent({
        type: "agent_event",
        stream: "tool",
        payload: { text: "COMPUTERUSE_OPEN_APPLICATION Safari" },
      }),
    ).toBe(true);

    expect(
      shouldAutoOpenForAutonomyEvent({
        type: "agent_event",
        stream: "assistant",
        payload: { text: "general chat response" },
      }),
    ).toBe(false);
  });

  it("matches terminal commands with lifo/browser markers", () => {
    expect(shouldAutoOpenForTerminalCommand("lifo run task --browser")).toBe(
      true,
    );
    expect(shouldAutoOpenForTerminalCommand("echo hello")).toBe(false);
  });
});
