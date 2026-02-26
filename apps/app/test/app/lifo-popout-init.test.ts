// @vitest-environment jsdom

import React, { useEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tab } from "../../src/navigation";

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    getStatus: vi.fn(async () => ({ state: "running" })),
    connectWs: vi.fn(),
    onWsEvent: vi.fn(() => () => {}),
    getAgentEvents: vi.fn(async () => ({ events: [] })),
    disconnectWs: vi.fn(),
  },
}));

vi.mock("../../src/api-client", () => ({
  client: mockClient,
  SkillScanReportSummary: {},
}));

import { AppProvider, useApp } from "../../src/AppContext";

interface StartupSnapshot {
  tab: Tab;
  onboardingLoading: boolean;
  onboardingComplete: boolean;
}

function Probe(props: { onChange: (snapshot: StartupSnapshot) => void }) {
  const app = useApp();
  useEffect(() => {
    props.onChange({
      tab: app.tab,
      onboardingLoading: app.onboardingLoading,
      onboardingComplete: app.onboardingComplete,
    });
  }, [app.tab, app.onboardingLoading, app.onboardingComplete, props.onChange]);
  return null;
}

describe("lifo popout startup", () => {
  beforeEach(() => {
    Object.assign(document.documentElement, { setAttribute: vi.fn() });
    mockClient.getStatus.mockClear();
    mockClient.connectWs.mockClear();
    mockClient.onWsEvent.mockClear();
    mockClient.getAgentEvents.mockClear();
    mockClient.disconnectWs.mockClear();
    window.history.pushState({}, "", "/lifo?popout=lifo");
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("boots in lifo tab and skips onboarding gates", async () => {
    let latest: StartupSnapshot | null = null;
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          AppProvider,
          null,
          React.createElement(Probe, {
            onChange: (snapshot) => {
              latest = snapshot;
            },
          }),
        ),
      );
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latest).not.toBeNull();
    expect(latest?.tab).toBe("lifo");
    expect(latest?.onboardingLoading).toBe(false);
    expect(latest?.onboardingComplete).toBe(true);
    expect(mockClient.getStatus).toHaveBeenCalled();
    expect(mockClient.connectWs).toHaveBeenCalledTimes(1);
    expect(mockClient.onWsEvent).toHaveBeenCalledTimes(3);
    expect(mockClient.getAgentEvents).toHaveBeenCalled();

    await act(async () => {
      tree?.unmount();
    });
  });
});
