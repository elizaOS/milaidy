import React, { act } from "react";
import TestRenderer from "react-test-renderer";
import { describe, expect, it } from "vitest";
import {
  renderMarkdown,
  sanitizeMarkdownHref,
} from "../../src/components/WorkspaceNotesMarkdown";

type TestInstance = TestRenderer.ReactTestInstance;

function flattenText(node: TestInstance): string {
  return node.children
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      return flattenText(child as TestInstance);
    })
    .join("");
}

describe("WorkspaceNotesMarkdown", () => {
  it("allows safe link protocols", () => {
    expect(sanitizeMarkdownHref("https://example.com/test")).toBe(
      "https://example.com/test",
    );
    expect(sanitizeMarkdownHref("http://example.com")).toBe("http://example.com");
    expect(sanitizeMarkdownHref("mailto:test@example.com")).toBe(
      "mailto:test@example.com",
    );
  });

  it("rejects unsafe link protocols", () => {
    expect(sanitizeMarkdownHref("javascript:alert(1)")).toBeNull();
    expect(sanitizeMarkdownHref("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(sanitizeMarkdownHref("vbscript:msgbox(1)")).toBeNull();
  });

  it("renders markdown preview and strips unsafe links", () => {
    let safe: TestRenderer.ReactTestRenderer;
    act(() => {
      safe = TestRenderer.create(
        React.createElement(
          "div",
          null,
          renderMarkdown("## Heading\n\nVisit [good](https://example.com) and [bad](javascript:alert(1))"),
        ),
      );
    });
    const links = safe.root.findAll((node) => node.type === "a");
    expect(links).toHaveLength(1);
    expect(links[0].props.href).toBe("https://example.com");

    let unsafe: TestRenderer.ReactTestRenderer;
    act(() => {
      unsafe = TestRenderer.create(
        React.createElement(
          "div",
          null,
          renderMarkdown("[bad](javascript:alert(1)) and [email](mailto:test@example.com)"),
        ),
      );
    });
    const markdownText = flattenText(unsafe.root);
    expect(markdownText).toContain("[bad](javascript:alert(1))");
    expect(markdownText).toContain("email");
  });
});
