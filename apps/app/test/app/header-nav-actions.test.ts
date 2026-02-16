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

import { Header } from "../../src/components/Header";

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
    (node) => node.type === "button" && nodeText(node) === label,
  );
  expect(matches.length).toBeGreaterThan(0);
  return matches[0];
}

describe("Header quick actions", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue({
      agentStatus: {
        state: "running",
        agentName: "Milaidy",
        model: undefined,
        startedAt: undefined,
        uptime: undefined,
      },
      cloudEnabled: false,
      cloudConnected: false,
      cloudCredits: null,
      cloudCreditsCritical: false,
      cloudCreditsLow: false,
      cloudTopUpUrl: "",
      walletAddresses: null,
      lifecycleBusy: false,
      lifecycleAction: null,
      handlePauseResume: vi.fn(),
      handleRestart: vi.fn(),
      openCommandPalette: vi.fn(),
      copyToClipboard: vi.fn(),
      setTab: vi.fn(),
      dropStatus: null,
      loadDropStatus: vi.fn().mockResolvedValue(undefined),
      registryStatus: null,
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

  it("dispatches note/editor action events from top bar buttons", async () => {
    const dispatchSpy = vi.mocked(window.dispatchEvent);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Header));
    });

    await act(async () => {
      const notesButton = findButtonByLabel(tree!.root, "Notes");
      await notesButton.props.onClick();
    });

    await act(async () => {
      const splitNotesButton = findButtonByLabel(tree!.root, "Split Notes");
      await splitNotesButton.props.onClick();
    });

    await act(async () => {
      const previewNotesButton = findButtonByLabel(tree!.root, "Preview Notes");
      await previewNotesButton.props.onClick();
    });

    await act(async () => {
      const customActionsButton = findButtonByLabel(tree!.root, "Actions");
      await customActionsButton.props.onClick();
    });

    const calls = dispatchSpy.mock.calls.map((call) => call[0]);
    expect(
      calls.some(
        (evt) =>
          evt.type === "milaidy:open-notes-panel" &&
          (evt as CustomEvent<{ mode?: string }>).detail?.mode === "edit",
      ),
    ).toBe(true);
    expect(
      calls.some(
        (evt) =>
          evt.type === "milaidy:open-notes-panel" &&
          (evt as CustomEvent<{ mode?: string }>).detail?.mode === "split",
      ),
    ).toBe(true);
    expect(
      calls.some(
        (evt) =>
          evt.type === "milaidy:open-notes-panel" &&
          (evt as CustomEvent<{ mode?: string }>).detail?.mode === "view",
      ),
    ).toBe(true);
    expect(
      calls.some((evt) => evt.type === "toggle-custom-actions-panel"),
    ).toBe(true);
  });
});
