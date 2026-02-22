import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { SaveCommandModal } from "../../src/components/SaveCommandModal";

describe("SaveCommandModal keyboard behavior", () => {
  it("does not close on Enter or Space from the backdrop keydown handler", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(SaveCommandModal, {
          open: true,
          text: "echo hello",
          onSave,
          onClose,
        }),
      );
    });

    const dialog = tree.root.findByProps({ role: "dialog" });
    const enterPreventDefault = vi.fn();
    const spacePreventDefault = vi.fn();
    act(() => {
      dialog.props.onKeyDown({ key: "Enter", preventDefault: enterPreventDefault });
      dialog.props.onKeyDown({ key: " ", preventDefault: spacePreventDefault });
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(enterPreventDefault).not.toHaveBeenCalled();
    expect(spacePreventDefault).not.toHaveBeenCalled();
  });

  it("closes on Escape from the backdrop keydown handler", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(SaveCommandModal, {
          open: true,
          text: "echo hello",
          onSave,
          onClose,
        }),
      );
    });

    const dialog = tree.root.findByProps({ role: "dialog" });
    const preventDefault = vi.fn();
    act(() => {
      dialog.props.onKeyDown({ key: "Escape", preventDefault });
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
