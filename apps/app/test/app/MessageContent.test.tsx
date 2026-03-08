import React from "react";
import TestRenderer from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — MessageContent uses useApp() and client internally
// ---------------------------------------------------------------------------

vi.mock("../../src/AppContext", () => ({
  useApp: () => ({
    agentStatus: { agentName: "Milady" },
    setState: vi.fn(),
  }),
  getVrmPreviewUrl: () => null,
}));

vi.mock("../../src/api-client", () => ({
  client: {
    getConfig: vi.fn(async () => ({})),
    getPluginList: vi.fn(async () => []),
  },
}));

import { MessageContent } from "../../src/components/MessageContent";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderText(text: string): string {
  let tree!: TestRenderer.ReactTestRenderer;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      React.createElement(MessageContent, {
        message: { id: "m1", role: "assistant", text, timestamp: 1 },
      }),
    );
  });

  // Collect all text content from the rendered tree
  function collectText(node: TestRenderer.ReactTestInstance): string {
    return node.children
      .map((child) =>
        typeof child === "string"
          ? child
          : collectText(child as TestRenderer.ReactTestInstance),
      )
      .join("");
  }

  return collectText(tree.root).trim();
}

// ---------------------------------------------------------------------------
// Tests — XML stripping regression
// ---------------------------------------------------------------------------

describe("MessageContent — XML action stripping", () => {
  it("strips <actions> XML from message text", () => {
    const text =
      'Here is my response <actions><action name="DO_THING"><params>{"key":"val"}</params></action></actions>';
    const rendered = renderText(text);
    expect(rendered).toBe("Here is my response");
    expect(rendered).not.toContain("<actions>");
  });

  it("strips <params> XML from message text", () => {
    const text =
      'Some text <params>{"repo":"https://github.com/test"}</params>';
    const rendered = renderText(text);
    expect(rendered).toBe("Some text");
    expect(rendered).not.toContain("<params>");
  });

  it("renders empty for message containing only XML", () => {
    const text =
      '<actions><action name="START_CODING_TASK"><params>{"task":"fix bug"}</params></action></actions>';
    const rendered = renderText(text);
    expect(rendered).toBe("");
  });

  it("preserves message text with no XML", () => {
    const text = "Hello, how can I help you today?";
    const rendered = renderText(text);
    expect(rendered).toBe("Hello, how can I help you today?");
  });
});
