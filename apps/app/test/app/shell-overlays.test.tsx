import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/components/BugReportModal", () => ({
  BugReportModal: () => React.createElement("div", null, "BugReportModal"),
}));

vi.mock("../../src/components/CommandPalette", () => ({
  CommandPalette: () => React.createElement("div", null, "CommandPalette"),
}));

vi.mock("../../src/components/EmotePicker", () => ({
  EmotePicker: () => React.createElement("div", null, "EmotePicker"),
}));

vi.mock("../../src/components/MemoryDebugPanel", () => ({
  MemoryDebugPanel: () => React.createElement("div", null, "MemoryDebugPanel"),
}));

vi.mock("../../src/components/RestartBanner", () => ({
  RestartBanner: () => React.createElement("div", null, "RestartBanner"),
}));

vi.mock("../../src/components/ShortcutsOverlay", () => ({
  ShortcutsOverlay: () => React.createElement("div", null, "ShortcutsOverlay"),
}));

import { ShellOverlays } from "../../src/components/ShellOverlays";

describe("ShellOverlays", () => {
  it("renders the shared overlay components once", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ShellOverlays, { actionNotice: null }),
    );

    expect(markup).toContain("CommandPalette");
    expect(markup).toContain("EmotePicker");
    expect(markup).toContain("RestartBanner");
    expect(markup).toContain("MemoryDebugPanel");
    expect(markup).toContain("BugReportModal");
    expect(markup).toContain("ShortcutsOverlay");
  });

  it.each([
    [{ text: "Saved", tone: "success" }, "bg-ok"],
    [{ text: "Failed", tone: "error" }, "bg-danger"],
    [{ text: "Working", tone: "info" }, "bg-accent"],
  ])("maps %o action notices to the expected tone class", (actionNotice, expectedClass) => {
    const markup = renderToStaticMarkup(
      React.createElement(ShellOverlays, { actionNotice }),
    );

    expect(markup).toContain(actionNotice.text);
    expect(markup).toContain(expectedClass);
  });
});
