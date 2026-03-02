import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

import { Nav } from "../../src/components/Nav";

describe("Nav language switching", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
  });

  it("renders english labels by default", async () => {
    mockUseApp.mockReturnValue({
      tab: "chat",
      setTab: vi.fn(),
      uiLanguage: "en",
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Nav));
    });

    const text = tree!.root
      .findAllByType("button")
      .map((node) => node.children.join(""))
      .join(" ");
    expect(text).toContain("Chat");
    expect(text).toContain("Wallets");
    expect(text).toContain("Settings");
  });

  it("renders chinese labels when uiLanguage is zh-CN", async () => {
    mockUseApp.mockReturnValue({
      tab: "chat",
      setTab: vi.fn(),
      uiLanguage: "zh-CN",
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Nav));
    });

    const text = tree!.root
      .findAllByType("button")
      .map((node) => node.children.join(""))
      .join(" ");
    expect(text).toContain("聊天");
    expect(text).toContain("钱包");
    expect(text).toContain("设置");
  });

  it("hides companion tab in native shell mode", async () => {
    mockUseApp.mockReturnValue({
      tab: "chat",
      setTab: vi.fn(),
      uiLanguage: "en",
      uiShellMode: "native",
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Nav));
    });

    const text = tree!.root
      .findAllByType("button")
      .map((node) => node.children.join(""))
      .join(" ");
    expect(text).not.toContain("Companion");
    expect(text).toContain("Chat");
  });
});
