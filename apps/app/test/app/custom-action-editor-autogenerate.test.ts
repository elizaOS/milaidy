import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    generateCustomAction: vi.fn(),
  },
}));

vi.mock("../../src/api-client", () => ({
  client: mockClient,
}));

import { CustomActionEditor } from "../../src/components/CustomActionEditor";

function nodeText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : nodeText(child as TestRenderer.ReactTestInstance)))
    .join("");
}

function findInputByPlaceholder(
  root: TestRenderer.ReactTestRenderer,
  type: string,
  placeholder: string,
): TestRenderer.ReactTestInstance {
  const matches = root.root.findAll(
    (node) => node.type === type && node.props.placeholder === placeholder,
  );
  expect(matches.length).toBeGreaterThan(0);
  return matches[0];
}

describe("CustomActionEditor seeded generation", () => {
  const onSave = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    mockClient.generateCustomAction.mockReset();
    onSave.mockReset();
    onClose.mockReset();
  });

  it("auto-generates when seeded and fills handler fields", async () => {
    mockClient.generateCustomAction.mockResolvedValue({
      ok: true,
      generated: {
        name: "lookup weather",
        description: "Lookup a city weather summary",
        handlerType: "http",
        handler: {
          type: "http",
          method: "POST",
          url: "https://api.weather.test/v1/{{city}}",
          headers: {
            Authorization: "Bearer {{apiKey}}",
          },
          bodyTemplate: "{\"city\":\"{{city}}\"}",
        },
        parameters: [
          { name: "city", description: "Location to look up", required: true },
        ],
      },
    });

    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(CustomActionEditor, {
          open: true,
          seedPrompt: "Build a weather lookup action",
          onSave,
          onClose,
          action: undefined,
        }),
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 140));
    });

    expect(mockClient.generateCustomAction).toHaveBeenCalledTimes(1);
    expect(mockClient.generateCustomAction).toHaveBeenCalledWith(
      "Build a weather lookup action",
    );

    const nameInput = findInputByPlaceholder(tree!, "input", "MY_ACTION");
    const descriptionInput = tree!.root.findAll(
      (node) =>
        node.type === "textarea" && node.props.placeholder === "What does this action do?",
    )[0];
    const urlInput = tree!.root.findAll(
      (node) =>
        node.type === "input" &&
        node.props.placeholder === "https://api.example.com/{{param}}",
    )[0];

    expect(nameInput.props.value).toBe("LOOKUP_WEATHER");
    expect(descriptionInput.props.value).toBe("Lookup a city weather summary");
    expect(urlInput.props.value).toBe("https://api.weather.test/v1/{{city}}");

    const paramInput = tree!.root.findAll(
      (node) => node.type === "input" && node.props.placeholder === "paramName",
    )[0];
    expect(paramInput.props.value).toBe("city");
  });
});
