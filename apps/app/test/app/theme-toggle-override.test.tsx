// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "../../src/components/ThemeToggle";

describe("ThemeToggle override", () => {
  it.each([
    {
      currentTheme: "dark" as const,
      expectedNextTheme: "light" as const,
      expectedThemeAttr: "dark",
      visibleIconTestId: "theme-toggle-moon-icon",
      hiddenIconTestId: "theme-toggle-sun-icon",
    },
    {
      currentTheme: "light" as const,
      expectedNextTheme: "dark" as const,
      expectedThemeAttr: "light",
      visibleIconTestId: "theme-toggle-sun-icon",
      hiddenIconTestId: "theme-toggle-moon-icon",
    },
  ])("shows the current theme state for $currentTheme and toggles to $expectedNextTheme", async ({
    currentTheme,
    expectedNextTheme,
    expectedThemeAttr,
    visibleIconTestId,
    hiddenIconTestId,
  }) => {
    const setUiTheme = vi.fn();

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ThemeToggle, {
          uiTheme: currentTheme,
          setUiTheme,
        }),
      );
    });

    const button = tree.root.findByProps({ "data-testid": "theme-toggle" });

    expect(button.props["data-current-theme"]).toBe(expectedThemeAttr);
    expect(
      tree.root.findAllByProps({ "data-testid": visibleIconTestId }),
    ).toHaveLength(1);
    expect(
      tree.root.findAllByProps({ "data-testid": hiddenIconTestId }),
    ).toHaveLength(0);

    await act(async () => {
      button.props.onClick();
    });

    expect(setUiTheme).toHaveBeenCalledWith(expectedNextTheme);

    await act(async () => {
      tree.unmount();
    });
  });

  it("keeps the 44px hit target even when upstream passes shrinking size classes", async () => {
    const setUiTheme = vi.fn();

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ThemeToggle, {
          uiTheme: "dark",
          setUiTheme,
          className:
            "!h-10 !w-10 !min-h-10 !min-w-10 hidden sm:flex extra-class",
        }),
      );
    });

    const button = tree.root.findByProps({ "data-testid": "theme-toggle" });
    const className = String(button.props.className);

    expect(className).not.toContain("!h-10");
    expect(className).not.toContain("!w-10");
    expect(className).not.toContain("!min-h-10");
    expect(className).not.toContain("!min-w-10");
    expect(className).toContain("h-11");
    expect(className).toContain("min-h-[44px]");
    expect(className).toContain("min-w-[44px]");
    expect(className).toContain("hidden");
    expect(className).toContain("sm:flex");
    expect(className).toContain("extra-class");

    await act(async () => {
      tree.unmount();
    });
  });
});
