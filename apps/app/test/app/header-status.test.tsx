import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

import { Header } from "../../src/components/Header";

let baseAppState: Record<string, unknown>;

describe("header status", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    baseAppState = {
      agentStatus: {
        state: "running",
        agentName: "Milady",
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
    };
    mockUseApp.mockReturnValue(baseAppState);
  });

  it("renders starting state with loading indicator", async () => {
    mockUseApp.mockReturnValue({
      ...baseAppState,
      agentStatus: {
        state: "starting",
        agentName: "Milady",
        model: undefined,
        startedAt: undefined,
        uptime: undefined,
      },
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Header));
    });

    const renderedText = tree?.root
      .findAllByType("span")
      .map((node) => node.children.join(""))
      .join("\n");

    expect(renderedText).toContain("starting");
    expect(renderedText).toContain("⏳");
    expect(renderedText).not.toContain("⏸️");
  });

  it("shows restart in-progress label and disables controls during lifecycle action", async () => {
    mockUseApp.mockReturnValue({
      ...baseAppState,
      lifecycleBusy: true,
      lifecycleAction: "restart",
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Header));
    });

    const restartButton = tree?.root.find(
      (node) => node.type === "button" && node.props.title === "Restart agent",
    );
    expect(restartButton.props.disabled).toBe(true);

    const renderedText = tree?.root
      .findAllByType("span")
      .map((node) => node.children.join(""))
      .join("\n");
    expect(renderedText).toContain("Restarting...");

    const pauseResumeButton = tree?.root.find(
      (node) => node.type === "button" && node.props.title === "Pause autonomy",
    );
    expect(pauseResumeButton.props.disabled).toBe(true);
  });

  it("renders aria labels for icon-only controls", async () => {
    mockUseApp.mockReturnValue({
      ...baseAppState,
      walletAddresses: {
        evmAddress: "0x1234567890abcdef1234567890abcdef12345678",
        solanaAddress: "So1anaAddress1111111111111111111111111111111",
      },
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Header));
    });

    const pauseResumeButton = tree?.root.find(
      (node) =>
        node.type === "button" && node.props["aria-label"] === "Pause autonomy",
    );
    expect(pauseResumeButton.props["aria-label"]).toBe("Pause autonomy");

    const restartButton = tree?.root.find(
      (node) =>
        node.type === "button" && node.props["aria-label"] === "Restart agent",
    );
    expect(restartButton.props["aria-label"]).toBe("Restart agent");

    const walletButton = tree?.root.find(
      (node) =>
        node.type === "button" && node.props["aria-label"] === "Open wallets",
    );
    expect(walletButton.props["aria-label"]).toBe("Open wallets");
  });
});
