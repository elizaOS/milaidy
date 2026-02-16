import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

function nodeText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : nodeText(child as TestRenderer.ReactTestInstance)))
    .join("");
}

function findButtonByLabel(
  root: TestRenderer.ReactTestInstance,
  label: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll((node) => node.type === "button" && nodeText(node) === label);
  expect(matches.length).toBeGreaterThan(0);
  return matches[0];
}

function findTextAreaByPlaceholder(
  root: TestRenderer.ReactTestInstance,
  placeholder: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) => node.type === "textarea" && node.props.placeholder === placeholder,
  );
  expect(matches.length).toBeGreaterThan(0);
  return matches[0];
}

function mockStorage(): void {
  localStorage.setItem("milaidy:workspace-notes", "[]");
}

import { WorkspaceNotesPanel } from "../../src/components/WorkspaceNotesPanel";

describe("WorkspaceNotesPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("loads seeded content, switches to split mode, and forwards note actions", async () => {
    const onCreateActionFromNote = vi.fn();
    const onCreateSkillFromNote = vi.fn().mockResolvedValue(undefined);
    mockStorage();

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(WorkspaceNotesPanel, {
          open: true,
          mode: "edit",
          seedText: "## Skill Draft\n- Inputs:\n- Output:",
          onClose: vi.fn(),
          onCreateActionFromNote,
          onCreateSkillFromNote,
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const root = tree!.root;
    const editor = findTextAreaByPlaceholder(
      root,
      "Capture workspace notes, action ideas, skill specs...",
    );
    expect(editor.props.value).toContain("## Skill Draft");
    expect(editor.props.value).toContain("- Inputs:");

    const createActionButton = findButtonByLabel(root, "Create Custom Action Prompt");
    const createSkillButton = findButtonByLabel(root, "Create Skill");

    await act(async () => {
      createActionButton.props.onClick();
      createSkillButton.props.onClick();
      await Promise.resolve();
    });

    expect(onCreateActionFromNote).toHaveBeenCalledWith(
      expect.stringContaining("## Skill Draft"),
      expect.any(String),
    );
    expect(onCreateSkillFromNote).toHaveBeenCalledWith(
      expect.stringContaining("## Skill Draft"),
      expect.any(String),
    );

    const splitButton = findButtonByLabel(root, "Split");
    await act(async () => {
      splitButton.props.onClick();
    });

    expect(root.findAll((node) => node.type === "textarea")).toHaveLength(1);
    const heading = root.findAll(
      (node) => node.type === "h2" && nodeText(node) === "Skill Draft",
    );
    expect(heading.length).toBe(1);
  });

  it("supports markdown toolbar actions and preview mode", async () => {
    const onCreateActionFromNote = vi.fn();
    const onCreateSkillFromNote = vi.fn().mockResolvedValue(undefined);
    mockStorage();

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(WorkspaceNotesPanel, {
          open: true,
          mode: "edit",
          onClose: vi.fn(),
          onCreateActionFromNote,
          onCreateSkillFromNote,
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const root = tree!.root;
    const editor = findTextAreaByPlaceholder(
      root,
      "Capture workspace notes, action ideas, skill specs...",
    );
    const h1Button = findButtonByLabel(root, "H1");
    const skillTemplateButton = findButtonByLabel(root, "+ Skill");
    const previewButton = findButtonByLabel(root, "Preview");
    const editButton = findButtonByLabel(root, "Edit");

    await act(async () => {
      editor.props.onChange({ target: { value: "capture ideas" } });
      h1Button.props.onClick();
      skillTemplateButton.props.onClick();
    });

    const editorWithTemplate = root.findAll(
      (node) =>
        node.type === "textarea" &&
        node.props.placeholder ===
          "Capture workspace notes, action ideas, skill specs...",
    )[0] as TestRenderer.ReactTestInstance;
    expect(editorWithTemplate.props.value).toContain("## Skill Intent");
    expect(editorWithTemplate.props.value).toContain("capture ideas");

    await act(async () => {
      previewButton.props.onClick();
    });
    expect(root.findAll((node) => node.type === "textarea")).toHaveLength(0);

    const renderNode = root.findAll(
      (node) => node.type === "div" && nodeText(node).includes("Skill Intent"),
    );
    expect(renderNode.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      editButton.props.onClick();
    });
    expect(root.findAll((node) => node.type === "textarea")).toHaveLength(1);
  });
});
