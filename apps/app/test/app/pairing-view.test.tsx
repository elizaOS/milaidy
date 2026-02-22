import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

import { PairingView } from "../../src/components/PairingView";

function createContext(overrides?: Record<string, unknown>) {
  return {
    pairingEnabled: true,
    pairingExpiresAt: null,
    pairingCodeInput: "",
    pairingError: null,
    pairingBusy: false,
    handlePairingSubmit: vi.fn(async () => {}),
    setState: vi.fn(),
    ...(overrides ?? {}),
  };
}

describe("PairingView", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
  });

  it("shows actionable next steps and docs link when pairing is disabled", async () => {
    mockUseApp.mockReturnValue(createContext({ pairingEnabled: false }));

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PairingView));
    });
    if (!tree) throw new Error("failed to render PairingView");

    const bodyText = tree.root
      .findAllByType("p")
      .map((p) => p.children.join(""));
    expect(bodyText.join(" ")).toContain(
      "Pairing is not enabled on this server.",
    );
    expect(bodyText.join(" ")).toContain("Next steps:");

    const listItems = tree.root
      .findAllByType("li")
      .map((li) => li.children.join(""));
    expect(listItems).toContain("Ask the server owner for an API token.");
    expect(listItems).toContain(
      "Enable pairing on the server and restart Milady.",
    );

    const docsLink = tree.root.findByType("a");
    expect(docsLink.props.href).toContain(
      "docs/api-reference.mdx#authenticate-via-pairing-code",
    );
    expect(docsLink.children.join("")).toBe("Pairing setup docs");
  });

  it("does not show disabled guidance while pairing is enabled", async () => {
    mockUseApp.mockReturnValue(createContext({ pairingEnabled: true }));

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PairingView));
    });
    if (!tree) throw new Error("failed to render PairingView");

    expect(tree.root.findAllByType("a")).toHaveLength(0);
    expect(tree.root.findAllByType("li")).toHaveLength(0);
  });
});
