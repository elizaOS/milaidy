// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import {
  ConfirmModal,
  useConfirm,
} from "../../src/components/shared/ConfirmModal";

describe("ConfirmModal", () => {
  it("renders nothing when closed", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ConfirmModal
          open={false}
          message="Delete this?"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
    });
    expect(tree!.toJSON()).toBeNull();
  });

  it("renders dialog when open", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ConfirmModal
          open={true}
          title="Delete item"
          message="Are you sure?"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
    });
    const dialog = tree!.root.findByProps({ role: "dialog" });
    expect(dialog.props["aria-modal"]).toBe("true");
    expect(dialog.props["aria-label"]).toBe("Delete item");
  });

  it("calls onConfirm when confirm button clicked", () => {
    const onConfirm = vi.fn();
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ConfirmModal
          open={true}
          message="Delete?"
          confirmLabel="Yes"
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />,
      );
    });
    const btn = tree!.root.findAll(
      (node) =>
        node.type === "button" &&
        node.children.some((c) => c === "Yes"),
    )[0];
    act(() => btn.props.onClick());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when cancel button clicked", () => {
    const onCancel = vi.fn();
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ConfirmModal
          open={true}
          message="Delete?"
          cancelLabel="No"
          onConfirm={vi.fn()}
          onCancel={onCancel}
        />,
      );
    });
    const btn = tree!.root.findAll(
      (node) =>
        node.type === "button" &&
        node.children.some((c) => c === "No"),
    )[0];
    act(() => btn.props.onClick());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on backdrop click", () => {
    const onCancel = vi.fn();
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ConfirmModal
          open={true}
          message="Delete?"
          onConfirm={vi.fn()}
          onCancel={onCancel}
        />,
      );
    });
    const backdrop = tree!.root.findByProps({ role: "dialog" });
    act(() => {
      backdrop.props.onClick({ target: "same", currentTarget: "same" });
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("applies danger tone class to confirm button", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ConfirmModal
          open={true}
          message="Delete?"
          tone="danger"
          confirmLabel="Delete"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
    });
    const btn = tree!.root.findAll(
      (node) =>
        node.type === "button" &&
        node.children.some((c) => c === "Delete"),
    )[0];
    expect(btn.props.className).toContain("bg-danger");
  });
});

describe("useConfirm", () => {
  function TestHarness({
    onResult,
  }: {
    onResult: (v: boolean) => void;
  }) {
    const { confirm, modalProps } = useConfirm();
    return (
      <div>
        <button
          type="button"
          data-testid="trigger"
          onClick={() => void confirm({ message: "Sure?" }).then(onResult)}
        />
        <ConfirmModal {...modalProps} />
      </div>
    );
  }

  it("resolves true on confirm", async () => {
    const onResult = vi.fn();
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<TestHarness onResult={onResult} />);
    });
    // Trigger confirm
    act(() => {
      tree!.root.findByProps({ "data-testid": "trigger" }).props.onClick();
    });
    // Modal should be open
    const dialog = tree!.root.findByProps({ role: "dialog" });
    expect(dialog).toBeTruthy();
    // Click confirm
    const confirmBtn = tree!.root.findAll(
      (node) =>
        node.type === "button" &&
        node.children.some((c) => c === "Confirm"),
    )[0];
    await act(async () => {
      confirmBtn.props.onClick();
      await Promise.resolve();
    });
    expect(onResult).toHaveBeenCalledWith(true);
  });

  it("resolves false on cancel", async () => {
    const onResult = vi.fn();
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<TestHarness onResult={onResult} />);
    });
    act(() => {
      tree!.root.findByProps({ "data-testid": "trigger" }).props.onClick();
    });
    const cancelBtn = tree!.root.findAll(
      (node) =>
        node.type === "button" &&
        node.children.some((c) => c === "Cancel"),
    )[0];
    await act(async () => {
      cancelBtn.props.onClick();
      await Promise.resolve();
    });
    expect(onResult).toHaveBeenCalledWith(false);
  });
});
