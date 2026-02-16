import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

const { dispatchBus } = vi.hoisted(() => ({
  dispatchBus: new EventTarget(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

import { CommandPalette } from "../../src/components/CommandPalette";

function nodeText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : nodeText(child as TestRenderer.ReactTestInstance)))
    .join("");
}

function findButtonByLabel(
  root: TestRenderer.ReactTestInstance,
  label: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) => node.type === "button" && nodeText(node).startsWith(label),
  );
  expect(matches.length).toBeGreaterThan(0);
  return matches[0];
}

describe("CommandPalette", () => {
  const baseState = {
    commandPaletteOpen: true,
    commandQuery: "",
    commandActiveIndex: 0,
    agentStatus: { state: "running", agentName: "Milaidy", model: undefined, startedAt: undefined, uptime: undefined },
    handleStart: vi.fn(),
    handleStop: vi.fn(),
    handlePauseResume: vi.fn(),
    handleRestart: vi.fn(),
    setTab: vi.fn(),
    loadPlugins: vi.fn(),
    loadSkills: vi.fn(),
    loadLogs: vi.fn(),
    loadWorkbench: vi.fn(),
    handleChatClear: vi.fn(),
    activeGameViewerUrl: "",
    setState: vi.fn(),
    closeCommandPalette: vi.fn(),
  };

  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue({
      ...baseState,
      handleStart: vi.fn(),
      handleStop: vi.fn(),
      handlePauseResume: vi.fn(),
      handleRestart: vi.fn(),
      setTab: vi.fn(),
      loadPlugins: vi.fn(),
      loadSkills: vi.fn(),
      loadLogs: vi.fn(),
      loadWorkbench: vi.fn(),
      handleChatClear: vi.fn(),
      setState: vi.fn(),
      closeCommandPalette: vi.fn(),
    });
    Object.defineProperty(window, "dispatchEvent", {
      configurable: true,
      writable: true,
      value: vi.fn((event: Event) => dispatchBus.dispatchEvent(event)),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches notes/custom-actions commands with expected event payloads", async () => {
    const dispatchSpy = vi.mocked(window.dispatchEvent);
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(CommandPalette));
    });

    await act(async () => {
      const editButton = findButtonByLabel(tree!.root, "Open Notes (Edit)");
      await editButton.props.onClick();
    });

    await act(async () => {
      const viewButton = findButtonByLabel(tree!.root, "Open Notes (View)");
      await viewButton.props.onClick();
    });

    await act(async () => {
      const splitButton = findButtonByLabel(tree!.root, "Open Notes (Split View)");
      await splitButton.props.onClick();
    });

    await act(async () => {
      const customActionsButton = findButtonByLabel(tree!.root, "Open Custom Actions");
      await customActionsButton.props.onClick();
    });

    const events = dispatchSpy.mock.calls.map((call) => call[0]);
    expect(
      events.some(
        (evt) =>
          evt.type === "milaidy:open-notes-panel" &&
          (evt as CustomEvent<{ mode?: string }>).detail?.mode === "edit",
      ),
    ).toBe(true);
    expect(
      events.some(
        (evt) =>
          evt.type === "milaidy:open-notes-panel" &&
          (evt as CustomEvent<{ mode?: string }>).detail?.mode === "view",
      ),
    ).toBe(true);
    expect(
      events.some(
        (evt) =>
          evt.type === "milaidy:app-command" &&
          (evt as CustomEvent<{ command?: string }>).detail?.command ===
            "open-notes-split",
      ),
    ).toBe(true);
    expect(
      events.some(
        (evt) =>
          evt.type === "milaidy:app-command" &&
          (evt as CustomEvent<{ command?: string }>).detail?.command ===
            "open-custom-actions-panel",
      ),
    ).toBe(true);
  });
});
