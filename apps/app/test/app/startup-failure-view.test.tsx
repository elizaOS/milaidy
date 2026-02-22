import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { StartupFailureView } from "../../src/components/StartupFailureView";

describe("StartupFailureView", () => {
  it("renders details and triggers retry", async () => {
    const onRetry = vi.fn();
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(StartupFailureView, {
          error: {
            reason: "backend-unreachable",
            phase: "starting-backend",
            message: "Backend unavailable",
            detail: "/api/status - HTTP 404 - Not found",
            status: 404,
            path: "/api/status",
          },
          onRetry,
        }),
      );
    });

    if (!tree) throw new Error("failed to render StartupFailureView");

    const heading = tree.root.findByType("h1").children.join("");
    const body = tree.root.findAllByType("p")[0]?.children.join("") ?? "";
    expect(body).toContain("Backend unavailable");
    expect(heading).toContain("Backend Unreachable");

    const retryButton = tree.root.findByType("button");
    await act(async () => {
      retryButton.props.onClick();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
