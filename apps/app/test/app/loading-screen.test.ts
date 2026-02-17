import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it } from "vitest";

import { LoadingScreen } from "../../src/components/LoadingScreen";

function renderedText(tree: TestRenderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType("div")
    .map((node) => node.children.join(""))
    .join("\n");
}

describe("LoadingScreen", () => {
  it("shows backend startup label", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(LoadingScreen, { phase: "starting-backend" }),
      );
    });
    if (!tree) throw new Error("failed to render loading screen");

    expect(renderedText(tree)).toContain("starting backend");
  });

  it("shows agent initialization label", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(LoadingScreen, { phase: "initializing-agent" }),
      );
    });
    if (!tree) throw new Error("failed to render loading screen");

    expect(renderedText(tree)).toContain("initializing agent");
  });
});
