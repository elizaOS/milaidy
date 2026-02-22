import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { SaveCommandModal } from "../../src/components/SaveCommandModal";

function textContent(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : ""))
    .join("")
    .trim();
}

describe("SaveCommandModal keyboard behavior", () => {
  it("does not close the modal when Enter is pressed in the name input", () => {
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

    const input = tree.root.findByType("input");
    act(() => {
      input.props.onKeyDown({ key: "Enter" });
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    const errorNode = tree.root.find(
      (node) => node.type === "p" && textContent(node) === "Name is required",
    );
    expect(textContent(errorNode)).toBe("Name is required");
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
