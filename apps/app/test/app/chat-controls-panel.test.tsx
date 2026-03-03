import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/components/ChatAvatar", () => ({
  ChatAvatar: () => React.createElement("div", { "data-testid": "avatar" }),
}));

import { ChatControlsPanel } from "../../src/components/ChatControlsPanel";

function renderPanel(overrides = {}) {
  const props = {
    mobile: false,
    chatAvatarVisible: true,
    chatAvatarSpeaking: false,
    chatAgentVoiceMuted: false,
    setState: vi.fn(),
    ...overrides,
  };
  let tree: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    tree = TestRenderer.create(React.createElement(ChatControlsPanel, props));
  });
  if (!tree) throw new Error("Failed to create test renderer");
  return tree;
}

function findToggle(tree: TestRenderer.ReactTestRenderer) {
  return tree.root.findAll(
    (node) =>
      node.type === "button" && node.props.className?.includes("uppercase"),
  )[0];
}

describe("ChatControlsPanel", () => {
  it("renders expanded by default with avatar visible", () => {
    const tree = renderPanel();
    const avatar = tree.root.findAllByProps({ "data-testid": "avatar" });
    expect(avatar.length).toBe(1);
  });

  it("collapses when the toggle button is clicked", () => {
    const tree = renderPanel();
    const toggle = findToggle(tree);
    expect(toggle).toBeDefined();

    // Click to collapse
    act(() => {
      toggle.props.onClick();
    });

    // Avatar should no longer be rendered
    const avatar = tree.root.findAllByProps({ "data-testid": "avatar" });
    expect(avatar.length).toBe(0);
  });

  it("expands again when toggle is clicked a second time", () => {
    const tree = renderPanel();
    const toggle = findToggle(tree);

    // Collapse
    act(() => {
      toggle.props.onClick();
    });

    // Expand
    act(() => {
      findToggle(tree).props.onClick();
    });

    const avatar = tree.root.findAllByProps({ "data-testid": "avatar" });
    expect(avatar.length).toBe(1);
  });
});
