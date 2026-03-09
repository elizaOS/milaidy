// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("lucide-react", () => ({
  X: () => React.createElement("span", null, "X"),
}));

import { ShortcutsOverlay } from "../../src/components/ShortcutsOverlay";

function fireKey(
  key: string,
  opts: Partial<KeyboardEventInit> = {},
): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, ...opts }),
  );
}

describe("ShortcutsOverlay", () => {
  it("renders nothing when closed", () => {
    const tree = TestRenderer.create(<ShortcutsOverlay />);
    expect(tree.toJSON()).toBeNull();
  });

  it("opens on Shift+?", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<ShortcutsOverlay />);
    });
    act(() => {
      fireKey("?", { shiftKey: true });
    });
    const root = tree!.root;
    const dialog = root.findByProps({ role: "dialog" });
    expect(dialog).toBeTruthy();
    expect(dialog.props["aria-label"]).toBe("Keyboard shortcuts");
  });

  it("closes on Escape", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<ShortcutsOverlay />);
    });
    // Open
    act(() => {
      fireKey("?", { shiftKey: true });
    });
    expect(tree!.root.findAllByProps({ role: "dialog" })).toHaveLength(1);
    // Close
    act(() => {
      fireKey("Escape");
    });
    expect(tree!.toJSON()).toBeNull();
  });

  it("closes on close button click", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<ShortcutsOverlay />);
    });
    act(() => {
      fireKey("?", { shiftKey: true });
    });
    const closeBtn = tree!.root.findByProps({ "aria-label": "Close" });
    act(() => {
      closeBtn.props.onClick();
    });
    expect(tree!.toJSON()).toBeNull();
  });

  it("renders shortcut groups with descriptions and keys", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<ShortcutsOverlay />);
    });
    act(() => {
      fireKey("?", { shiftKey: true });
    });
    // Should contain at least one kbd element
    const kbds = tree!.root.findAllByType("kbd");
    expect(kbds.length).toBeGreaterThan(0);
  });
});
