// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/AppContext", () => ({
  useApp: () => ({
    commandPaletteOpen: false,
    commandQuery: "",
    commandActiveIndex: 0,
    setState: vi.fn(),
    agentStatus: null,
    handleStart: vi.fn(),
    handlePauseResume: vi.fn(),
    handleRestart: vi.fn(),
    handleExport: vi.fn(),
    activeGameViewerUrl: "",
    setTab: vi.fn(),
    openEmotePicker: false,
    emotePickerFilter: "",
    emoteList: [],
    playEmote: vi.fn(),
    memoryDebugOpen: false,
    memoryDebugItems: [],
    bugReportOpen: false,
    restartBannerVisible: false,
    lifecycleBusy: false,
    lifecycleAction: null,
  }),
}));

vi.mock("../../src/components/CommandPalette", () => ({
  CommandPalette: () => React.createElement("div", { "data-testid": "command-palette" }),
}));
vi.mock("../../src/components/EmotePicker", () => ({
  EmotePicker: () => React.createElement("div", { "data-testid": "emote-picker" }),
}));
vi.mock("../../src/components/RestartBanner", () => ({
  RestartBanner: () => React.createElement("div", { "data-testid": "restart-banner" }),
}));
vi.mock("../../src/components/MemoryDebugPanel", () => ({
  MemoryDebugPanel: () => React.createElement("div", { "data-testid": "memory-debug" }),
}));
vi.mock("../../src/components/BugReportModal", () => ({
  BugReportModal: () => React.createElement("div", { "data-testid": "bug-report" }),
}));
vi.mock("../../src/components/ShortcutsOverlay", () => ({
  ShortcutsOverlay: () => React.createElement("div", { "data-testid": "shortcuts-overlay" }),
}));

import { ShellOverlays } from "../../src/components/ShellOverlays";

describe("ShellOverlays", () => {
  it("renders all overlay components", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ShellOverlays actionNotice={null} />,
      );
    });
    const root = tree!.root;
    expect(root.findByProps({ "data-testid": "command-palette" })).toBeTruthy();
    expect(root.findByProps({ "data-testid": "emote-picker" })).toBeTruthy();
    expect(root.findByProps({ "data-testid": "restart-banner" })).toBeTruthy();
    expect(root.findByProps({ "data-testid": "memory-debug" })).toBeTruthy();
    expect(root.findByProps({ "data-testid": "bug-report" })).toBeTruthy();
    expect(root.findByProps({ "data-testid": "shortcuts-overlay" })).toBeTruthy();
  });

  it("does not render toast when actionNotice is null", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ShellOverlays actionNotice={null} />,
      );
    });
    const fixedDivs = tree!.root.findAll(
      (node) =>
        node.type === "div" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("fixed"),
    );
    expect(fixedDivs).toHaveLength(0);
  });

  it("renders action notice toast when provided", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ShellOverlays actionNotice={{ text: "Copied!", tone: "success" }} />,
      );
    });
    const fixedDivs = tree!.root.findAll(
      (node) =>
        node.type === "div" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("fixed"),
    );
    expect(fixedDivs.length).toBeGreaterThan(0);
  });

  it("applies bg-danger class for error tone", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ShellOverlays actionNotice={{ text: "Failed!", tone: "error" }} />,
      );
    });
    const toast = tree!.root.findAll(
      (node) =>
        node.type === "div" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("fixed"),
    )[0];
    expect(toast.props.className).toContain("bg-danger");
  });

  it("applies bg-ok class for success tone", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ShellOverlays actionNotice={{ text: "Done!", tone: "success" }} />,
      );
    });
    const toast = tree!.root.findAll(
      (node) =>
        node.type === "div" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("fixed"),
    )[0];
    expect(toast.props.className).toContain("bg-ok");
  });
});
