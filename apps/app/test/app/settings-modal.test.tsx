import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "../../src/components/SettingsView";

function renderModal(onClose: () => void) {
  return TestRenderer.create(
    React.createElement(
      Modal,
      {
        open: true,
        onClose,
        title: "Test Modal",
      },
      React.createElement("div", null, "body"),
    ),
  );
}

describe("Settings modal keyboard handling", () => {
  it("closes on Escape", () => {
    const onClose = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = renderModal(onClose);
    });

    const dialog = tree.root.findByProps({ role: "dialog" });
    const preventDefault = vi.fn();
    act(() => {
      dialog.props.onKeyDown({ key: "Escape", preventDefault });
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on Enter or Space", () => {
    const onClose = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = renderModal(onClose);
    });

    const dialog = tree.root.findByProps({ role: "dialog" });
    act(() => {
      dialog.props.onKeyDown({ key: "Enter", preventDefault: vi.fn() });
      dialog.props.onKeyDown({ key: " ", preventDefault: vi.fn() });
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
